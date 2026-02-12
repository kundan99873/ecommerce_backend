import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { uploadMediaToCloudinary } from "../../helper/uploadFileToCloudinary.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import type { VariantInput } from "./types.js";
import { generateSku } from "../../utils/utils.js";

const addProduct = asyncHandler(
  async (req: Request, res: Response): Promise<Response> => {
    const { name, description, brand, categoryId, variants } = req.body;

    if (!name || !categoryId || !variants) {
      throw new ApiError(400, "Name, categoryId, and variants are required");
    }

    const numericCategoryId = Number(categoryId);
    if (isNaN(numericCategoryId)) {
      throw new ApiError(400, "Invalid categoryId");
    }

    let parsedVariants: VariantInput[] = [];
    if (typeof variants === "string") {
      parsedVariants = JSON.parse(variants);
    } else {
      parsedVariants = variants;
    }

    const existingProduct = await prisma.product.findFirst({
      where: { name },
    });

    if (existingProduct) {
      throw new ApiError(400, "Product with this name already exists");
    }

    const product = await prisma.product.create({
      data: {
        name,
        slug: name.toLowerCase().trim().replace(/\s+/g, "-"),
        description: description ?? null,
        brand: brand ?? null,
        category_id: numericCategoryId,
      },
    });

    for (const variant of parsedVariants) {
      let uploadedImages: { secure_url: string; public_id: string }[] = [];
      if (variant.images && variant.images.length > 0) {
        const uploadResults = await uploadMediaToCloudinary(variant.images);
        uploadedImages = uploadResults.map((img) => ({
          secure_url: img.secure_url,
          public_id: img.public_id,
        }));
      }

      const createdVariant = await prisma.productVariant.create({
        data: {
          product_id: product.id,
          color: variant.color ?? null,
          size: variant.size ?? null,
          original_price: variant.original_price,
          discounted_price: variant.discounted_price,
          stock: variant.stock,
          sku: generateSku(name, variant.color, variant.size),
          images: {
            create: uploadedImages.map((img) => ({
              image_url: img.secure_url,
              image_public_id: img.public_id,
            })),
          },
        },
      });
    }

    return res
      .status(201)
      .json(
        new ApiResponse("Product with variants created successfully", product),
      );
  },
);

const getProductsBySlug = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;

  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      variants: {
        include: {
          images: {
            select: {
              image_url: true,
            },
          },
        },
      },
    },
  });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  res
    .status(200)
    .json(new ApiResponse("Product retrieved successfully", product));
});



export { addProduct };
