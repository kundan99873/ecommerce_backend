import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { uploadMediaToCloudinary } from "../../helper/uploadFileToCloudinary.js";
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

const addProduct = asyncHandler(
  async (req: Request, res: Response): Promise<Response> => {
    const { name, description, brand, category, variants } =
      req.body as addProductInput;

    if (!name || !category || !variants) {
      throw new ApiError(400, "Name, category, and variants are required");
    }

    // ---------- Parse Variants ----------
    const parsedVariants: VariantInput[] =
      typeof variants === "string" ? JSON.parse(variants) : variants;

    if (!Array.isArray(parsedVariants) || parsedVariants.length === 0) {
      throw new ApiError(400, "Variants must be non-empty array");
    }

    // ---------- Validate Category ----------
    const categoryDetails = await prisma.category.findUnique({
      where: { slug: category },
      select: { id: true },
    });

    if (!categoryDetails) {
      throw new ApiError(404, "Category not found");
    }

    // ---------- Check duplicate product ----------
    const existingProduct = await prisma.product.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
      },
    });

    if (existingProduct) {
      throw new ApiError(400, "Product already exists");
    }

    // ---------- Generate Slug (Simple version) ----------
    const baseSlug = name.toLowerCase().trim().replace(/\s+/g, "-");
    const slug = `${baseSlug}-${Date.now()}`; // prevents race condition

    // ---------- Group Files ----------
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

    // =========================================================
    // 🔥 STEP 1: Upload ALL Images BEFORE Transaction
    // =========================================================

    const uploadedVariantImages: Record<
      string,
      { image_url: string; image_public_id: string }[]
    > = {};

    for (let i = 0; i < parsedVariants.length; i++) {
      const key = `variants[${i}]`;
      const images = variantImageMap[key] || [];

      if (images.length > 0) {
        const uploadResults = await uploadMediaToCloudinary(images);

        uploadedVariantImages[key] = uploadResults.map((img: any) => ({
          image_url: img.secure_url,
          image_public_id: img.public_id,
        }));
      } else {
        uploadedVariantImages[key] = [];
      }
    }

    // =========================================================
    // 🔥 STEP 2: Transaction (ONLY DB OPERATIONS)
    // =========================================================

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
            sku: generateSku(
              newProduct.name,
              variant.color,
              variant.size
            ),
          },
        });

        const images = uploadedVariantImages[`variants[${i}]`] || [];

        if (images.length > 0) {
          await tx.productImage.createMany({
            data: images.map((img) => ({
              variant_id: createdVariant.id,
              image_url: img.image_url,
              image_public_id: img.image_public_id,
            })),
          });
        }
      }

      return newProduct;
    });

    return res.status(201).json(
      new ApiResponse(
        "Product with variants created successfully",
        product
      )
    );
  }
);


