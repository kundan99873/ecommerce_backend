import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { wishlistProduct } from "./types.js";
import { ApiError } from "../../utils/apiError.js";
import { prisma } from "../../libs/prisma.js";
import { ApiResponse } from "../../utils/apiResponse.js";

const addProductToWishlist = asyncHandler(
  async (req: Request, res: Response) => {
    const { slug } = req.body as wishlistProduct;
    const userId = req.user!.user_id;

    if (!slug) throw new ApiError(404, "slug is required");

    const variant = await prisma.productVariant.findUnique({
      where: { sku: slug },
      select: { id: true },
    });

    if (!variant) throw new ApiError(404, "Product not found");

     const existing = await prisma.wishlist.findUnique({
      where: {
        user_id_product_variant_id: {
          user_id: userId,
          product_variant_id: variant.id,
        },
      },
    });

    if (existing) throw new ApiError(400, "Product already in wishlist");

    const wishlist = await prisma.wishlist.create({
      data: {
        user_id: userId,
        product_variant_id: variant.id,
      },
    });

    return res.status(201).json(new ApiResponse("Product added to wishlist", wishlist));
  },
);

const removeProductToWishlist = asyncHandler(
  async (req: Request, res: Response) => {
    const { slug } = req.body as wishlistProduct;
    const userId = req.user!.user_id;

    if (!slug) throw new ApiError(404, "slug is required");

    const variant = await prisma.productVariant.findUnique({
      where: { sku: slug },
      select: { id: true },
    });

    if (!variant) throw new ApiError(404, "Product not found");

    const existing = await prisma.wishlist.findUnique({
      where: {
        user_id: userId,
        product_variant_id: variant.id,
      },
    });

    if (!existing)
      throw new ApiError(400, "Product is not in your wishlist");

    await prisma.wishlist.delete({
      where: {
        user_id: userId,
        product_variant_id: variant.id,
      },
    });

    return res.status(200).json(new ApiResponse("Product removed from wishlist"));
  },
);


export { addProductToWishlist, removeProductToWishlist }