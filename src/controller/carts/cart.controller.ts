import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { cartProduct } from "./types.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";

const syncCartCoupon = async (cartId: number) => {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    select: {
      id: true,
      user_id: true,
      coupon_id: true,
      coupon: {
        select: {
          id: true,
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
      },
      items: {
        select: {
          quantity: true,
          price: true,
          product_variant: {
            select: {
              product_id: true,
            },
          },
        },
      },
    },
  });

  if (!cart) {
    return null;
  }

  const cartProductIds = Array.from(
    new Set(cart.items.map((item) => item.product_variant.product_id)),
  );

  if (cartProductIds.length === 0) {
    await prisma.cart.update({
      where: { id: cartId },
      data: { coupon_id: null },
    });
    return null;
  }

  if (!cart.coupon_id || !cart.coupon || !cart.coupon.is_active) {
    if (cart.coupon_id) {
      await prisma.cart.update({
        where: { id: cartId },
        data: { coupon_id: null },
      });
    }
    return null;
  }

  const cartTotal = cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const isCouponAvailable = await evaluateCouponForCart({
    coupon: cart.coupon,
    userId: cart.user_id,
    cartProductIds,
    cartTotal,
  });

  const couponId = isCouponAvailable ? cart.coupon_id : null;

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
    coupon_code: cart.coupon?.code ?? null,
    used_coupon: cart.coupon,
    items,
    total_price: totalPrice,
    total_items: items.length,
    created_at: cart.created_at,
    updated_at: cart.updated_at,
  };
};

const calculateCouponDiscountAmount = ({
  coupon,
  subtotal,
}: {
  coupon:
    | {
        discount_type: string;
        discount_value: number;
        max_discount: number | null;
        min_purchase: number | null;
        start_date: Date;
        end_date: Date;
        is_active: boolean;
      }
    | null
    | undefined;
  subtotal: number;
}) => {
  if (!coupon || !coupon.is_active || subtotal <= 0) {
    return 0;
  }

  const now = new Date();
  if (now < coupon.start_date || now > coupon.end_date) {
    return 0;
  }

  if (coupon.min_purchase != null && subtotal < coupon.min_purchase) {
    return 0;
  }

  let discountAmount =
    coupon.discount_type === "PERCENTAGE"
      ? Math.floor((subtotal * coupon.discount_value) / 100)
      : coupon.discount_value;

  if (coupon.max_discount != null) {
    discountAmount = Math.min(discountAmount, coupon.max_discount);
  }

  return Math.max(0, Math.min(discountAmount, subtotal));
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

  const userUsageCountPromise = prisma.couponUsage.count({
    where: { coupon_id: coupon.id, user_id: userId },
  });

  const [totalUsageCount, userUsageCount] = await Promise.all([
    totalUsageCountPromise,
    userUsageCountPromise,
  ]);

  const isUnderGlobalUsageLimit =
    coupon.max_uses == null || totalUsageCount < coupon.max_uses;
  const isFirstTimeUserUsage = userUsageCount === 0;
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
    isFirstTimeUserUsage &&
    isUnderUserUsageLimit &&
    isUserEligible &&
    isProductEligible
  );
};

