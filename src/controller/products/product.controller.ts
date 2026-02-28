import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import {
  deleteMediaFromCloudinary,
  uploadMediaToCloudinary,
} from "../../helper/uploadFileToCloudinary.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import type {
  addProductInput,
  productFilter,
  SortOptions,
  VariantInput,
} from "./types.js";
import { generateSku } from "../../utils/utils.js";
import { productQuerySchema } from "../../validations/product.validation.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import cloudinary from "../../config/cloudinary.config.js";

const addProduct = asyncHandler(
  async (req: Request, res: Response): Promise<Response> => {
    const { name, description, brand, category, variants } =
      req.body as addProductInput;

    if (!name || !category || !variants) {
      throw new ApiError(400, "Name, category, and variants are required");
    }

    const parsedVariants: VariantInput[] =
      typeof variants === "string" ? JSON.parse(variants) : variants;

    if (!Array.isArray(parsedVariants) || parsedVariants.length === 0) {
      throw new ApiError(400, "Variants must be non-empty array");
    }

    const categoryDetails = await prisma.category.findUnique({
      where: { slug: category },
      select: { id: true },
    });

    if (!categoryDetails) {
      throw new ApiError(404, "Category not found");
    }

    const existingProduct = await prisma.product.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
      },
    });

    if (existingProduct) {
      throw new ApiError(400, "Product already exists");
    }

    const baseSlug = name.toLowerCase().trim().replace(/\s+/g, "-");
    const slug = `${baseSlug}-${Date.now()}`;

    const files = req.files as Express.Multer.File[];
    const variantImageMap: Record<string, Express.Multer.File[]> = {};

    if (files?.length) {
      for (const file of files) {
        if (!variantImageMap[file.fieldname]) {
          variantImageMap[file.fieldname] = [];
        }
        variantImageMap[file.fieldname]!.push(file);
      }
    }

    const uploadedVariantImages: Record<
      string,
      { image_url: string; image_public_id: string }[]
    > = {};

    for (let i = 0; i < parsedVariants.length; i++) {
      const key = `variants[${i}]`;
      const images = variantImageMap[key] || [];

      if (images.length > 0) {
        const uploadResults = await uploadMediaToCloudinary(images, "products");

        uploadedVariantImages[key] = uploadResults.map((img: any) => ({
          image_url: img.secure_url,
          image_public_id: img.public_id,
        }));
      } else {
        uploadedVariantImages[key] = [];
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      const newProduct = await tx.product.create({
        data: {
          name,
          slug,
          description: description ?? null,
          brand,
          category_id: categoryDetails.id,
        },
      });

      for (let i = 0; i < parsedVariants.length; i++) {
        const variant = parsedVariants[i];
        if (!variant) continue;

        const createdVariant = await tx.productVariant.create({
          data: {
            product_id: newProduct.id,
            color: variant.color ?? null,
            size: variant.size ?? null,
            original_price: Number(variant.original_price),
            discounted_price: Number(variant.discounted_price),
            stock: Number(variant.stock),
            sku: generateSku(newProduct.name, variant.color, variant.size),
          },
        });

        const images = uploadedVariantImages[`variants[${i}]`] || [];

        if (images.length > 0) {
          await tx.productImage.createMany({
            data: images.map((img, idx) => ({
              variant_id: createdVariant.id,
              image_url: img.image_url,
              image_public_id: img.image_public_id,
              is_primary: variant.primary_image_index === idx,
            })),
          });
        }
      }

      return newProduct;
    });

    return res
      .status(201)
      .json(
        new ApiResponse("Product with variants created successfully", product),
      );
  },
);

