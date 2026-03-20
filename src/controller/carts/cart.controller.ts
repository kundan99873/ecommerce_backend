import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { cartProduct } from "./types.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";

const getProductCouponMap = async (productIds: number[]) => {
  if (productIds.length === 0) {
    return new Map<number, number>();
  }

  const now = new Date();

  const coupons = await prisma.coupon.findMany({
    where: {
      is_active: true,
      start_date: { lte: now },
      end_date: { gte: now },
      products: {
        some: {
          id: { in: productIds },
        },
      },
    },
    orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    select: {
      id: true,
      products: {
        where: {
          id: { in: productIds },
        },
        select: {
          id: true,
        },
      },
    },
  });

  const productCouponMap = new Map<number, number>();

  for (const coupon of coupons) {
    for (const product of coupon.products) {
      if (!productCouponMap.has(product.id)) {
        productCouponMap.set(product.id, coupon.id);
      }
    }
  }

  return productCouponMap;
};

const syncCartCoupon = async (cartId: number) => {
  const cartItems = await prisma.cartItem.findMany({
    where: { cart_id: cartId },
    select: {
      product_variant: {
        select: {
          product_id: true,
        },
      },
    },
  });

  const productIds = Array.from(
    new Set(cartItems.map((item) => item.product_variant.product_id)),
  );

  if (productIds.length === 0) {
    await prisma.cart.update({
      where: { id: cartId },
      data: { coupon_id: null },
    });
    return null;
  }

  const productCouponMap = await getProductCouponMap(productIds);
  const uniqueCouponIds = new Set(
    productIds
      .map((productId) => productCouponMap.get(productId) ?? null)
      .filter((couponId): couponId is number => couponId !== null),
  );

  if (uniqueCouponIds.size > 1) {
    throw new ApiError(
      400,
      "Cart has multiple coupons applied. Keep products under one coupon only.",
    );
  }

  const couponId =
    uniqueCouponIds.size === 1 ? Array.from(uniqueCouponIds)[0]! : null;

  await prisma.cart.update({
    where: { id: cartId },
    data: {
      coupon_id: couponId,
    },
  });

  return couponId;
};

const getCartDetails = async (userId: number) => {
  return prisma.cart.findUnique({
    where: { user_id: userId },
    select: {
      id: true,
      user_id: true,
      coupon_id: true,
      coupon: {
        select: {
          id: true,
          code: true,
          description: true,
          discount_type: true,
          discount_value: true,
          max_discount: true,
          min_purchase: true,
          start_date: true,
          end_date: true,
          is_active: true,
        },
      },
      created_at: true,
      updated_at: true,
      items: {
        select: {
          id: true,
          quantity: true,
          price: true,
          created_at: true,
          updated_at: true,
          product_variant: {
            select: {
              id: true,
              product_id: true,
              sku: true,
              stock: true,
              color: true,
              size: true,
              original_price: true,
              discounted_price: true,
              is_active: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  description: true,
                  brand: true,
                  category: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
              images: {
                select: {
                  id: true,
                  image_url: true,
                  is_primary: true,
                },
              },
            },
          },
        },
      },
    },
  });
};

const buildCartPayload = (cart: Awaited<ReturnType<typeof getCartDetails>>) => {
  if (!cart) {
    return null;
  }

  const items = cart.items.map((item) => {
    const subtotal = item.price * item.quantity;

    return {
      item_id: item.id,
      quantity: item.quantity,
      price: item.price,
      subtotal,
      created_at: item.created_at,
      updated_at: item.updated_at,
      product_variant: {
        id: item.product_variant.id,
        product_id: item.product_variant.product_id,
        sku: item.product_variant.sku,
        stock: item.product_variant.stock,
        color: item.product_variant.color,
        size: item.product_variant.size,
        original_price: item.product_variant.original_price,
        discounted_price: item.product_variant.discounted_price,
        is_active: item.product_variant.is_active,
        product: item.product_variant.product,
        images: item.product_variant.images,
      },
    };
  });

  const totalPrice = items.reduce((acc, item) => acc + item.subtotal, 0);

  return {
    id: cart.id,
    user_id: cart.user_id,
    coupon_id: cart.coupon_id,
    used_coupon: cart.coupon,
    items,
    total_price: totalPrice,
    total_items: items.length,
    created_at: cart.created_at,
    updated_at: cart.updated_at,
  };
};