const addProductToCart = asyncHandler(async (req: Request, res: Response) => {
  const {
    slug: sku,
    quantity,
    coupon_code: rawCouponCode,
    couponCode: rawCouponCodeAlias,
  } = req.body as cartProduct;

  const rawRequestedCouponCode = rawCouponCode ?? rawCouponCodeAlias;

  const requestedCouponCode =
    rawRequestedCouponCode == null
      ? null
      : rawRequestedCouponCode.trim().length > 0
        ? rawRequestedCouponCode.trim().toUpperCase()
        : (() => {
            throw new ApiError(400, "coupon_code must be a non-empty string");
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
      quantity: true,
      price: true,
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
  let cartCouponId = cart.coupon_id ?? null;

  if (requestedCouponCode !== null) {
    const requestedCoupon = await prisma.coupon.findUnique({
      where: {
        code: requestedCouponCode,
      },
      select: {
        id: true,
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

    if (!requestedCoupon || !requestedCoupon.is_active) {
      throw new ApiError(404, "Requested coupon not found or inactive");
    }

    const projectedCartTotal =
      existingItems.reduce((sum, item) => sum + item.price * item.quantity, 0) +
      variant.discounted_price * quantity;

    const isRequestedCouponAvailable = await evaluateCouponForCart({
      coupon: requestedCoupon,
      userId,
      cartProductIds: allProductIds,
      cartTotal: projectedCartTotal,
    });

    if (!isRequestedCouponAvailable) {
      throw new ApiError(
        400,
        "Provided coupon_code is not applicable for current cart products",
      );
    }

    // Keep a single coupon in cart while allowing users to replace it.
    cartCouponId = requestedCoupon.id;
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

  const cart = await prisma.cart.findUnique({
    where: {
      user_id: userId,
    },
    select: {
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
      items: {
        select: {
          quantity: true,
          price: true,
          product_variant: {
            select: {
              sku: true,
              stock: true,
              color: true,
              size: true,
              product: {
                select: {
                  name: true,
                  slug: true,
                },
              },
              images: {
                take: 1,
                select: {
                  image_url: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!cart) {
    return res.status(200).json(
      new ApiResponse("Cart is empty", {
        items: [],
        total_items: 0,
        total_price: 0,
        coupon_code: null,
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

  const couponDiscountAmount = calculateCouponDiscountAmount({
    coupon: cart.coupon,
    subtotal: cartSubtotal,
  });

  return res.status(200).json(
    new ApiResponse("Cart items retrieved successfully", {
      items: formattedItems,
      total_items: formattedItems.length,
      total_price: cartSubtotal,
      coupon_discount_amount: couponDiscountAmount,
      final_price: Math.max(cartSubtotal - couponDiscountAmount, 0),
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
        { users: { none: {} } },
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

const viewAllAvailableCartCoupons = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.user_id;

    const cart = await getCartDetails(userId);

    if (!cart || cart.items.length === 0) {
      return res
        .status(200)
        .json(new ApiResponse("Available coupons retrieved successfully", []));
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
          { users: { none: {} } },
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

    const availableCoupons = (
      await Promise.all(
        coupons.map(async (coupon) => {
          const isAvailable = await evaluateCouponForCart({
            coupon,
            userId,
            cartProductIds,
            cartTotal,
          });

          if (!isAvailable) {
            return null;
          }

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
            is_applied: cart.coupon_id === coupon.id,
          };
        }),
      )
    ).filter((coupon): coupon is NonNullable<typeof coupon> => coupon !== null);

    return res
      .status(200)
      .json(
        new ApiResponse(
          "Available coupons retrieved successfully",
          availableCoupons,
        ),
      );
  },
);

const addCouponToCart = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.user_id;
  const { coupon_code: rawCouponCode, couponCode: rawCouponCodeAlias } =
    req.body as {
      coupon_code?: string;
      couponCode?: string;
    };
  const couponCode = (rawCouponCode ?? rawCouponCodeAlias)
    ?.trim()
    .toUpperCase();

  if (!couponCode) {
    throw new ApiError(400, "coupon_code is required");
  }

  const cart = await getCartDetails(userId);

  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, "Cart is empty");
  }

  const coupon = await prisma.coupon.findUnique({
    where: { code: couponCode },
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

  if (cart.coupon_id === coupon.id) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          "Coupon already applied to cart",
          buildCartPayload(cart),
        ),
      );
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

const removeCouponFromCart = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.user_id;

    const cart = await getCartDetails(userId);

    if (!cart) {
      throw new ApiError(404, "Cart not found");
    }

    if (!cart.coupon_id) {
      return res
        .status(200)
        .json(
          new ApiResponse("No coupon applied to cart", buildCartPayload(cart)),
        );
    }

    await prisma.cart.update({
      where: { id: cart.id },
      data: {
        coupon_id: null,
      },
    });

    const updatedCart = await getCartDetails(userId);

    return res
      .status(200)
      .json(
        new ApiResponse(
          "Coupon removed from cart successfully",
          buildCartPayload(updatedCart),
        ),
      );
  },
);
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

    await syncCartCoupon(cart.id);

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
  removeCouponFromCart,
  getUserCartCoupons,
  viewAllAvailableCartCoupons,
  getCartProducts,
  updateCartItem,
  deleteProductFromCart,
  clearCart,
};
