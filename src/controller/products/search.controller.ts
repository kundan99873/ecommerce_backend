import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import type { Prisma } from "../../../generated/prisma/client.js";

const searchProducts = asyncHandler(async (req: Request, res: Response) => {
  const { search, category, brand, sort, page = 1, limit = 20 } = req.query;
  const userId = req.user?.user_id;

  if (!search || typeof search !== "string" || search.trim().length === 0) {
    throw new ApiError(400, "Search query is required");
  }

  const searchTrim = search.trim();
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  if (userId) {
    await prisma.searchHistory.create({
      data: {
        user_id: userId,
        search_query: searchTrim,
        category_filter: category ? String(category) : null,
        brand_filter: brand ? String(brand) : null,
      },
    });
  }

  // Build where condition for product search
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

  let categoryId: number | null = null;
  if (category && typeof category === "string") {
    const categoryDetails = await prisma.category.findUnique({
      where: { slug: category },
      select: { id: true },
    });
    if (categoryDetails) {
      categoryId = categoryDetails.id;
    }
  }

  const whereCondition: Prisma.ProductWhereInput = {
    is_active: true,
    OR: [
      {
        name: {
          contains: searchTrim,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: searchTrim,
          mode: "insensitive",
        },
      },
      {
        brand: {
          contains: searchTrim,
          mode: "insensitive",
        },
      },
      {
        category: {
          name: {
            contains: searchTrim,
            mode: "insensitive",
          },
        },
      },
    ],
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(brand ? { brand: { equals: String(brand), mode: "insensitive" } } : {}),
  };

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where: whereCondition,
      include: {
        category: true,
        variants: {
          where: { is_active: true },
          include: {
            images: {
              where: { is_primary: true },
              take: 1,
            },
          },
        },
        review: {
          select: { rating: true },
        },
      },
      orderBy,
      skip,
      take: limitNum,
    }),
    prisma.product.count({ where: whereCondition }),
  ]);

  const formattedProducts = products.map((product) => {
    const mainVariant = product.variants[0];
    const avgRating =
      product.review.length > 0
        ? Math.round(
            (product.review.reduce((sum, r) => sum + r.rating, 0) /
              product.review.length) *
              10,
          ) / 10
        : 0;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      brand: product.brand,
      category: product.category?.name,
      price: mainVariant?.discounted_price,
      originalPrice: mainVariant?.original_price,
      stock: mainVariant?.stock,
      rating: avgRating,
      reviewCount: product.review.length,
      image: mainVariant?.images[0]?.image_url || null,
    };
  });

  const totalPages = Math.ceil(totalCount / limitNum);

  return res.status(200).json(
    new ApiResponse("Products searched successfully", {
      products: formattedProducts,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalProducts: totalCount,
        limit: limitNum,
      },
    }),
  );
});

const getRecentSearches = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.user_id;

  if (!userId) {
    throw new ApiError(401, "User not authenticated");
  }

  const recentSearches = await prisma.searchHistory.findMany({
    where: { user_id: userId },
    select: {
      id: true,
      search_query: true,
      category_filter: true,
      brand_filter: true,
      created_at: true,
    },
    orderBy: { created_at: "desc" },
    take: 3,
  });

  return res.status(200).json(
    new ApiResponse("Recent searches retrieved successfully", {
      searches: recentSearches,
    }),
  );
});

export { searchProducts, getRecentSearches };