const evaluateCouponForCart = async ({
  coupon,
  userId,
  cartProductIds,
  cartTotal,
}: {
  coupon: {
    id: number;
    start_date: Date;
    end_date: Date;
    min_purchase: number | null;
    max_uses: number | null;
    max_uses_per_user: number | null;
    is_global: boolean;
    products: { id: number }[];
    users: { id: number }[];
  };
  userId: number;
  cartProductIds: number[];
  cartTotal: number;
}) => {
  const now = new Date();
  const isWithinDate = now >= coupon.start_date && now <= coupon.end_date;

  const meetsMinPurchase =
    coupon.min_purchase == null || cartTotal >= coupon.min_purchase;

  const totalUsageCountPromise =
    coupon.max_uses == null
      ? Promise.resolve(0)
      : prisma.couponUsage.count({ where: { coupon_id: coupon.id } });

  const userUsageCountPromise =
    coupon.max_uses_per_user == null
      ? Promise.resolve(0)
      : prisma.couponUsage.count({
          where: { coupon_id: coupon.id, user_id: userId },
        });

  const [totalUsageCount, userUsageCount] = await Promise.all([
    totalUsageCountPromise,
    userUsageCountPromise,
  ]);

  const isUnderGlobalUsageLimit =
    coupon.max_uses == null || totalUsageCount < coupon.max_uses;
  const isUnderUserUsageLimit =
    coupon.max_uses_per_user == null ||
    userUsageCount < coupon.max_uses_per_user;

  const isUserEligible =
    coupon.users.length === 0 || coupon.users.some((u) => u.id === userId);

  const hasProductRestriction = coupon.products.length > 0;
  const allowedProductIds = new Set(coupon.products.map((p) => p.id));
  const hasEligibleProduct = cartProductIds.some((id) =>
    allowedProductIds.has(id),
  );
  const isProductEligible =
    coupon.is_global || !hasProductRestriction || hasEligibleProduct;

  return (
    isWithinDate &&
    meetsMinPurchase &&
    isUnderGlobalUsageLimit &&
    isUnderUserUsageLimit &&
    isUserEligible &&
    isProductEligible
  );
};

const addProductToCart = asyncHandler(async (req: Request, res: Response) => {
  const { slug: sku, quantity, coupon_id: rawCouponId } = req.body as cartProduct;

  const requestedCouponId =
    rawCouponId == null
      ? null
      : Number.isInteger(rawCouponId) && Number(rawCouponId) > 0
        ? Number(rawCouponId)
        : (() => {
            throw new ApiError(400, "coupon_id must be a positive integer");
          })();

  const userId = req.user!.user_id;

  if (!sku || !quantity || quantity <= 0) {
    throw new ApiError(400, "SKU and valid quantity are required");
  }

  const variant = await prisma.productVariant.findUnique({
    where: { sku },
    include: {
      product: true,
    },
  });

  if (!variant) {
    throw new ApiError(404, "Product variant not found");
  }

  if (!variant.is_active) {
    throw new ApiError(400, "Variant is not active");
  }

  if (variant.stock < quantity) {
    throw new ApiError(400, "Insufficient stock");
  }

  const cart = await prisma.cart.upsert({
    where: { user_id: userId },
    update: {},
    create: {
      user_id: userId,
    },
  });

  const existingItems = await prisma.cartItem.findMany({
    where: {
      cart_id: cart.id,
    },
    select: {
      product_variant: {
        select: {
          product_id: true,
        },
      },
    },
  });

  const cartProductIds = Array.from(
    new Set(existingItems.map((item) => item.product_variant.product_id)),
  );

  const allProductIds = Array.from(
    new Set([variant.product_id, ...cartProductIds]),
  );
  const productCouponMap = await getProductCouponMap(allProductIds);

  const incomingCouponId = productCouponMap.get(variant.product_id) ?? null;
  const existingCouponIds = new Set(
    cartProductIds
      .map((productId) => productCouponMap.get(productId) ?? null)
      .filter((couponId): couponId is number => couponId !== null),
  );

  if (existingCouponIds.size > 1) {
    throw new ApiError(
      400,
      "Cart has multiple coupons applied. Keep products under one coupon only.",
    );
  }

  if (
    incomingCouponId !== null &&
    existingCouponIds.size === 1 &&
    !existingCouponIds.has(incomingCouponId)
  ) {
    throw new ApiError(
      400,
      "Only one coupon can be applied per cart. Remove products with other coupon first.",
    );
  }

  const existingCouponId =
    existingCouponIds.size === 1 ? Array.from(existingCouponIds)[0]! : null;
  const cartCouponId = existingCouponId ?? incomingCouponId;

  if (requestedCouponId !== null && requestedCouponId !== cartCouponId) {
    throw new ApiError(
      400,
      "Provided coupon_id is not applicable for current cart products",
    );
  }

  if ((cart as { coupon_id?: number | null }).coupon_id !== cartCouponId) {
    await prisma.cart.update({
      where: { id: cart.id },
      data: {
        coupon_id: cartCouponId,
      },
    });
  }

  const existingCartItem = await prisma.cartItem.findUnique({
    where: {
      cart_id_product_variant_id: {
        cart_id: cart.id,
        product_variant_id: variant.id,
      },
    },
  });

  let cartItem;

  if (existingCartItem) {
    const newQuantity = existingCartItem.quantity + quantity;

    if (variant.stock < newQuantity) {
      throw new ApiError(400, "Insufficient stock");
    }

    cartItem = await prisma.cartItem.update({
      where: { id: existingCartItem.id },
      data: {
        quantity: newQuantity,
      },
    });
  } else {
    cartItem = await prisma.cartItem.create({
      data: {
        cart_id: cart.id,
        product_variant_id: variant.id,
        quantity,
        price: variant.discounted_price,
      },
    });
  }

  return res
    .status(200)
    .json(new ApiResponse("Product added to cart successfully", cartItem));
});

