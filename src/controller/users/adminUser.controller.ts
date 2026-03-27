import type { Request, Response } from "express";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { getUserQuery, TokenPayload } from "./types.js";

const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const {
    search,
    role,
    limit = 20,
    page = 1,
    sort = "desc",
    status,
  } = req.query as getUserQuery & { status?: string };

  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const normalizedSort = String(sort).toLowerCase() === "asc" ? "asc" : "desc";

  const whereClause: {
    OR?: Array<{
      name?: { contains: string; mode: "insensitive" };
      email?: { contains: string; mode: "insensitive" };
    }>;
    role_id?: number;
    is_active?: boolean;
  } = {};

  if (search) {
    const keyword = String(search).trim();
    if (keyword) {
      whereClause.OR = [
        { name: { contains: keyword, mode: "insensitive" } },
        { email: { contains: keyword, mode: "insensitive" } },
      ];
    }
  }

  if (role !== undefined && role !== null && String(role).trim() !== "") {
    const parsedRole = Number(role);
    if (Number.isNaN(parsedRole)) {
      throw new ApiError(400, "role must be a number");
    }
    whereClause.role_id = parsedRole;
  }

  if (status !== undefined && status !== null && String(status).trim() !== "") {
    const normalizedStatus = String(status).trim().toLowerCase();
    if (normalizedStatus !== "active" && normalizedStatus !== "inactive") {
      throw new ApiError(400, "status must be active or inactive");
    }
    whereClause.is_active = normalizedStatus === "active";
  }

  const [users, totalUsers] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        phone_number: true,
        pnone_code: true,
        avatar_url: true,
        is_active: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            order: true,
          },
        },
        order: {
          select: {
            final_amount: true,
          },
        },
      },
      orderBy: {
        created_at: normalizedSort,
      },
      skip: (normalizedPage - 1) * normalizedLimit,
      take: normalizedLimit,
    }),
    prisma.user.count({ where: whereClause }),
  ]);

  const formattedUsers = users.map((user) => {
    const totalSpend = user.order.reduce(
      (sum, order) => sum + order.final_amount,
      0,
    );

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone_number: user.phone_number,
      phone_code: user.pnone_code,
      avatar_url: user.avatar_url,
      role: user.role?.name,
      status: user.is_active ? "active" : "inactive",
      total_orders: user._count.order,
      total_spent: totalSpend,
    };
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        "Users retrieved successfully",
        formattedUsers,
        totalUsers,
      ),
    );
});

const changeUserRole = asyncHandler(async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const { role_id } = req.body as { role_id?: number };
  const requesterUserId = (req.user as TokenPayload).user_id;

  if (Number.isNaN(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const parsedRoleId = Number(role_id);
  if (Number.isNaN(parsedRoleId)) {
    throw new ApiError(400, "role_id is required and must be a number");
  }

  if (userId === requesterUserId) {
    throw new ApiError(400, "You cannot change your own role");
  }

  const [user, role] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role_id: true,
      },
    }),
    prisma.role.findUnique({
      where: { id: parsedRoleId },
      select: { id: true, name: true },
    }),
  ]);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { role_id: parsedRoleId },
    select: {
      id: true,
      name: true,
      email: true,
      role_id: true,
      role: {
        select: {
          id: true,
          name: true,
        },
      },
      updated_at: true,
    },
  });

  res.status(200).json(
    new ApiResponse("User role updated successfully", {
      user: updatedUser,
    }),
  );
});

const changeUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const { is_active } = req.body as { is_active?: boolean };
  const requesterUserId = (req.user as TokenPayload).user_id;

  if (Number.isNaN(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  if (typeof is_active !== "boolean") {
    throw new ApiError(400, "is_active is required and must be boolean");
  }

  if (userId === requesterUserId && is_active === false) {
    throw new ApiError(400, "You cannot deactivate your own account");
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      is_active: true,
    },
  });

  if (!existingUser) {
    throw new ApiError(404, "User not found");
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { is_active },
    select: {
      id: true,
      name: true,
      email: true,
      is_active: true,
      updated_at: true,
    },
  });

  res.status(200).json(
    new ApiResponse("User status updated successfully", {
      user: {
        ...updatedUser,
        status: updatedUser.is_active ? "active" : "inactive",
      },
    }),
  );
});