const getAllProducts = asyncHandler(async (req: Request, res: Response) => {
  const parsedQuery = productQuerySchema.parse(req.query);
  const userId = req.user?.user_id;
  console.log({ userId });
  const {
    sort,
    category,
    filter,
    is_product_listing_page: isPLP,
  } = req.query as productFilter;

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

  if (category) {
    const categoryDetails = await prisma.category.findUnique({
      where: { slug: category },
      select: {
        id: true,
      },
    });

    if (!categoryDetails) throw new ApiError(404, "Category not found");

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
    ...(filter == "in_stock"
      ? {
          variants: {
            some: {
              stock: {
                gt: 0,
              },
            },
          },
        }
      : {}),
    ...(filter == "out_of_stock"
      ? {
          variants: {
            every: { stock: { equals: 0 } },
          },
        }
      : {}),
    ...(filter == "featured"
      ? {
          is_featured: { equals: true },
          variants: {
            some: { stock: { gt: 0 } },
          },
        }
      : {}),
    ...(filter == "trending"
      ? {
          is_trending: { equals: true },
          variants: {
            some: { stock: { gt: 0 } },
          },
        }
      : {}),
  };

  const [totalProducts, products] = await Promise.all([
    prisma.product.count({
      where: whereCondition,
    }),
    prisma.product.findMany({
      where: whereCondition,
      take: limit,
      skip: (page - 1) * limit,
      select: {
        name: true,
        slug: true,
        description: true,
        brand: true,
        category: {
          select: {
            name: true,
            slug: true,
          },
        },
        is_active: true,
        variants: {
          ...(isPLP ? { take: 1 } : {}),
          ...(!isPLP ? {} : { orderBy: { discounted_price: "asc" } }),
          select: {
            color: true,
            size: true,
            original_price: true,
            discounted_price: true,
            stock: true,
            sku: true,
            images: {
              ...(!isPLP ? {} : { take: 1 }),
              select: {
                image_url: true,
                id: true,
              },
            },
            id: true,
          },
        },
      },
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

const getProductWithoutVariants = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 20,
      search,
      category,
    } = req.query as {
      page?: string;
      limit?: string;
      search?: string;
      category?: string;
    };

    const whereCondition: Prisma.ProductWhereInput = {
      ...(search
        ? {
            name: {
              contains: search,
              mode: "insensitive",
            },
          }
        : {}),
      ...(category
        ? {
            category: {
              slug: category,
            },
          }
        : {}),
    };

    console.log({ whereCondition });

    const [totalCount, products] = await Promise.all([
      prisma.product.count({
        where: whereCondition,
      }),
      prisma.product.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          brand: true,
          category: {
            select: {
              name: true,
              slug: true,
            },
          },
          is_active: true,
        },
        where: whereCondition,
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
      }),
    ]);
    return res
      .status(200)
      .json(
        new ApiResponse(
          "Products retrieved successfully",
          products,
          totalCount,
        ),
      );
  },
);