// const getCartProducts = asyncHandler(async (req: Request, res: Response) => {
const getCartProducts = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.user_id;

  const cart = await getCartDetails(userId);

  if (!cart) {
    return res.status(200).json(
      new ApiResponse("Cart is empty", {
        items: [],
        total_items: 0,
        total_price: 0,
        coupon_id: null,
        used_coupon: null,
      }),
    );
  }

  const formattedItems = cart.items.map((item) => {
    const subtotal = item.price * item.quantity;

    return {
      quantity: item.quantity,
      price: item.price,
      subtotal,
      name: item.product_variant.product.name,
      slug: item.product_variant.product.slug,
      sku: item.product_variant.sku,
      color: item.product_variant.color,
      size: item.product_variant.size,
      stock: item.product_variant.stock,
      image: item.product_variant.images[0]?.image_url ?? null,
    };
  });

  const cartSubtotal = formattedItems.reduce(
    (acc, item) => acc + item.subtotal,
    0,
  );

  return res.status(200).json(
    new ApiResponse("Cart items retrieved successfully", {
      items: formattedItems,
      total_items: formattedItems.length,
      total_price: cartSubtotal,
      coupon_id: cart.coupon_id,
      used_coupon: cart.coupon,
    }),
  );
});

const getUserCartCoupons = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.user_id;

  const cart = await getCartDetails(userId);

  if (!cart) {
    return res
      .status(200)
      .json(new ApiResponse("Coupons retrieved successfully", []));
  }

  const cartProductIds = Array.from(
    new Set(cart.items.map((item) => item.product_variant.product_id)),
  );
  const cartTotal = cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const coupons = await prisma.coupon.findMany({
    where: {
      is_active: true,
      OR: [
        { is_global: true },
        { users: { some: { id: userId } } },
        { products: { some: {} } },
      ],
    },
    orderBy: { updated_at: "desc" },
    select: {
      id: true,
      code: true,
      description: true,
      discount_type: true,
      discount_value: true,
      max_discount: true,
      min_purchase: true,
      start_date: true,
      end_date: true,
      max_uses: true,
      max_uses_per_user: true,
      is_global: true,
      products: {
        select: {
          id: true,
        },
      },
      users: {
        select: {
          id: true,
        },
      },
    },
  });

  const couponWithAvailability = await Promise.all(
    coupons.map(async (coupon) => {
      const isAvailable = await evaluateCouponForCart({
        coupon,
        userId,
        cartProductIds,
        cartTotal,
      });

      return {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        max_discount: coupon.max_discount,
        min_purchase: coupon.min_purchase,
        start_date: coupon.start_date,
        end_date: coupon.end_date,
        max_uses: coupon.max_uses,
        max_uses_per_user: coupon.max_uses_per_user,
        is_global: coupon.is_global,
        is_available: isAvailable,
        is_applied: cart.coupon_id === coupon.id,
      };
    }),
  );

  return res
    .status(200)
    .json(
      new ApiResponse("Coupons retrieved successfully", couponWithAvailability),
    );
});