const getUserFullDetailsById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const userId = req.user?.user_id || id;

    if (Number.isNaN(userId)) {
      throw new ApiError(400, "Invalid user ID");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        pnone_code: true,
        phone_number: true,
        avatar_url: true,
        is_active: true,
        role: {
          select: {
            name: true,
          },
        },
        cart: {
          where: { is_active: true },
          select: {
            items: {
              select: {
                quantity: true,
                price: true,
                product_variant: {
                  select: {
                    color: true,
                    size: true,
                    product: {
                      select: {
                        name: true,
                        slug: true,
                        brand: true,
                        category: {
                          select: {
                            name: true,
                          },
                        },
                      },
                    },
                    images: {
                      select: {
                        image_url: true,
                        is_primary: true,
                      },
                      orderBy: {
                        is_primary: "desc",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        wishlist: {
          orderBy: { created_at: "desc" },
          select: {
            product_variant: {
              select: {
                discounted_price: true,
                sku: true,
                stock: true,
                color: true,
                size: true,
                images: {
                  select: {
                    image_url: true,
                    is_primary: true,
                  },
                  orderBy: {
                    is_primary: "desc",
                  },
                },
                product: {
                  select: {
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
        },
        address: {
          orderBy: [{ is_default: "desc" }, { id: "desc" }],
          select: {
            id: true,
            first_name: true,
            last_name: true,
            phone_code: true,
            phone_number: true,
            line1: true,
            line2: true,
            city: true,
            state: true,
            pin_code: true,
            country: true,
            landmark: true,
            is_default: true,
            is_active: true,
          },
        },
        order: {
          orderBy: { created_at: "desc" },
          select: {
            order_number: true,
            total_amount: true,
            discount_amount: true,
            final_amount: true,
            status: true,
            payment_status: true,
            payment_method: true,
            created_at: true,
            items: {
              select: {
                quantity: true,
                price: true,
                product_variant: {
                  select: {
                    color: true,
                    size: true,
                    product: {
                      select: {
                        name: true,
                        slug: true,
                        brand: true,
                        category: {
                          select: {
                            name: true,
                          },
                        },
                      },
                    },
                    images: {
                      select: {
                        image_url: true,
                        is_primary: true,
                      },
                      orderBy: {
                        is_primary: "desc",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const now = new Date();
    const coupons = await prisma.coupon.findMany({
      where: {
        is_active: true,
        start_date: { lte: now },
        end_date: { gte: now },
        OR: [{ is_global: true }, { users: { some: { id: userId } } }],
      },
      select: {
        id: true,
        code: true,
        description: true,
        discount_type: true,
        discount_value: true,
        max_discount: true,
        min_purchase: true,
        max_uses: true,
        max_uses_per_user: true,
        start_date: true,
        end_date: true,
        is_global: true,
        _count: {
          select: {
            usages: true,
          },
        },
        usages: {
          where: { user_id: userId },
          select: { id: true },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    const couponsAvailable = coupons
      .filter((coupon) => {
        const withinTotalUsageLimit =
          coupon.max_uses === null || coupon._count.usages < coupon.max_uses;
        const withinUserUsageLimit =
          coupon.max_uses_per_user === null ||
          coupon.usages.length < coupon.max_uses_per_user;

        return withinTotalUsageLimit && withinUserUsageLimit;
      })
      .map((coupon) => ({
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        max_discount: coupon.max_discount,
        min_purchase: coupon.min_purchase,
        max_uses: coupon.max_uses,
        max_uses_per_user: coupon.max_uses_per_user,
        start_date: coupon.start_date,
        end_date: coupon.end_date,
        is_global: coupon.is_global,
      }));

    const cartDetails = (user.cart[0]?.items ?? []).map((item) => ({
      name: item.product_variant.product.name,
      slug: item.product_variant.product.slug,
      brand: item.product_variant.product.brand ?? "",
      category: item.product_variant.product.category?.name ?? "",
      color: item.product_variant.color ?? "",
      size: item.product_variant.size ?? undefined,
      price: item.price,
      quantity: item.quantity,
      image: item.product_variant.images[0]?.image_url,
    }));

    const wishlistDetails = user.wishlist.map((item) => ({
      price: item.product_variant.discounted_price,
      name: item.product_variant.product.name,
      slug: item.product_variant.product.slug,
      sku: item.product_variant.sku,
      stock: item.product_variant.stock,
      color: item.product_variant.color ?? "",
      size: item.product_variant.size ?? "",
      image: item.product_variant.images[0]?.image_url ?? "",
    }));

    const addressDetails = user.address.map((address) => ({
      id: address.id,
      first_name: address.first_name,
      last_name: address.last_name,
      phone_code: address.phone_code,
      phone_number: address.phone_number,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pin_code: address.pin_code,
      country: address.country,
      landmark: address.landmark,
      is_default: address.is_default,
      is_active: address.is_active,
    }));

    const orderDetails = user.order.map((order) => ({
      order_number: order.order_number,
      items: order.items.map((item) => ({
        name: item.product_variant.product.name,
        slug: item.product_variant.product.slug,
        brand: item.product_variant.product.brand ?? "",
        category: item.product_variant.product.category?.name ?? "",
        color: item.product_variant.color ?? "",
        size: item.product_variant.size ?? undefined,
        price: item.price,
        quantity: item.quantity,
        images: item.product_variant.images,
      })),
      total_amount: order.total_amount,
      discount_amount: order.discount_amount,
      final_amount: order.final_amount,
      purchase_date: order.created_at.toISOString(),
      payment_status: order.payment_status,
      payment_method: order.payment_method ?? undefined,
      status: order.status,
    }));

    const payload = {
      personal_info: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone_code: user.pnone_code,
        phone_number: user.phone_number,
        avatar_url: user.avatar_url,
        role: user.role?.name,
        status: user.is_active ? "active" : "inactive",
      },
      cart_details: cartDetails,
      wishlist_details: wishlistDetails,
      address_details: addressDetails,
      order_details: orderDetails,
      coupons_available: couponsAvailable,
    };

    return res
      .status(200)
      .json(
        new ApiResponse("User full details retrieved successfully", payload),
      );
  },
);

export {
  getAllUsers,
  changeUserRole,
  changeUserStatus,
  getUserFullDetailsById,
};
