import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import {
  deleteMediaFromCloudinary,
  uploadMediaToCloudinary,
} from "../../helper/uploadFileToCloudinary.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import type { addProductInput, productFilter, VariantInput } from "./types.js";
import { generateSku } from "../../utils/utils.js";
import {
  productPincodeParamSchema,
  productPincodesBodySchema,
  productAvailabilityQuerySchema,
  productQuerySchema,
} from "../../validations/product.validation.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import cloudinary from "../../config/cloudinary.config.js";

const RECENTLY_VISITED_LIMIT = 6;

const normalizePincodes = (pincodes: string[]) => [
  ...new Set(pincodes.map((pincode) => pincode.trim())),
];

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
  const validatedPincode = parsedQuery.pincode;
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

  // Store search history if user is logged in and search query exists
  if (
    userId &&
    search &&
    typeof search === "string" &&
    search.trim().length > 0
  ) {
    await prisma.searchHistory.create({
      data: {
        user_id: userId,
        search_query: search.trim(),
        category_filter: category ? String(category) : null,
        brand_filter: req.query.brand ? String(req.query.brand) : null,
      },
    });
  }

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
          OR: [
            {
              name: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              description: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              brand: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              category: {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(req.query.brand
      ? { brand: { equals: String(req.query.brand), mode: "insensitive" } }
      : {}),
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
    ...(validatedPincode
      ? {
          pincode: {
            some: {
              pincode: validatedPincode,
            },
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

  const productIds = products.map((product) => product.id);
  const ratingRows =
    productIds.length > 0
      ? await prisma.review.groupBy({
          by: ["product_id"],
          where: {
            product_id: {
              in: productIds,
            },
          },
          _avg: {
            rating: true,
          },
          _count: {
            _all: true,
          },
        })
      : [];

  const ratingMap = new Map(
    ratingRows.map((row) => [
      row.product_id,
      {
        average_rating: Number((row._avg.rating ?? 0).toFixed(2)),
        total_reviews: row._count._all,
      },
    ]),
  );

  const productsWithRatings = products.map((product) => ({
    ...product,
    ...(ratingMap.get(product.id) ?? {
      average_rating: 0,
      total_reviews: 0,
    }),
  }));

  return res
    .status(200)
    .json(
      new ApiResponse(
        "Products retrieved successfully",
        productsWithRatings,
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

    const productIds = products.map((product) => product.id);
    const ratingRows =
      productIds.length > 0
        ? await prisma.review.groupBy({
            by: ["product_id"],
            where: {
              product_id: {
                in: productIds,
              },
            },
            _avg: {
              rating: true,
            },
            _count: {
              _all: true,
            },
          })
        : [];

    const ratingMap = new Map(
      ratingRows.map((row) => [
        row.product_id,
        {
          average_rating: Number((row._avg.rating ?? 0).toFixed(2)),
          total_reviews: row._count._all,
        },
      ]),
    );

    const productsWithRatings = products.map((product) => ({
      ...product,
      ...(ratingMap.get(product.id) ?? {
        average_rating: 0,
        total_reviews: 0,
      }),
    }));

    return res
      .status(200)
      .json(
        new ApiResponse(
          "Products retrieved successfully",
          productsWithRatings,
          totalCount,
        ),
      );
  },
);

const getTopRatedProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const parsedQuery = productQuerySchema.parse(req.query);
    const page = Math.max(Number(parsedQuery.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(parsedQuery.limit ?? 10), 1), 50);
    const skip = (page - 1) * limit;

    const topRatedReviewGroups = await prisma.review.groupBy({
      by: ["product_id"],
      _avg: {
        rating: true,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _avg: {
          rating: "desc",
        },
      },
      skip,
      take: limit,
    });

    const productIdsInOrder = topRatedReviewGroups.map(
      (group) => group.product_id,
    );

    if (productIdsInOrder.length === 0) {
      return res
        .status(200)
        .json(new ApiResponse("Top rated products retrieved successfully", []));
    }

    const products = await prisma.product.findMany({
      where: {
        id: {
          in: productIdsInOrder,
        },
        is_active: true,
      },
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
        variants: {
          take: 1,
          orderBy: {
            discounted_price: "asc",
          },
          select: {
            id: true,
            color: true,
            size: true,
            discounted_price: true,
            original_price: true,
            stock: true,
            sku: true,
            images: {
              take: 1,
              select: {
                id: true,
                image_url: true,
              },
            },
          },
        },
      },
    });

    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );
    const ratingMap = new Map(
      topRatedReviewGroups.map((group) => [
        group.product_id,
        {
          average_rating: Number((group._avg.rating ?? 0).toFixed(2)),
          total_reviews: group._count._all,
        },
      ]),
    );

    const topRatedProducts = productIdsInOrder
      .map((productId) => {
        const product = productMap.get(productId);

        if (!product) {
          return null;
        }

        return {
          ...product,
          ...(ratingMap.get(productId) ?? {
            average_rating: 0,
            total_reviews: 0,
          }),
        };
      })
      .filter((product): product is NonNullable<typeof product> =>
        Boolean(product),
      );

    return res
      .status(200)
      .json(
        new ApiResponse(
          "Top rated products retrieved successfully",
          topRatedProducts,
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
      id: true,
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
      (v) => (!color || v.color === color) && (!size || v.size === size),
    ) ?? product.variants[0];

  const productCouponApplicability: Prisma.CouponWhereInput = {
    OR: [
      { products: { none: {} } },
      { products: { some: { slug: slug as string } } },
    ],
  };

  const couponAudienceFilter: Prisma.CouponWhereInput = userId
    ? {
        OR: [{ is_global: true }, { users: { some: { id: userId } } }],
      }
    : {
        is_global: true,
      };

  const couponUsageFilter: Prisma.CouponWhereInput = userId
    ? {
        usages: {
          none: {
            user_id: userId,
          },
        },
      }
    : {};

  const coupons = await prisma.coupon.findMany({
    where: {
      is_active: true,
      start_date: { lte: new Date() },
      end_date: { gte: new Date() },
      AND: [
        couponAudienceFilter,
        productCouponApplicability,
        couponUsageFilter,
      ],
    },
    select: {
      code: true,
      id: true,
      discount_type: true,
      discount_value: true,
      max_discount: true,
      description: true,
      min_purchase: true,
      start_date: true,
      end_date: true,
    },
  });

  const ratingAggregate = await prisma.review.aggregate({
    where: {
      product_id: product.id,
    },
    _avg: {
      rating: true,
    },
    _count: {
      _all: true,
    },
  });

  return res.status(200).json(
    new ApiResponse("Product retrieved successfully", {
      ...product,
      selected_variant: selectedVariant,
      coupons,
      average_rating: Number((ratingAggregate._avg.rating ?? 0).toFixed(2)),
      total_reviews: ratingAggregate._count._all,
    }),
  );
});

const getSimilarProductsBySlug = asyncHandler(
  async (req: Request, res: Response) => {
    const rawSlug = req.params.slug;
    const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;

    if (!slug) {
      throw new ApiError(400, "slug is required");
    }

    const rawLimit = req.query.limit;
    const parsedLimit = Number(rawLimit ?? 8);
    const limit = Number.isInteger(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 20)
      : 8;

    const currentProduct = await prisma.product.findUnique({
      where: { slug },
      select: {
        id: true,
        category_id: true,
        brand: true,
      },
    });

    if (!currentProduct) {
      throw new ApiError(404, "Product not found");
    }

    const similarFilter: Prisma.ProductWhereInput = {
      id: { not: currentProduct.id },
      is_active: true,
      OR: [
        { category_id: currentProduct.category_id },
        ...(currentProduct.brand
          ? [
              {
                brand: {
                  equals: currentProduct.brand,
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ],
    };

    const similarProducts = await prisma.product.findMany({
      where: similarFilter,
      take: limit,
      orderBy: [{ is_trending: "desc" }, { created_at: "desc" }],
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
        variants: {
          take: 1,
          orderBy: {
            discounted_price: "asc",
          },
          select: {
            id: true,
            color: true,
            size: true,
            discounted_price: true,
            original_price: true,
            stock: true,
            sku: true,
            images: {
              take: 1,
              select: {
                id: true,
                image_url: true,
              },
            },
          },
        },
      },
    });

    if (similarProducts.length === 0) {
      return res
        .status(200)
        .json(new ApiResponse("Similar products retrieved successfully", []));
    }

    const similarProductIds = similarProducts.map((product) => product.id);

    const reviewGroups = await prisma.review.groupBy({
      by: ["product_id"],
      where: {
        product_id: {
          in: similarProductIds,
        },
      },
      _avg: {
        rating: true,
      },
      _count: {
        _all: true,
      },
    });

    const ratingMap = new Map(
      reviewGroups.map((group) => [
        group.product_id,
        {
          average_rating: Number((group._avg.rating ?? 0).toFixed(2)),
          total_reviews: group._count._all,
        },
      ]),
    );

    const result = similarProducts.map((product) => ({
      ...product,
      ...(ratingMap.get(product.id) ?? {
        average_rating: 0,
        total_reviews: 0,
      }),
    }));

    return res
      .status(200)
      .json(new ApiResponse("Similar products retrieved successfully", result));
  },
);

const checkProductAvailabilityByPincode = asyncHandler(
  async (req: Request, res: Response) => {
    const rawSlug = req.params.slug;
    const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;

    if (!slug) {
      throw new ApiError(400, "slug is required");
    }

    const { pincode } = productAvailabilityQuerySchema.parse(req.query);

    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });

    if (!product) {
      throw new ApiError(404, "Product not found");
    }

    const is_available =
      (await prisma.productPincode.count({
        where: {
          product_id: product.id,
          pincode,
        },
      })) === 0;

    return res.status(200).json(
      new ApiResponse("Product availability fetched successfully", {
        slug: product.slug,
        pincode,
        is_available,
      }),
    );
  },
);

const getProductUnserviceablePincodes = asyncHandler(
  async (req: Request, res: Response) => {
    const rawSlug = req.params.slug;
    const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;

    if (!slug) {
      throw new ApiError(400, "slug is required");
    }

    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });

    if (!product) {
      throw new ApiError(404, "Product not found");
    }

    const pincodeRows = await prisma.productPincode.findMany({
      where: { product_id: product.id },
      select: { pincode: true },
      orderBy: { pincode: "asc" },
    });

    return res.status(200).json(
      new ApiResponse("Product unserviceable pincodes fetched successfully", {
        slug: product.slug,
        unserviceable_pincodes: pincodeRows.map((row) => row.pincode),
      }),
    );
  },
);

const addProductUnserviceablePincodes = asyncHandler(
  async (req: Request, res: Response) => {
    const rawSlug = req.params.slug;
    const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;

    if (!slug) {
      throw new ApiError(400, "slug is required");
    }

    const { pincodes } = productPincodesBodySchema.parse(req.body);
    const normalizedPincodes = normalizePincodes(pincodes);

    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });

    if (!product) {
      throw new ApiError(404, "Product not found");
    }

    await prisma.productPincode.createMany({
      data: normalizedPincodes.map((pincode) => ({
        product_id: product.id,
        pincode,
      })),
      skipDuplicates: true,
    });

    const pincodeRows = await prisma.productPincode.findMany({
      where: { product_id: product.id },
      select: { pincode: true },
      orderBy: { pincode: "asc" },
    });

    return res.status(200).json(
      new ApiResponse("Product unserviceable pincodes added successfully", {
        slug: product.slug,
        unserviceable_pincodes: pincodeRows.map((row) => row.pincode),
      }),
    );
  },
);