const addCouponToCart = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.user_id;
  const { coupon_code } = req.body as { coupon_code?: string };

  if (!coupon_code) {
    throw new ApiError(400, "coupon_code is required");
  }

  const cart = await getCartDetails(userId);

  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, "Cart is empty");
  }

  const normalizedCouponCode = coupon_code.trim().toUpperCase();

  const coupon = await prisma.coupon.findUnique({
    where: { code: normalizedCouponCode },
    select: {
      id: true,
      code: true,
      start_date: true,
      end_date: true,
      min_purchase: true,
      max_uses: true,
      max_uses_per_user: true,
      is_global: true,
      is_active: true,
      products: {
        select: {
          id: true,
        },
      },
      users: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!coupon || !coupon.is_active) {
    throw new ApiError(404, "Coupon not found or inactive");
  }

  if (cart.coupon_id && cart.coupon_id !== coupon.id) {
    throw new ApiError(
      400,
      "A different coupon is already applied to this cart",
    );
  }

  const cartProductIds = Array.from(
    new Set(cart.items.map((item) => item.product_variant.product_id)),
  );
  const cartTotal = cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const isAvailable = await evaluateCouponForCart({
    coupon,
    userId,
    cartProductIds,
    cartTotal,
  });

  if (!isAvailable) {
    throw new ApiError(400, "Coupon is not available for current cart items");
  }

  await prisma.cart.update({
    where: { id: cart.id },
    data: {
      coupon_id: coupon.id,
    },
  });

  const updatedCart = await getCartDetails(userId);
  const cartPayload = buildCartPayload(updatedCart);

  return res
    .status(200)
    .json(new ApiResponse("Coupon applied to cart successfully", cartPayload));
});
const updateCartItem = asyncHandler(
  async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user!.user_id;
    const { slug: sku, quantity } = req.body as cartProduct;

    if (!sku || quantity == null) {
      throw new ApiError(400, "SKU and quantity are required");
    }

    if (quantity < 0) {
      throw new ApiError(400, "Quantity must be zero or greater");
    }

    const cart = await prisma.cart.findFirst({
      where: { user_id: userId },
    });

    if (!cart) {
      throw new ApiError(404, "Cart not found");
    }

    const variant = await prisma.productVariant.findUnique({
      where: { sku },
    });

    if (!variant) {
      throw new ApiError(404, "Product variant not found");
    }

    const cartItem = await prisma.cartItem.findUnique({
      where: {
        cart_id_product_variant_id: {
          cart_id: cart.id,
          product_variant_id: variant.id,
        },
      },
    });

    if (!cartItem) {
      throw new ApiError(404, "Cart item not found");
    }

    if (quantity === 0) {
      await prisma.cartItem.delete({ where: { id: cartItem.id } });

      await syncCartCoupon(cart.id);

      return res
        .status(200)
        .json(new ApiResponse("Cart item removed successfully"));
    }

    if (quantity > variant.stock) {
      throw new ApiError(400, "Quantity exceeds available stock");
    }

    const updatedCartItem = await prisma.cartItem.update({
      where: { id: cartItem.id },
      data: { quantity },
    });

    return res
      .status(200)
      .json(new ApiResponse("Cart item updated successfully", updatedCartItem));
  },
);

const deleteProductFromCart = asyncHandler(
  async (req: Request, res: Response): Promise<Response> => {
    const { slug: sku } = req.params as { slug: string };
    const userId = req.user!.user_id;

    if (!sku) {
      throw new ApiError(400, "SKU is required");
    }

    const variant = await prisma.productVariant.findUnique({
      where: { sku },
      include: {
        product: true,
      },
    });

    if (!variant) {
      throw new ApiError(404, "Product variant not found");
    }

    const cart = await prisma.cart.findUnique({
      where: { user_id: userId },
    });

    if (!cart) {
      throw new ApiError(404, "Cart not found");
    }

    const existingCartItem = await prisma.cartItem.findUnique({
      where: {
        cart_id_product_variant_id: {
          cart_id: cart.id,
          product_variant_id: variant.id,
        },
      },
    });

    if (!existingCartItem) {
      throw new ApiError(404, "Product not found in cart");
    }

    await prisma.cartItem.delete({
      where: { id: existingCartItem.id },
    });

    await syncCartCoupon(cart.id);

    return res
      .status(200)
      .json(new ApiResponse("Product removed from cart successfully", null));
  },
);

const clearCart = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.user_id;

  const cart = await prisma.cart.findUnique({
    where: { user_id: userId },
  });

  if (!cart) {
    throw new ApiError(404, "Cart not found");
  }

  await prisma.cartItem.deleteMany({
    where: { cart_id: cart.id },
  });

  await prisma.cart.update({
    where: { id: cart.id },
    data: {
      coupon_id: null,
    },
  });

  return res
    .status(200)
    .json(new ApiResponse("Cart cleared successfully", null));
});

export {
  addProductToCart,
  addCouponToCart,
  getUserCartCoupons,
  getCartProducts,
  updateCartItem,
  deleteProductFromCart,
  clearCart,
};
