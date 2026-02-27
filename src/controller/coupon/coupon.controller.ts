import type { Request, Response } from "express";
import { prisma } from "../../libs/prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/apiError.js";
import type { CouponInput, CouponQuery } from "./coupon.types.js";

const addCoupon = asyncHandler(async (req: Request, res: Response) => {
  const data = req.body as CouponInput;

  if (!data.code) {
    throw new ApiError(400, "Coupon code is required");
  }

  // Check duplicate
  const existing = await prisma.coupon.findUnique({
    where: { code: data.code.toUpperCase() },
  });

  if (existing) {
    throw new ApiError(400, "Coupon code already exists");
  }

  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date);

  if (endDate <= startDate) {
    throw new ApiError(400, "End date must be after start date");
  }

  const coupon = await prisma.coupon.create({
    data: {
      code: data.code.toUpperCase(),
      description: data.description || null,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      start_date: startDate,
      end_date: endDate,
      max_uses: data.max_uses ?? null,
      min_purchase: data.min_purchase ?? null,
      is_active: data.is_active ?? true,
      is_global: data.is_global ?? false,
      ...(data.product_ids && {
        products: {
          connect: data.product_ids.map((id) => ({ id })),
        },
      }),
      ...(data.user_ids && {
        users: {
          connect: data.user_ids.map((id) => ({ id })),
        },
      }),
    },
  });

  res.status(201).json(new ApiResponse("Coupon created successfully", coupon));
});

const getCoupons = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search } = req.query as CouponQuery;
  const skip = (Number(page) - 1) * Number(limit);

  const where: Record<string, any> = {};

  if (search) {
    where.code = { contains: search.toString(), mode: "insensitive" };
  }

  const coupons = await prisma.coupon.findMany({
    where,
    skip,
    take: Number(limit),
    orderBy: { created_at: "desc" },
  });

  res
    .status(200)
    .json(new ApiResponse("Coupons retrieved successfully", coupons));
});

const getCouponById = asyncHandler(async (req: Request, res: Response) => {
  const couponId = Number(req.params.id);

  if (isNaN(couponId)) {
    throw new ApiError(400, "Invalid coupon ID");
  }

  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId },
  });

  if (!coupon) {
    throw new ApiError(404, "Coupon not found");
  }

  res
    .status(200)
    .json(new ApiResponse("Coupon retrieved successfully", coupon));
});

const updateCoupon = asyncHandler(async (req: Request, res: Response) => {
  const couponId = Number(req.params.id);

  if (isNaN(couponId)) {
    throw new ApiError(400, "Invalid coupon ID");
  }

  const existing = await prisma.coupon.findUnique({
    where: { id: couponId },
  });

  if (!existing) {
    throw new ApiError(404, "Coupon not found");
  }

  const data = req.body;

  if (data.code && data.code !== existing.code) {
    const duplicate = await prisma.coupon.findUnique({
      where: { code: data.code.toUpperCase() },
    });

    if (duplicate) {
      throw new ApiError(400, "Coupon code already exists");
    }
  }

  if (data.start_date && data.end_date) {
    if (new Date(data.end_date) <= new Date(data.start_date)) {
      throw new ApiError(400, "End date must be after start date");
    }
  }

  const updateData: Record<string, any> = {};

  if (data.code) updateData.code = data.code.toUpperCase();
  if (data.description !== undefined) updateData.description = data.description;
  if (data.discount_type !== undefined)
    updateData.discount_type = data.discount_type;
  if (data.discount_value !== undefined)
    updateData.discount_value = data.discount_value;
  if (data.start_date) updateData.start_date = new Date(data.start_date);
  if (data.end_date) updateData.end_date = new Date(data.end_date);
  if (data.max_uses !== undefined) updateData.max_uses = data.max_uses;
  if (data.min_purchase !== undefined)
    updateData.min_purchase = data.min_purchase;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.is_global !== undefined) updateData.is_global = data.is_global;
  if (data.product_ids) {
    updateData.products = {
      set: data.product_ids.map((id: number) => ({ id })),
    };
  }
  if (data.user_ids) {
    updateData.users = {
      set: data.user_ids.map((id: number) => ({ id })),
    };
  }
  // console.log(typeof data.is_active, 88)
  // if (typeof data.is_active === "boolean")
  //   updateData.is_active = data.is_active;

  // if (typeof data.is_global === "boolean")
  //   updateData.is_global = data.is_global;

  const updatedCoupon = await prisma.coupon.update({
    where: { id: couponId },
    data: updateData,
  });

  res
    .status(200)
    .json(new ApiResponse("Coupon updated successfully", updatedCoupon));
});

const deleteCoupon = asyncHandler(async (req: Request, res: Response) => {
  const couponId = Number(req.params.id);

  if (isNaN(couponId)) {
    throw new ApiError(400, "Invalid coupon ID");
  }

  const existing = await prisma.coupon.findUnique({
    where: { id: couponId },
  });

  if (!existing) {
    throw new ApiError(404, "Coupon not found");
  }

  await prisma.coupon.delete({
    where: { id: couponId },
  });

  res.status(200).json(new ApiResponse("Coupon deleted successfully", null));
});

export { addCoupon, getCoupons, getCouponById, updateCoupon, deleteCoupon };