const getAllProducts = asyncHandler(async (req: Request, res: Response) => {
  const parsedQuery = productQuerySchema.parse(req.query);
  const userId = req.user?.user_id;
  console.log({ userId });
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
  };

  const [totalProducts, products] = await Promise.all([
    prisma.product.count({
      where: whereCondition,
    }),
    prisma.product.findMany({
      where: whereCondition,
      take: limit,
      skip: (page - 1) * limit,
      orderBy,
      select: {
        name: true,
        slug: true,
        description: true,
        brand: true,
        category: {
          select: {
            name: true,
          },
        },
        variants: {
          select: {
            color: true,
            size: true,
            original_price: true,
            discounted_price: true,
            stock: true,
            sku: true,
            images: {
              select: {
                image_url: true,
              },
            },
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

const updateProduct = asyncHandler(
  async (req: Request, res: Response): Promise<Response> => {
    const { slug } = req.params;
    const { name, description, brand, category, variants } = req.body;

    if (!slug) throw new ApiError(400, "Product slug is required");

    const existingProduct = await prisma.product.findUnique({
      where: { slug: slug as string },
      include: { variants: true },
    });

    if (!existingProduct) throw new ApiError(404, "Product not found");

    // Parse variants safely
    let parsedVariants: VariantInput[] = [];
    if (variants) {
      try {
        parsedVariants =
          typeof variants === "string" ? JSON.parse(variants) : variants;
      } catch {
        throw new ApiError(400, "Invalid variants format");
      }
    }

    for (const v of parsedVariants) {
      if (
        isNaN(Number(v.original_price)) ||
        isNaN(Number(v.discounted_price)) ||
        isNaN(Number(v.stock))
      ) {
        throw new ApiError(400, "Invalid numeric values in variants");
      }

      if (Number(v.stock) < 0) {
        throw new ApiError(400, "Stock cannot be negative");
      }
    }

    // Validate category if changed
    let categoryId = existingProduct.category_id;
    if (category) {
      const categoryDetails = await prisma.category.findUnique({
        where: { slug: category },
        select: { id: true },
      });

      if (!categoryDetails) throw new ApiError(404, "Category not found");

      categoryId = categoryDetails.id;
    }

    // // Case-insensitive duplicate name check
    // if (name && name !== existingProduct.name) {
    //   const duplicate = await prisma.product.findFirst({
    //     where: {
    //       name: { equals: name, mode: "insensitive" },
    //       NOT: { id: existingProduct.id },
    //     },
    //   });

    //   if (duplicate)
    //     throw new ApiError(400, "Another product with this name exists");
    // }

    // Generate unique slug if name changed
    let updatedSlug = existingProduct.slug;

    if (name && name !== existingProduct.name) {
      let baseSlug = name.toLowerCase().trim().replace(/\s+/g, "-");
      let tempSlug = baseSlug;
      let counter = 1;

      while (
        await prisma.product.findFirst({
          where: {
            slug: tempSlug,
            NOT: { id: existingProduct.id },
          },
        })
      ) {
        tempSlug = `${baseSlug}-${counter++}`;
      }

      updatedSlug = tempSlug;
    }

    // Group uploaded files by fieldname
    const files = req.files as Express.Multer.File[];
    const groupedFiles: Record<string, Express.Multer.File[]> = {};

    if (files) {
      for (const file of files) {
        if (!groupedFiles[file.fieldname]) {
          groupedFiles[file.fieldname] = [];
        }
        groupedFiles[file.fieldname]!.push(file);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1️⃣ Update product
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

      // 2️⃣ Delete removed variants
      const variantsToDelete = existingVariantIds.filter(
        (id) => !incomingVariantIds.includes(id),
      );

      if (variantsToDelete.length) {
        await tx.productVariant.deleteMany({
          where: { id: { in: variantsToDelete } },
        });
      }

      // 3️⃣ Create / Update variants
      for (let i = 0; i < parsedVariants.length; i++) {
        const variant = parsedVariants[i];
        if (!variant) continue;

        const variantImages = groupedFiles[`images_${i}`] || [];

        let uploadedImages: {
          secure_url: string;
          public_id: string;
        }[] = [];

        if (variantImages.length > 0) {
          const uploadResults = await uploadMediaToCloudinary(variantImages);
          uploadedImages = uploadResults.map((img: any) => ({
            secure_url: img.secure_url,
            public_id: img.public_id,
          }));
        }

        if (variant.id) {
          // Ensure variant belongs to this product
          const belongsToProduct = existingVariantIds.includes(variant.id);
          if (!belongsToProduct) throw new ApiError(400, "Invalid variant ID");

          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
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
              ...(uploadedImages.length > 0 && {
                images: {
                  create: uploadedImages.map((img) => ({
                    image_url: img.secure_url,
                    image_public_id: img.public_id,
                  })),
                },
              }),
            },
          });
        } else {
          await tx.productVariant.create({
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

      return updatedProduct;
    });

    return res
      .status(200)
      .json(new ApiResponse("Product updated successfully", result));
  },
);

const getProductBySlug = asyncHandler(async (req: Request, res: Response) => {
  const { slug: rawSlug, active = false } = req.query;

  const slug = typeof rawSlug === "string" ? rawSlug : undefined;

  if (!slug) {
    throw new ApiError(400, "slug is required");
  }

  const product = await prisma.product.findUnique({
    where: { slug: slug as string },
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
