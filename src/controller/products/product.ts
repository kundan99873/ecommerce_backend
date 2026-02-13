import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { uploadMediaToCloudinary } from "../../helper/uploadFileToCloudinary.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import type { addProductInput, productFilter, SortOptions, VariantInput } from "./types.js";
import { generateSku } from "../../utils/utils.js";
import { productQuerySchema } from "../../validations/product.validation.js";
import type { Prisma } from "../../../generated/prisma/client.js";

const addProduct = asyncHandler(
  async (req: Request, res: Response): Promise<Response> => {
    const { name, description, brand, category, variants } = req.body as addProductInput;

    if (!name || !category || !variants) {
      throw new ApiError(400, "Name, categoryId, and variants are required");
    }

    const categoryDetails = await prisma.category.findUnique({ where: { slug: category }, select: { id: true } });
    if(!categoryDetails) {
      throw new ApiError(401, "Category not found");
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
        category_id: categoryDetails.id,
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

const getAllProducts = asyncHandler(async (req: Request, res: Response) => {
  const parsedQuery = productQuerySchema.parse(req.query);
  const { sort, category, filter } = req.query as productFilter;

  let orderBy: any = { created_at: "desc" };
  switch (sort) {
    case "price_low":
      orderBy = { variants: { _min: { discounted_price: "asc" } } };
      break;
    case "price_high":
      orderBy = { variants: { _max: { discounted_price: "desc" } } };
      break;
    case "newest":
      orderBy = { created_at: "desc" };
      break;
    case "top_rated":
      orderBy = { review: { _avg: { rating: "desc" } } };
      break;
    default:
      orderBy = { created_at: "desc" };
  }

  const page = Number(parsedQuery.page ?? 1);
  const limit = Number(parsedQuery.limit ?? 20);
  const search = parsedQuery.search;

  let categoryId: number | null = null;

  if(category) {
    const categoryDetails = await prisma.category.findUnique({
      where: { slug: category },
      select: {
        id: true,
      }
    });

    if(!categoryDetails) throw new ApiError(404, "Category not found");

    categoryId = categoryDetails.id;
  }

  const whereCondition: Prisma.ProductWhereInput = {
    ...(search
      ? {
          name: {
            contains: search,
            mode: "insensitive",
          },
        }
      : {}),
    ...(categoryId ? { category_id: categoryId } : {}),
  };

  const [totalProducts, products] = await prisma.$transaction([
    prisma.product.count({
      where: whereCondition,
    }),
    prisma.product.findMany({
      where: whereCondition,
      take: limit,
      skip: (page - 1) * limit,
      orderBy,
    }),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        "Products retrieved successfully",
        products,
        totalProducts,
      ),
    );
});

const updateProduct = asyncHandler(
  async (req: Request, res: Response): Promise<Response> => {
    const { slug } = req.params;
    const { name, description, brand, categoryId, variants } = req.body;

    if (!slug) throw new ApiError(400, "Product ID is required");

    const existingProduct = await prisma.product.findUnique({
      where: { slug: slug as string },
      include: { variants: true },
    });

    if (!existingProduct) throw new ApiError(404, "Product not found");

    const updatedProduct = await prisma.product.update({
      where: { id: existingProduct.id },
      data: {
        name: name ?? existingProduct.name,
        slug: name
          ? name.toLowerCase().trim().replace(/\s+/g, "-")
          : existingProduct.slug,
        description: description ?? existingProduct.description,
        brand: brand ?? existingProduct.brand,
        category_id: categoryId
          ? Number(categoryId)
          : existingProduct.category_id,
      },
    });

    let parsedVariants: (VariantInput & { id?: number })[] = [];
    if (variants) {
      parsedVariants =
        typeof variants === "string" ? JSON.parse(variants) : variants;
    }

    for (const variant of parsedVariants) {
      let uploadedImages: { secure_url: string; public_id: string }[] = [];

      if (variant.images && variant.images.length > 0) {
        const uploadResults = await uploadMediaToCloudinary(variant.images);
        uploadedImages = uploadResults.map((img) => ({
          secure_url: img.secure_url,
          public_id: img.public_id,
        }));
      }

      if (variant.id) {
        const variantData: Prisma.ProductVariantUpdateInput = {
          original_price: variant.original_price,
          discounted_price: variant.discounted_price,
          stock: variant.stock,
          sku: generateSku(updatedProduct.name, variant.color, variant.size),
        };

        if (variant.color !== undefined) {
          variantData.color = variant.color;
        }

        if (variant.size !== undefined) {
          variantData.size = variant.size;
        }

        if (uploadedImages.length) {
          variantData.images = {
            create: uploadedImages.map((img) => ({
              image_url: img.secure_url,
              image_public_id: img.public_id,
            })),
          };
        }

        await prisma.productVariant.update({
          where: { id: variant.id },
          data: variantData,
        });
      } else {
        await prisma.productVariant.create({
          data: {
            product_id: updatedProduct.id,
            color: variant.color ?? null,
            size: variant.size ?? null,
            original_price: variant.original_price,
            discounted_price: variant.discounted_price,
            stock: variant.stock,
            sku: generateSku(updatedProduct.name, variant.color, variant.size),
            images: {
              create: uploadedImages.map((img) => ({
                image_url: img.secure_url,
                image_public_id: img.public_id,
              })),
            },
          },
        });
      }
    }

    return res
      .status(200)
      .json(new ApiResponse("Product updated successfully", updatedProduct));
  },
);

const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
  const { slug: rawSlug, active = false } = req.query;

  const slug = typeof rawSlug === "string" ? rawSlug : undefined;

  if (!slug) {
    throw new ApiError(400, "slug is required");
  }

  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: {
        select: {
          name: true,
          slug: true,
        },
      },
      variants: {
        ...(active
          ? {
              where: { is_active: true, stock: { gt: 0 } },
            }
          : {}),
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

  return res
    .status(200)
    .json(new ApiResponse("Product retrieved successfully", product));
});

const getProductsByCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { slug } = req.params;
    const { page = 1, limit = 20, search } = req.body;

    if (!slug) throw new ApiError(400, "Slug is required");

    const category = await prisma.category.findUnique({
      where: { slug: slug as string },
      select: {
        id: true,
      },
    });

    if (!category) throw new ApiError(404, "Category not found");

    const whereCondition: Prisma.ProductWhereInput = {
      category_id: category.id,
      ...(search
        ? {
            name: {
              contains: search,
              mode: "insensitive" as const,
            },
          }
        : {}),
    };

    const [totalProducts, products] = await prisma.$transaction([
      prisma.product.count({
        where: whereCondition,
      }),
      prisma.product.findMany({
        where: whereCondition,
        take: limit,
        skip: (page - 1) * limit,
      }),
    ]);

    const totalPages = Math.ceil(totalProducts / limit);

    return res
      .status(200)
      .json(
        new ApiResponse("Product found successfully", products, totalPages),
      );
  },
);




export {
  addProduct,
  getProductBySlug,
  getProductsByCategory,
  getAllProducts,
  updateProduct,
};
