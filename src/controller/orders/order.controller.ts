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

const addOrder = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.user_id as number;

  const { address_id, coupon_code, payment_method } = req.body as {
    address_id: number;
    coupon_code?: string;
    payment_method?: string;
  };

  if (!address_id) throw new ApiError(400, "Address ID is required");

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

  if (coupon_code) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: coupon_code },
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
        payment_method: payment_method || null,
        status: OrderStatus.PENDING,
        payment_status: PaymentStatus.PENDING,
        items: {
          create: cart.items.map((item) => ({
            product_variant_id: item.product_variant_id,
            quantity: item.quantity,
            price: item.product_variant.discounted_price,
          })),
        },
      },
    });

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
  const userId = req.user?.user_id as number;
  const { order_number } = req.params;

  const order = await prisma.order.findFirst({
    where: { order_number: order_number as string, user_id: userId },
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

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  return res
    .status(200)
    .json(new ApiResponse("Order details retrieved successfully", order));
});

const getAllOrders = asyncHandler(async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 10,
    sortBy = "created_at",
    sortOrder = "desc",
  } = req.body as OrderPayload;
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
    orderBy: { [sortBy]: sortOrder },
    skip: (page - 1) * limit,
    take: limit,
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

export { addOrder, getUserOrders, getOrderDetails, getAllOrders
  
 };