const updateProduct = asyncHandler(
  async (req: Request, res: Response): Promise<Response> => {
    const { slug } = req.params;
    const { name, description, brand, category, variants } = req.body;

    if (!slug) throw new ApiError(400, "Product slug is required");

    const existingProduct = await prisma.product.findUnique({
      where: { slug: slug as string },
      include: {
        variants: {
          include: { images: true },
        },
      },
    });

    if (!existingProduct) throw new ApiError(404, "Product not found");

    let parsedVariants: VariantInput[] = [];
    if (variants) {
      parsedVariants =
        typeof variants === "string" ? JSON.parse(variants) : variants;
    }

    // Validate numbers
    for (const v of parsedVariants) {
      if (
        isNaN(Number(v.original_price)) ||
        isNaN(Number(v.discounted_price)) ||
        isNaN(Number(v.stock))
      ) {
        throw new ApiError(400, "Invalid numeric values in variants");
      }
    }

    // Validate category
    let categoryId = existingProduct.category_id;
    if (category) {
      const cat = await prisma.category.findUnique({
        where: { slug: category },
      });
      if (!cat) throw new ApiError(404, "Category not found");
      categoryId = cat.id;
    }

    let updatedSlug = existingProduct.slug;
    if (name && name !== existingProduct.name) {
      updatedSlug = `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    }

    // GROUP FILES
    const files = req.files as Express.Multer.File[];
    const groupedFiles: Record<string, Express.Multer.File[]> = {};

    if (files?.length) {
      for (const file of files) {
        if (!groupedFiles[file.fieldname]) {
          groupedFiles[file.fieldname] = [];
        }
        groupedFiles[file.fieldname]!.push(file);
      }
    }

    // 🟢 STEP 1: Upload images BEFORE transaction
    const uploadedImagesMap: Record<
      number,
      { image_url: string; image_public_id: string }[]
    > = {};

    for (let i = 0; i < parsedVariants.length; i++) {
      const images = groupedFiles[`variants[${i}]`] || [];

      if (images.length > 0) {
        const uploaded = await uploadMediaToCloudinary(images, "products");
        uploadedImagesMap[i] = uploaded.map((img: any) => ({
          image_url: img.secure_url,
          image_public_id: img.public_id,
        }));
      }
    }

    // Collect Cloudinary IDs to delete AFTER transaction
    const cloudinaryIdsToDelete: string[] = [];

    // 🟢 STEP 2: DATABASE TRANSACTION ONLY
    const result = await prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: { id: existingProduct.id },
        data: {
          name: name ?? existingProduct.name,
          slug: updatedSlug,
          description: description ?? existingProduct.description,
          brand: brand ?? existingProduct.brand,
          category_id: categoryId,
        },
      });

      const existingVariantIds = existingProduct.variants.map((v) => v.id);
      const incomingVariantIds = parsedVariants
        .filter((v) => v.id)
        .map((v) => v.id as number);

      const variantsToDelete = existingVariantIds.filter(
        (id) => !incomingVariantIds.includes(id),
      );

      // Delete variants
      for (const variantId of variantsToDelete) {
        const variant = existingProduct.variants.find(
          (v) => v.id === variantId,
        );

        if (variant?.images.length) {
          for (const img of variant.images) {
            cloudinaryIdsToDelete.push(img.image_public_id);
          }
        }

        await tx.productVariant.delete({
          where: { id: variantId },
        });
      }

      // Update / Create variants
      for (let i = 0; i < parsedVariants.length; i++) {
        const variant = parsedVariants[i];
        if (!variant) continue;

        const uploadedImages = uploadedImagesMap[i] || [];

        if (variant.id) {
          const existingVariant = existingProduct.variants.find(
            (v) => v.id === variant.id,
          );
          if (!existingVariant) throw new ApiError(400, "Invalid variant ID");

          // Remove selected images
          if (variant.removed_image_ids?.length) {
            const imagesToRemove = existingVariant.images.filter((img) =>
              variant.removed_image_ids?.includes(img.id),
            );

            for (const img of imagesToRemove) {
              cloudinaryIdsToDelete.push(img.image_public_id);
            }

            await tx.productImage.deleteMany({
              where: { id: { in: variant.removed_image_ids } },
            });
          }

          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              color: variant.color ?? null,
              size: variant.size ?? null,
              original_price: Number(variant.original_price),
              discounted_price: Number(variant.discounted_price),
              stock: Number(variant.stock),
            },
          });

          if (uploadedImages.length > 0) {
            await tx.productImage.createMany({
              data: uploadedImages.map((img) => ({
                variant_id: variant.id!,
                image_url: img.image_url,
                image_public_id: img.image_public_id,
              })),
            });
          }
        } else {
          const createdVariant = await tx.productVariant.create({
            data: {
              product_id: updatedProduct.id,
              color: variant.color ?? null,
              size: variant.size ?? null,
              original_price: Number(variant.original_price),
              discounted_price: Number(variant.discounted_price),
              stock: Number(variant.stock),
              sku: generateSku(
                updatedProduct.name,
                variant.color,
                variant.size,
              ),
            },
          });

          if (uploadedImages.length > 0) {
            await tx.productImage.createMany({
              data: uploadedImages.map((img) => ({
                variant_id: createdVariant.id,
                image_url: img.image_url,
                image_public_id: img.image_public_id,
              })),
            });
          }
        }
      }

      return updatedProduct;
    });

    if (cloudinaryIdsToDelete.length > 0) {
      deleteMediaFromCloudinary(cloudinaryIdsToDelete).catch((err) => {
        console.error("Failed to delete images from Cloudinary:", err);
      });
    }

    return res
      .status(200)
      .json(new ApiResponse("Product updated successfully", result));
  },
);

const deleteVariant = asyncHandler(
  async (req: Request, res: Response): Promise<Response> => {
    const { variantId } = req.params;

    if (!variantId) throw new ApiError(400, "Variant ID is required");

    const variant = await prisma.productVariant.findUnique({
      where: { id: Number(variantId) },
      include: { images: true },
    });

    if (!variant) throw new ApiError(404, "Variant not found");

    // Delete images from cloudinary
    if (variant.images.length > 0) {
      for (const img of variant.images) {
        await cloudinary.uploader.destroy(img.image_public_id);
      }
    }

    // Delete variant (images auto delete if cascade enabled)
    await prisma.productVariant.delete({
      where: { id: Number(variantId) },
    });

    return res
      .status(200)
      .json(new ApiResponse("Variant deleted successfully", null));
  },
);

// const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
//   const { color, size } = req.query as { color?: string; size?: string };
//   const userId = req.user?.user_id;
//   const slug = req.params.slug;

//   if (!slug) {
//     throw new ApiError(400, "slug is required");
//   }

//   const product = await prisma.product.findUnique({
//     where: { slug: slug as string },
//     select: {
//       name: true,
//       slug: true,
//       description: true,
//       brand: true,
//       category: {
//         select: {
//           name: true,
//           slug: true,
//         },
//       },
//       is_active: true,
//       variants: {
//         select: {
//           id: true,
//           color: true,
//           size: true,
//           original_price: true,
//           discounted_price: true,
//           stock: true,
//           sku: true,
//           images: {
//             select: {
//               id: true,
//               image_url: true,
//             },
//           },
//         },
//       },
//     },
//   });

//   if (!product) {
//     throw new ApiError(404, "Product not found");
//   }

//   let selectedVariant = null;

//   if (color || size) {
//     selectedVariant = product.variants.find(
//       (variant) =>
//         (!color || variant.color === color) && (!size || variant.size === size),
//     );
//   }

//   const coupons = await prisma.coupon.findMany({
//     where: {
//       is_active: true,
//       OR: [
//         { is_global: true },
//         { products: { some: { slug: slug as string } } },
//         ...(userId ? [{ users: { some: { id: userId } } }] : []),
//       ],
//     },
//     select: {
//       code: true,
//       discount_type: true,
//       discount_value: true,
//       max_discount: true,
//       description: true,
//       min_purchase: true,
//       start_date: true,
//       end_date: true,
//     },
//   });

//   return res.status(200).json(
//     new ApiResponse("Product retrieved successfully", {
//       ...product,
//       selected_variant: selectedVariant ? selectedVariant : product.variants[0],
//       coupons,
//     }),
//   );
// });

const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
  const { color, size } = req.query as { color?: string; size?: string };
  const userId = req.user?.user_id;
  const slug = req.params.slug;

  if (!slug) {
    throw new ApiError(400, "slug is required");
  }

  const product = await prisma.product.findUnique({
    where: { slug: slug as string },
    select: {
      name: true,
      slug: true,
      description: true,
      brand: true,
      is_active: true,
      category: {
        select: {
          name: true,
          slug: true,
        },
      },

      variants: {
        select: {
          id: true,
          color: true,
          size: true,
          original_price: true,
          discounted_price: true,
          stock: true,
          sku: true,
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

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  const selectedVariant =
    product.variants.find(
      (v) =>
        (!color || v.color === color) &&
        (!size || v.size === size),
    ) ?? product.variants[0]; 

  const coupons = await prisma.coupon.findMany({
    where: {
      is_active: true,
      start_date: { lte: new Date() },
      end_date: { gte: new Date() },
      OR: [
        { is_global: true },
        { products: { some: { slug: slug as string } } },
        ...(userId ? [{ users: { some: { id: userId } } }] : []),
      ],
    },
    select: {
      code: true,
      discount_type: true,
      discount_value: true,
      max_discount: true,
      description: true,
      min_purchase: true,
      start_date: true,
      end_date: true,
    },
  });

  return res.status(200).json(
    new ApiResponse("Product retrieved successfully", {
      ...product,
      selected_variant: selectedVariant,
      coupons,
    }),
  );
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

const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;
  if (!slug) throw new ApiError(400, "Slug is required");

  const product = await prisma.product.findUnique({
    where: { slug: slug as string },
    include: {
      variants: {
        include: {
          images: true,
        },
      },
    },
  });

  if (!product) throw new ApiError(404, "Product not found");
  const cloudinaryIdsToDelete: string[] = [];

  for (const variant of product.variants) {
    for (const img of variant.images) {
      cloudinaryIdsToDelete.push(img.image_public_id);
    }
  }
  await prisma.productImage.deleteMany({
    where: {
      variant_id: {
        in: product.variants.map((v) => v.id),
      },
    },
  });
  await prisma.productVariant.deleteMany({
    where: { product_id: product.id },
  });

  await prisma.product.delete({
    where: { slug: slug as string },
  });

  if (cloudinaryIdsToDelete.length > 0) {
    deleteMediaFromCloudinary(cloudinaryIdsToDelete).catch((err) => {
      console.error("Failed to delete images from Cloudinary:", err);
    });
  }

  return res
    .status(200)
    .json(new ApiResponse("Product deleted successfully", null));
});

export {
  addProduct,
  getProductBySlug,
  getProductsByCategory,
  getAllProducts,
  getProductWithoutVariants,
  updateProduct,
  deleteVariant,
  deleteProduct,
};
