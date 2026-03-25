import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { prisma } from "../../libs/prisma.js";
import {
  DiscountType,
  OrderStatus,
  PaymentStatus,
} from "../../../generated/prisma/enums.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import type { OrderPayload } from "./order.types.js";

const generateOrderNumber = () =>
  `ORD-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const mapRazorpayPaymentStatus = (razorpayPaymentStatus: string) => {
  const normalizedStatus = razorpayPaymentStatus.trim().toLowerCase();

  if (normalizedStatus === "captured" || normalizedStatus === "authorized") {
    return {
      orderStatus: OrderStatus.PROCESSING,
      paymentStatus: PaymentStatus.SUCCESS,
    };
  }

  if (normalizedStatus === "failed") {
    return {
      orderStatus: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.FAILED,
    };
  }

  return {
    orderStatus: OrderStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
  };
};

const fetchRazorpayPaymentStatus = async (razorpayId: string) => {
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!razorpayKeyId || !razorpayKeySecret) {
    throw new ApiError(
      500,
      "Razorpay credentials are not configured on the server",
    );
  }

  const authorization = Buffer.from(
    `${razorpayKeyId}:${razorpayKeySecret}`,
  ).toString("base64");

  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpayId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${authorization}`,
      },
    },
  );

  let payload: { status?: string; error?: { description?: string } } = {};
  try {
    payload = (await response.json()) as {
      status?: string;
      error?: { description?: string };
    };
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const errorMessage =
      payload.error?.description || "Unable to verify Razorpay payment";
    throw new ApiError(400, errorMessage);
  }

  if (!payload.status) {
    throw new ApiError(502, "Razorpay payment status is missing in response");
  }

  return mapRazorpayPaymentStatus(payload.status);
};

