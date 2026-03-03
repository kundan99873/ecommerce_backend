import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";
import { prisma } from "../../libs/prisma.js";
import { ApiResponse } from "../../utils/apiResponse.js";

const addProductToWishlist = asyncHandler(
  async (req: Request, res: Response) => {
    const slug = req.params.slug as string;
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

    return res
      .status(201)
      .json(new ApiResponse("Product added to wishlist", wishlist));
  },
);

const removeProductToWishlist = asyncHandler(
  async (req: Request, res: Response) => {
    const slug = req.params.slug as string;
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

    if (!existing) throw new ApiError(400, "Product is not in your wishlist");

    await prisma.wishlist.delete({
      where: {
        user_id_product_variant_id: {
          user_id: userId,
          product_variant_id: variant.id,
        },
      },
    });

    return res
      .status(200)
      .json(new ApiResponse("Product removed from wishlist"));
  },
);

const getWishlistProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.user_id;

    const wishlistItems = await prisma.wishlist.findMany({
      where: { user_id: userId },
      select: {
        product_variant: {
          select: {
            id: true,
            color: true,
            size: true,
            original_price: true,
            discounted_price: true,
            stock: true,
            sku: true,
            product: {
              select: {
                name: true,
                description: true,
                brand: true,
                slug: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            images: {
              select: {
                id: true,
                image_url: true,
              },
            },
          },
        },
      },
    });

    const formattedItems = wishlistItems.map((item) => ({
      name: item.product_variant.product.name,
      description: item.product_variant.product.description,
      category: {
        id: item.product_variant.product.category?.id,
        name: item.product_variant.product.category?.name,
      },
      brand: item.product_variant.product.brand,
      slug: item.product_variant.product.slug,
      variants: [
        {
          color: item.product_variant.color,
          size: item.product_variant.size,
          original_price: item.product_variant.original_price,
          discounted_price: item.product_variant.discounted_price,
          stock: item.product_variant.stock,
          sku: item.product_variant.sku,
          id: item.product_variant.id,
          images: item.product_variant.images.map((image) => ({
            image_url: image.image_url,
            id: image.id,
          })),
        },
      ],
    }));

    return res
      .status(200)
      .json(
        new ApiResponse(
          "Wishlist products retrieved successfully",
          formattedItems,
        ),
      );
  },
);

export { addProductToWishlist, removeProductToWishlist, getWishlistProducts };