const replaceProductUnserviceablePincodes = asyncHandler(
  async (req: Request, res: Response) => {
    const rawSlug = req.params.slug;
    const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;

    if (!slug) {
      throw new ApiError(400, "slug is required");
    }

    const { pincodes } = productPincodesBodySchema.parse(req.body);
    const normalizedPincodes = normalizePincodes(pincodes);

    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });

    if (!product) {
      throw new ApiError(404, "Product not found");
    }

    await prisma.$transaction(async (tx) => {
      await tx.productPincode.deleteMany({
        where: { product_id: product.id },
      });

      await tx.productPincode.createMany({
        data: normalizedPincodes.map((pincode) => ({
          product_id: product.id,
          pincode,
        })),
        skipDuplicates: true,
      });
    });

    return res.status(200).json(
      new ApiResponse("Product unserviceable pincodes replaced successfully", {
        slug: product.slug,
        unserviceable_pincodes: normalizedPincodes.sort(),
      }),
    );
  },
);

const removeProductUnserviceablePincode = asyncHandler(
  async (req: Request, res: Response) => {
    const rawSlug = req.params.slug;
    const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;

    if (!slug) {
      throw new ApiError(400, "slug is required");
    }

    const { pincode } = productPincodeParamSchema.parse(req.params);

    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });

    if (!product) {
      throw new ApiError(404, "Product not found");
    }

    const deleted = await prisma.productPincode.deleteMany({
      where: {
        product_id: product.id,
        pincode,
      },
    });

    if (deleted.count === 0) {
      throw new ApiError(
        404,
        "Unserviceable pincode not configured for this product",
      );
    }

    return res.status(200).json(
      new ApiResponse("Product unserviceable pincode removed successfully", {
        slug: product.slug,
        pincode,
      }),
    );
  },
);

const trackRecentlyVisitedProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.user_id;
    const rawSlug = req.params.slug;
    const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;

    if (!slug) {
      throw new ApiError(400, "slug is required");
    }

    const product = await prisma.product.findUnique({
      where: { slug },
      select: {
        id: true,
      },
    });

    if (!product) {
      throw new ApiError(404, "Product not found");
    }

    await prisma.recentlyViewedProduct.upsert({
      where: {
        user_id_product_id: {
          user_id: userId,
          product_id: product.id,
        },
      },
      create: {
        user_id: userId,
        product_id: product.id,
      },
      update: {
        updated_at: new Date(),
      },
    });

    return res.status(200).json(
      new ApiResponse("Recently visited product tracked successfully", {
        slug,
      }),
    );
  },
);

const getRecentlyVisitedProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.user_id;
    console.log({ userId, a: 10 });

    const recentlyViewedRows = await prisma.recentlyViewedProduct.findMany({
      where: {
        user_id: userId,
        product: {
          is_active: true,
        },
      },
      orderBy: {
        updated_at: "desc",
      },
      take: RECENTLY_VISITED_LIMIT,
      select: {
        product: {
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
            variants: {
              take: 1,
              orderBy: {
                discounted_price: "asc",
              },
              select: {
                color: true,
                size: true,
                discounted_price: true,
                original_price: true,
                stock: true,
                sku: true,
                images: {
                  take: 1,
                  select: {
                    image_url: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (recentlyViewedRows.length === 0) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            "Recently visited products retrieved successfully",
            [],
          ),
        );
    }

    const orderedProducts = recentlyViewedRows.map((row) => row.product);

    return res
      .status(200)
      .json(
        new ApiResponse(
          "Recently visited products retrieved successfully",
          orderedProducts,
        ),
      );
  },
);

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
  getTopRatedProducts,
  getProductBySlug,
  getSimilarProductsBySlug,
  checkProductAvailabilityByPincode,
  getProductUnserviceablePincodes,
  addProductUnserviceablePincodes,
  replaceProductUnserviceablePincodes,
  removeProductUnserviceablePincode,
  trackRecentlyVisitedProduct,
  getRecentlyVisitedProducts,
  getProductsByCategory,
  getAllProducts,
  getProductWithoutVariants,
  updateProduct,
  deleteVariant,
  deleteProduct,
};