const addOrder = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.user_id as number;

  const { address_id, coupon_code, payment_method, razorpay_id } = req.body as {
    address_id: number;
    coupon_code?: string;
    payment_method?: string;
    razorpay_id?: string;
  };
  const normalizedCouponCode = coupon_code?.trim().toUpperCase();
  const normalizedPaymentMethod = payment_method?.trim().toLowerCase();
  const normalizedRazorpayId = razorpay_id?.trim();

  if (!address_id) throw new ApiError(400, "Address ID is required");
  if (coupon_code !== undefined && !normalizedCouponCode) {
    throw new ApiError(400, "coupon_code must be a non-empty string");
  }
  if (normalizedPaymentMethod === "razorpay" && !normalizedRazorpayId) {
    throw new ApiError(400, "razorpay_id is required for Razorpay payment");
  }

  const address = await prisma.address.findFirst({
    where: { id: Number(address_id), user_id: userId, is_active: true },
  });
  if (!address) throw new ApiError(404, "Address not found");

  const cart = await prisma.cart.findUnique({
    where: { user_id: userId },
    include: {
      items: {
        include: {
          product_variant: true,
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    return res.status(400).json({ message: "Cart is empty" });
  }

  const deliveryPincode = address.pin_code.trim();
  if (!/^\d{6}$/.test(deliveryPincode)) {
    throw new ApiError(400, "Address pincode must be a valid 6 digit value");
  }

  const cartProductIds = [
    ...new Set(cart.items.map((item) => item.product_variant.product_id)),
  ];

  const unserviceableProductRows = await prisma.productPincode.findMany({
    where: {
      product_id: {
        in: cartProductIds,
      },
      pincode: deliveryPincode,
    },
    select: {
      product_id: true,
    },
  });

  const unserviceableProductIdSet = new Set(
    unserviceableProductRows.map((row) => row.product_id),
  );
  const unavailableProductIds = cartProductIds.filter((productId) =>
    unserviceableProductIdSet.has(productId),
  );

  if (unavailableProductIds.length > 0) {
    const unavailableProducts = await prisma.product.findMany({
      where: {
        id: {
          in: unavailableProductIds,
        },
      },
      select: {
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    throw new ApiError(
      400,
      `Delivery is not available for pincode ${deliveryPincode} for: ${unavailableProducts
        .map((product) => product.name)
        .join(", ")}`,
    );
  }

  for (const item of cart.items) {
    if (!item.product_variant.is_active)
      throw new ApiError(
        400,
        `Product variant ${item.product_variant_id} is inactive`,
      );
    if (item.product_variant.stock < item.quantity) {
      throw new ApiError(
        400,
        `Insufficient stock for product variant ${item.product_variant_id}`,
      );
    }
  }

  const totalAmount = cart.items.reduce(
    (sum, item) => sum + item.quantity * item.product_variant.discounted_price,
    0,
  );

  let couponId: number | null = null;
  let discountAmount = 0;

  if (normalizedCouponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: normalizedCouponCode },
      include: { products: true },
    });

    if (!coupon || !coupon.is_active) {
      return res.status(400).json({ message: "Invalid coupon" });
    }

    const now = new Date();
    if (now < coupon.start_date || now > coupon.end_date) {
      throw new ApiError(400, "Coupon is not valid at this time");
    }

    if (coupon.min_purchase && totalAmount < coupon.min_purchase) {
      throw new ApiError(
        400,
        `Minimum purchase of ${coupon.min_purchase} required for this coupon`,
      );
    }

    if (coupon.max_uses) {
      const usedCount = await prisma.couponUsage.count({
        where: { coupon_id: coupon.id },
      });
      if (usedCount >= coupon.max_uses) {
        throw new ApiError(400, "Coupon usage limit reached");
      }
    }

    if (coupon.max_uses_per_user) {
      const userUsedCount = await prisma.couponUsage.count({
        where: { coupon_id: coupon.id, user_id: userId },
      });
      if (userUsedCount >= coupon.max_uses_per_user)
        throw new ApiError(
          400,
          "You have already used this coupon the maximum number of times",
        );
    }

    if (!coupon.is_global && coupon.products.length > 0) {
      const cartProductIds = cart.items.map(
        (i) => i.product_variant.product_id,
      );
      const allowedProductIds = new Set(coupon.products.map((p) => p.id));
      const hasEligibleProduct = cartProductIds.some((id) =>
        allowedProductIds.has(id),
      );
      if (!hasEligibleProduct)
        throw new ApiError(
          400,
          "Coupon is not applicable to any products in your cart",
        );
    }

    if (coupon.discount_type === DiscountType.PERCENTAGE) {
      discountAmount = Math.floor((totalAmount * coupon.discount_value) / 100);
    } else {
      discountAmount = coupon.discount_value;
    }

    if (coupon.max_discount && discountAmount > coupon.max_discount) {
      discountAmount = coupon.max_discount;
    }

    couponId = coupon.id;
  }

  const finalAmount = Math.max(totalAmount - discountAmount, 0);

  let orderStatus: OrderStatus = OrderStatus.PENDING;
  let paymentStatus: PaymentStatus = PaymentStatus.PENDING;

  if (normalizedPaymentMethod === "razorpay" && normalizedRazorpayId) {
    const resolvedStatus =
      await fetchRazorpayPaymentStatus(normalizedRazorpayId);
    orderStatus = resolvedStatus.orderStatus;
    paymentStatus = resolvedStatus.paymentStatus;
  }

  const createdOrder = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        user_id: userId,
        order_number: generateOrderNumber(),
        total_amount: totalAmount,
        discount_amount: discountAmount,
        final_amount: finalAmount,
        coupon_id: couponId,
        address_id: Number(address_id),
        payment_method: normalizedPaymentMethod || null,
        status: orderStatus,
        payment_status: paymentStatus,
        items: {
          create: cart.items.map((item) => ({
            product_variant_id: item.product_variant_id,
            quantity: item.quantity,
            price: item.product_variant.discounted_price,
          })),
        },
      },
    });

    if (normalizedPaymentMethod === "razorpay" && normalizedRazorpayId) {
      await tx.$executeRaw`
        UPDATE "Order"
        SET "razorpay_id" = ${normalizedRazorpayId}
        WHERE "id" = ${order.id}
      `;
    }

    for (const item of cart.items) {
      await tx.productVariant.update({
        where: { id: item.product_variant_id },
        data: { stock: { decrement: item.quantity } },
      });
    }

    if (couponId) {
      await tx.couponUsage.create({
        data: {
          coupon_id: couponId,
          user_id: userId,
          order_id: order.id,
        },
      });
    }

    await tx.cartItem.deleteMany({ where: { cart_id: cart.id } });

    return tx.order.findUnique({
      where: { id: order.id },
      include: {
        address: true,
        items: {
          include: {
            product_variant: {
              include: { product: true, images: true },
            },
          },
        },
        coupon: true,
      },
    });
  });

  return res
    .status(201)
    .json(new ApiResponse("Order placed successfully", createdOrder));
});

