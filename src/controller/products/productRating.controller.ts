import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { AddReviewPayload } from "./types.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import {
  productReviewBodySchema,
  productReviewQuerySchema,
} from "../../validations/product.validation.js";

const addRatingToProduct = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params as { slug: string };
  const { rating, comment } = productReviewBodySchema.parse(
    req.body,
  ) as AddReviewPayload;

  const userId = req.user?.user_id as number;

  const product = await prisma.product.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!product) throw new ApiError(404, "Product not found");

  await prisma.review.upsert({
    where: {
      user_id_product_id: {
        user_id: userId,
        product_id: product.id,
      },
    },
    update: {
      rating,
      comment: comment?.trim() ? comment.trim() : null,
    },
    create: {
      product_id: product.id,
      user_id: userId,
      rating,
      comment: comment?.trim() ? comment.trim() : null,
    },
  });

  const aggregate = await prisma.review.aggregate({
    where: { product_id: product.id },
    _avg: { rating: true },
    _count: { _all: true },
  });

  return res.status(200).json(
    new ApiResponse("Rating added/updated successfully", {
      average_rating: Number((aggregate._avg.rating ?? 0).toFixed(2)),
      total_reviews: aggregate._count._all,
    }),
  );
});

const getProductReviews = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params as { slug: string };
  const parsedQuery = productReviewQuerySchema.parse(req.query);

  const page = Math.max(Number(parsedQuery.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(parsedQuery.limit ?? 10), 1), 50);

  const product = await prisma.product.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });

  if (!product) throw new ApiError(404, "Product not found");

  const [totalReviews, reviews, aggregate, ratingBreakdownRows] =
    await Promise.all([
      prisma.review.count({
        where: { product_id: product.id },
      }),
      prisma.review.findMany({
        where: { product_id: product.id },
        orderBy: { created_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          rating: true,
          comment: true,
          created_at: true,
          updated_at: true,
          user: {
            select: {
              id: true,
              name: true,
              avatar_url: true,
            },
          },
        },
      }),
      prisma.review.aggregate({
        where: { product_id: product.id },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.review.groupBy({
        by: ["rating"],
        where: { product_id: product.id },
        _count: { _all: true },
      }),
    ]);

  const ratingBreakdown = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  for (const row of ratingBreakdownRows) {
    ratingBreakdown[row.rating as 1 | 2 | 3 | 4 | 5] = row._count._all;
  }

  return res.status(200).json(
    new ApiResponse("Product reviews retrieved successfully", {
      product: {
        slug: product.slug,
        name: product.name,
      },
      average_rating: Number((aggregate._avg.rating ?? 0).toFixed(2)),
      total_reviews: aggregate._count._all,
      rating_breakdown: ratingBreakdown,
      page,
      limit,
      total: totalReviews,
      reviews,
    }),
  );
});

const deleteProductReview = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.user_id as number;
    const { slug } = req.params as { slug: string };

    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!product) throw new ApiError(404, "Product not found");

    const deleted = await prisma.review.deleteMany({
      where: {
        product_id: product.id,
        user_id: userId,
      },
    });

    if (deleted.count === 0) {
      throw new ApiError(404, "Review not found for this user and product");
    }

    return res
      .status(200)
      .json(new ApiResponse("Product review deleted successfully"));
  },
);

export { addRatingToProduct, getProductReviews, deleteProductReview };
