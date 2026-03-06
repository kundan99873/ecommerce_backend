import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { AddReviewPayload } from "./types.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";

const addRatingToProduct = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params as { slug: string };
  const { rating, comment } = req.body as AddReviewPayload;

  const userId = req.user?.user_id as number;

  const product = await prisma.product.findUnique({
    where: { slug },
  });

  if (!product) throw new ApiError(404, "Product not found");

  const existingReview = await prisma.review.findFirst({
    where: {
      product_id: product.id,
      user_id: userId,
    },
  });

  if (existingReview) {
    await prisma.review.update({
      where: { id: existingReview.id },
      data: { rating, comment: comment ?? null },
    });
  } else {
    await prisma.review.create({
      data: {
        product_id: product.id,
        user_id: userId,
        rating,
        comment: comment ?? null,
      },
    });
  }

  return res
    .status(200)
    .json(new ApiResponse("Rating added/updated successfully"));
});

export { addRatingToProduct };