const getUserOrders = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.user_id as number;
  const orders = await prisma.order.findMany({
    where: { user_id: userId },
    select: {
      order_number: true,
      total_amount: true,
      discount_amount: true,
      final_amount: true,
      status: true,
      payment_status: true,
      created_at: true,
      items: {
        select: {
          quantity: true,
          price: true,
          product_variant: {
            select: {
              product_id: true,
              color: true,
              size: true,
              product: {
                select: {
                  name: true,
                  slug: true,
                  brand: true,
                  category: {
                    select: { name: true },
                  },
                },
              },
              images: {
                select: {
                  image_url: true,
                  is_primary: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { created_at: "desc" },
  });

  console.log({ orders });

  const formattedOrders = orders.map((order) => ({
    order_number: order.order_number,
    total_amount: order.total_amount,
    discount_amount: order.discount_amount,
    final_amount: order.final_amount,
    status: order.status,
    payment_status: order.payment_status,
    purchase_date: order.created_at,
    items: order.items.map((item) => ({
      quantity: item.quantity,
      price: item.price,
      brand: item.product_variant.product.brand,
      category: item.product_variant.product.category?.name,
      color: item.product_variant.color,
      size: item.product_variant.size,
      name: item.product_variant.product.name,
      slug: item.product_variant.product.slug,
      images: item.product_variant.images,
    })),
  }));

  return res
    .status(200)
    .json(new ApiResponse("Orders retrieved successfully", formattedOrders));
});

const getOrderDetails = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.user_id;
  const { order_number } = req.params;

  if (typeof userId !== "number" || Number.isNaN(userId)) {
    throw new ApiError(401, "Authentication required");
  }

  const order = await prisma.order.findFirst({
    where: { order_number: order_number as string, user_id: userId },
    select: {
      order_number: true,
      total_amount: true,
      discount_amount: true,
      final_amount: true,
      status: true,
      payment_status: true,
      payment_method: true,
      created_at: true,
      items: {
        select: {
          quantity: true,
          price: true,
          product_variant: {
            select: {
              color: true,
              size: true,
              product: {
                select: {
                  name: true,
                  slug: true,
                  brand: true,
                  category: {
                    select: { name: true },
                  },
                  review: {
                    where: { user_id: userId },
                    select: { id: true },
                  },
                },
              },
              images: {
                select: {
                  image_url: true,
                  is_primary: true,
                },
              },
            },
          },
        },
      },
      address: {
        select: {
          first_name: true,
          last_name: true,
          phone_code: true,
          phone_number: true,
          line1: true,
          line2: true,
          city: true,
          state: true,
          pin_code: true,
          country: true,
        },
      },
      coupon: {
        select: {
          code: true,
          discount_type: true,
          discount_value: true,
        },
      },
    },
  });

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const formattedOrder = {
    order_number: order.order_number,
    total_amount: order.total_amount,
    discount_amount: order.discount_amount,
    final_amount: order.final_amount,
    status: order.status,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    purchase_date: order.created_at,
    items: order.items.map((item) => ({
      quantity: item.quantity,
      price: item.price,
      brand: item.product_variant.product.brand,
      category: item.product_variant.product.category?.name,
      color: item.product_variant.color,
      size: item.product_variant.size,
      name: item.product_variant.product.name,
      slug: item.product_variant.product.slug,
      images: item.product_variant.images,
      review: item.product_variant.product.review.length > 0,
    })),
    address: order.address,
    coupon: order.coupon,
  };
  return res
    .status(200)
    .json(
      new ApiResponse("Order details retrieved successfully", formattedOrder),
    );
});

const getAllOrders = asyncHandler(async (req: Request, res: Response) => {
  const roleId = req.user?.role_id;

  if (roleId !== 1) {
    throw new ApiError(403, "Only admin can access all orders");
  }

  const {
    page = 1,
    limit = 10,
    sortBy = "created_at",
    sortOrder = "desc",
  } = req.query as OrderPayload;

  const allowedSortBy = [
    "created_at",
    "updated_at",
    "total_amount",
    "final_amount",
    "status",
    "payment_status",
  ] as const;

  const normalizedSortBy = String(sortBy);
  const normalizedSortOrder = String(sortOrder).toLowerCase();
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);

  if (
    !allowedSortBy.includes(normalizedSortBy as (typeof allowedSortBy)[number])
  ) {
    throw new ApiError(
      400,
      `Invalid sortBy. Allowed values: ${allowedSortBy.join(", ")}`,
    );
  }

  if (normalizedSortOrder !== "asc" && normalizedSortOrder !== "desc") {
    throw new ApiError(400, "Invalid sortOrder. Allowed values: asc, desc");
  }

  const orders = await prisma.order.findMany({
    select: {
      order_number: true,
      total_amount: true,
      discount_amount: true,
      final_amount: true,
      status: true,
      payment_status: true,
      created_at: true,
      items: {
        select: {
          quantity: true,
          price: true,
          product_variant: {
            select: {
              color: true,
              size: true,
              product: {
                select: {
                  name: true,
                  slug: true,
                  brand: true,
                  category: {
                    select: { name: true },
                  },
                },
              },
              images: {
                select: {
                  image_url: true,
                  is_primary: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      [normalizedSortBy]: normalizedSortOrder,
    },
    skip: (normalizedPage - 1) * normalizedLimit,
    take: normalizedLimit,
  });

  const formattedOrders = orders.map((order) => ({
    order_number: order.order_number,
    total_amount: order.total_amount,
    discount_amount: order.discount_amount,
    final_amount: order.final_amount,
    status: order.status,
    payment_status: order.payment_status,
    purchase_date: order.created_at,
    items: order.items.map((item) => ({
      quantity: item.quantity,
      price: item.price,
      brand: item.product_variant.product.brand,
      category: item.product_variant.product.category?.name,
      color: item.product_variant.color,
      size: item.product_variant.size,
      name: item.product_variant.product.name,
      slug: item.product_variant.product.slug,
      images: item.product_variant.images,
    })),
  }));

  return res
    .status(200)
    .json(new ApiResponse("Orders retrieved successfully", formattedOrders));
});

const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { order_number } = req.params;
  const { status } = req.body as { status?: OrderStatus };
  const userId = req.user?.user_id as number;
  const roleId = req.user?.role_id as number;

  if (!status || typeof status !== "string") {
    throw new ApiError(400, "status is required");
  }

  const normalizedStatus = status.trim().toUpperCase() as OrderStatus;
  const validStatuses = Object.values(OrderStatus);

  if (!validStatuses.includes(normalizedStatus)) {
    throw new ApiError(400, "Invalid order status");
  }

  const isAdmin = roleId === 1;

  if (!isAdmin && normalizedStatus !== OrderStatus.CANCELLED) {
    throw new ApiError(
      403,
      "You can only cancel your order. Other status updates are admin only",
    );
  }

  const order = await prisma.order.findUnique({
    where: { order_number: order_number as string },
    select: {
      id: true,
      user_id: true,
      status: true,
      order_number: true,
      updated_at: true,
      items: {
        select: {
          product_variant_id: true,
          quantity: true,
        },
      },
    },
  });

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  if (!isAdmin && order.user_id !== userId) {
    throw new ApiError(403, "You can update only your own order");
  }

  const nonCancellableStatuses = new Set<OrderStatus>([
    OrderStatus.DELIVERED,
    OrderStatus.RETURNED,
    OrderStatus.CANCELLED,
  ]);

  if (!isAdmin && nonCancellableStatuses.has(order.status)) {
    throw new ApiError(400, "Order cannot be cancelled in current status");
  }

  if (order.status === normalizedStatus) {
    return res
      .status(200)
      .json(new ApiResponse("Order status is already up to date", order));
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    if (
      normalizedStatus === OrderStatus.CANCELLED &&
      order.status !== OrderStatus.CANCELLED
    ) {
      for (const item of order.items) {
        await tx.productVariant.update({
          where: {
            id: item.product_variant_id,
          },
          data: {
            stock: {
              increment: item.quantity,
            },
          },
        });
      }
    }

    return tx.order.update({
      where: { id: order.id },
      data: { status: normalizedStatus },
      select: {
        order_number: true,
        status: true,
        updated_at: true,
      },
    });
  });

  return res
    .status(200)
    .json(new ApiResponse("Order status updated successfully", updatedOrder));
});

export {
  addOrder,
  getUserOrders,
  getOrderDetails,
  getAllOrders,
  updateOrderStatus,
};
