import type { Request, Response } from "express";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

type AdminDashboardQuery = {
  from?: string;
  to?: string;
};

type RevenueGroupBy = "day" | "week" | "month";

type AdminRevenueQuery = {
  group_by?: RevenueGroupBy;
  from?: string;
  to?: string;
};

type WeeklyVisitorsQuery = {
  from?: string;
  to?: string;
};

type SalesByCategoryQuery = {
  from?: string;
  to?: string;
};

type AdminOrderStatusQuery = {
  from?: string;
  to?: string;
};

type AdminRecentOrdersQuery = {
  from?: string;
  to?: string;
  limit?: string;
  status?: string;
};

type AdminLowStockQuery = {
  threshold?: string;
  limit?: string;
  stock_type?: "all" | "low_stock" | "out_of_stock";
};

const parseDateInput = (dateInput: string, fieldName: "from" | "to"): Date => {
  const trimmedInput = dateInput.trim();
  const isDateOnlyInput = /^\d{4}-\d{2}-\d{2}$/.test(trimmedInput);

  const normalizedInput = isDateOnlyInput
    ? `${trimmedInput}${fieldName === "from" ? "T00:00:00.000Z" : "T23:59:59.999Z"}`
    : trimmedInput;

  const parsedDate = new Date(normalizedInput);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(
      400,
      `${fieldName} must be a valid ISO date string (example: 2026-03-01 or 2026-03-01T00:00:00.000Z)`,
    );
  }

  return parsedDate;
};

const calculateGrowth = (currentValue: number, previousValue: number) => {
  if (previousValue === 0) {
    if (currentValue === 0) return 0;
    return null;
  }

  return Number(
    (((currentValue - previousValue) / previousValue) * 100).toFixed(2),
  );
};

const getRangeDates = (query: AdminDashboardQuery) => {
  const currentDate = new Date();
  const defaultFromDate = new Date(
    Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      1,
      0,
      0,
      0,
      0,
    ),
  );

  const fromDate = query.from
    ? parseDateInput(query.from, "from")
    : defaultFromDate;
  const toDate = query.to ? parseDateInput(query.to, "to") : currentDate;

  if (fromDate > toDate) {
    throw new ApiError(400, "from date cannot be after to date");
  }

  const currentPeriodDurationMs = Math.max(
    toDate.getTime() - fromDate.getTime(),
    0,
  );
  const previousToDate = new Date(fromDate.getTime() - 1);
  const previousFromDate = new Date(
    previousToDate.getTime() - currentPeriodDurationMs,
  );

  return {
    fromDate,
    toDate,
    previousFromDate,
    previousToDate,
  };
};

const getDashboardPeriodMetrics = async (fromDate: Date, toDate: Date) => {
  const createdAtRangeFilter = {
    gte: fromDate,
    lte: toDate,
  };

  const successfulOrderFilter = {
    created_at: createdAtRangeFilter,
    payment_status: PaymentStatus.SUCCESS,
    status: {
      not: OrderStatus.CANCELLED,
    },
  };

  const [
    successfulOrderAggregate,
    totalOrders,
    totalUsers,
    totalProducts,
    activeCustomerGroups,
    totalRegisteredUsersTillPeriodEnd,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: successfulOrderFilter,
      _sum: {
        final_amount: true,
      },
      _count: {
        id: true,
      },
    }),
    prisma.order.count({
      where: {
        created_at: createdAtRangeFilter,
      },
    }),
    prisma.user.count({
      where: {
        created_at: createdAtRangeFilter,
      },
    }),
    prisma.product.count({
      where: {
        created_at: createdAtRangeFilter,
      },
    }),
    prisma.order.groupBy({
      by: ["user_id"],
      where: successfulOrderFilter,
    }),
    prisma.user.count({
      where: {
        created_at: {
          lte: toDate,
        },
      },
    }),
  ]);

  const totalRevenue = successfulOrderAggregate._sum.final_amount ?? 0;
  const successfulOrderCount = successfulOrderAggregate._count.id;
  const averageOrderValue =
    successfulOrderCount > 0
      ? Number((totalRevenue / successfulOrderCount).toFixed(2))
      : 0;

  const activeCustomers = activeCustomerGroups.length;
  const conversionRate =
    totalRegisteredUsersTillPeriodEnd > 0
      ? Number(
          ((activeCustomers / totalRegisteredUsersTillPeriodEnd) * 100).toFixed(
            2,
          ),
        )
      : 0;

  return {
    totalRevenue,
    totalOrders,
    totalUsers,
    totalProducts,
    averageOrderValue,
    activeCustomers,
    conversionRate,
  };
};

const getAdminHomeDashboardStats = asyncHandler(
  async (req: Request, res: Response) => {
    const { fromDate, toDate, previousFromDate, previousToDate } =
      getRangeDates(req.query as AdminDashboardQuery);

    const [currentPeriodMetrics, previousPeriodMetrics] = await Promise.all([
      getDashboardPeriodMetrics(fromDate, toDate),
      getDashboardPeriodMetrics(previousFromDate, previousToDate),
    ]);

    const payload = {
      filter: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      comparison_period: {
        from: previousFromDate.toISOString(),
        to: previousToDate.toISOString(),
      },
      summary: {
        total_revenue: currentPeriodMetrics.totalRevenue,
        total_orders: currentPeriodMetrics.totalOrders,
        total_users: currentPeriodMetrics.totalUsers,
        total_products: currentPeriodMetrics.totalProducts,
        avg_order_value: currentPeriodMetrics.averageOrderValue,
        conversion_rate: currentPeriodMetrics.conversionRate,
        active_customers: currentPeriodMetrics.activeCustomers,
      },
      growth_vs_previous_period: {
        total_revenue: calculateGrowth(
          currentPeriodMetrics.totalRevenue,
          previousPeriodMetrics.totalRevenue,
        ),
        total_orders: calculateGrowth(
          currentPeriodMetrics.totalOrders,
          previousPeriodMetrics.totalOrders,
        ),
        total_users: calculateGrowth(
          currentPeriodMetrics.totalUsers,
          previousPeriodMetrics.totalUsers,
        ),
        total_products: calculateGrowth(
          currentPeriodMetrics.totalProducts,
          previousPeriodMetrics.totalProducts,
        ),
        avg_order_value: calculateGrowth(
          currentPeriodMetrics.averageOrderValue,
          previousPeriodMetrics.averageOrderValue,
        ),
        conversion_rate: calculateGrowth(
          currentPeriodMetrics.conversionRate,
          previousPeriodMetrics.conversionRate,
        ),
        active_customers: calculateGrowth(
          currentPeriodMetrics.activeCustomers,
          previousPeriodMetrics.activeCustomers,
        ),
      },
    };

    return res
      .status(200)
      .json(
        new ApiResponse(
          "Admin dashboard stats retrieved successfully",
          payload,
        ),
      );
  },
);

const formatDateKey = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getStartOfUtcDay = (value: Date) =>
  new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );

const getStartOfUtcMonth = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0),
  );

const getStartOfUtcWeek = (value: Date) => {
  const day = value.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const base = getStartOfUtcDay(value);
  base.setUTCDate(base.getUTCDate() - daysSinceMonday);
  return base;
};

const addBucketStep = (value: Date, groupBy: RevenueGroupBy) => {
  if (groupBy === "day") {
    value.setUTCDate(value.getUTCDate() + 1);
    return;
  }

  if (groupBy === "week") {
    value.setUTCDate(value.getUTCDate() + 7);
    return;
  }

  value.setUTCMonth(value.getUTCMonth() + 1);
};

const resolveRevenueDateRange = (
  groupBy: RevenueGroupBy,
  query: AdminRevenueQuery,
) => {
  const now = new Date();
  const toDate = query.to ? parseDateInput(query.to, "to") : now;

  let fromDate: Date;
  if (query.from) {
    fromDate = parseDateInput(query.from, "from");
  } else if (groupBy === "day") {
    fromDate = getStartOfUtcDay(new Date(toDate));
    fromDate.setUTCDate(fromDate.getUTCDate() - 6);
  } else if (groupBy === "week") {
    fromDate = getStartOfUtcWeek(new Date(toDate));
    fromDate.setUTCDate(fromDate.getUTCDate() - 7 * 7);
  } else {
    fromDate = getStartOfUtcMonth(new Date(toDate));
    fromDate.setUTCMonth(fromDate.getUTCMonth() - 5);
  }

  if (fromDate > toDate) {
    throw new ApiError(400, "from date cannot be after to date");
  }

  return { fromDate, toDate };
};

const getBucketStart = (value: Date, groupBy: RevenueGroupBy) => {
  if (groupBy === "day") return getStartOfUtcDay(value);
  if (groupBy === "week") return getStartOfUtcWeek(value);
  return getStartOfUtcMonth(value);
};

const getRevenueBucketLabel = (bucketStart: Date, groupBy: RevenueGroupBy) => {
  if (groupBy === "day") {
    return formatDateKey(bucketStart);
  }

  if (groupBy === "week") {
    const weekEnd = new Date(bucketStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    return `${formatDateKey(bucketStart)} to ${formatDateKey(weekEnd)}`;
  }

  return bucketStart.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const getRevenueBucketKey = (date: Date, groupBy: RevenueGroupBy) => {
  const bucketStart = getBucketStart(date, groupBy);

  if (groupBy === "month") {
    const year = bucketStart.getUTCFullYear();
    const month = String(bucketStart.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  return formatDateKey(bucketStart);
};

const getAdminRevenueTimeline = asyncHandler(
  async (req: Request, res: Response) => {
    const query = req.query as AdminRevenueQuery;
    const groupBy: RevenueGroupBy = query.group_by ?? "month";

    if (!["day", "week", "month"].includes(groupBy)) {
      throw new ApiError(400, "group_by must be one of: day, week, month");
    }

    const { fromDate, toDate } = resolveRevenueDateRange(groupBy, query);

    const bucketMap = new Map<string, { label: string; revenue: number }>();
    const bucketStart = getBucketStart(fromDate, groupBy);
    const lastBucketStart = getBucketStart(toDate, groupBy);

    while (bucketStart <= lastBucketStart) {
      const key = getRevenueBucketKey(bucketStart, groupBy);
      bucketMap.set(key, {
        label: getRevenueBucketLabel(bucketStart, groupBy),
        revenue: 0,
      });
      addBucketStep(bucketStart, groupBy);
    }

    const paidOrders = await prisma.order.findMany({
      where: {
        created_at: {
          gte: fromDate,
          lte: toDate,
        },
        payment_status: PaymentStatus.SUCCESS,
        status: {
          not: OrderStatus.CANCELLED,
        },
      },
      select: {
        created_at: true,
        final_amount: true,
      },
    });

    for (const order of paidOrders) {
      const key = getRevenueBucketKey(order.created_at, groupBy);
      const bucket = bucketMap.get(key);
      if (!bucket) continue;

      bucket.revenue += order.final_amount;
    }

    const series = Array.from(bucketMap.entries()).map(([key, value]) => ({
      key,
      label: value.label,
      revenue: value.revenue,
    }));

    const totalRevenue = series.reduce((sum, entry) => sum + entry.revenue, 0);

    return res.status(200).json(
      new ApiResponse("Admin revenue timeline retrieved successfully", {
        group_by: groupBy,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        total_revenue: totalRevenue,
        series,
      }),
    );
  },
);

const getAdminTopSellingProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const { fromDate, toDate } = getRangeDates(
      req.query as AdminDashboardQuery,
    );

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          created_at: {
            gte: fromDate,
            lte: toDate,
          },
          payment_status: PaymentStatus.SUCCESS,
          status: {
            not: OrderStatus.CANCELLED,
          },
        },
      },
      select: {
        quantity: true,
        price: true,
        product_variant: {
          select: {
            discounted_price: true,
            images: {
              where: {
                is_primary: true,
              },
              take: 1,
              select: {
                image_url: true,
              },
            },
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                _count: {
                  select: {
                    review: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const productMap = new Map<
      number,
      {
        product_id: number;
        name: string;
        slug: string;
        review_count: number;
        image_url: string | null;
        current_price: number;
        total_units_sold: number;
        total_revenue: number;
      }
    >();

    for (const item of orderItems) {
      const product = item.product_variant.product;
      const existing = productMap.get(product.id);

      if (!existing) {
        productMap.set(product.id, {
          product_id: product.id,
          name: product.name,
          slug: product.slug,
          review_count: product._count.review,
          image_url: item.product_variant.images[0]?.image_url ?? null,
          current_price: item.product_variant.discounted_price,
          total_units_sold: item.quantity,
          total_revenue: item.quantity * item.price,
        });
        continue;
      }

      existing.total_units_sold += item.quantity;
      existing.total_revenue += item.quantity * item.price;

      if (!existing.image_url && item.product_variant.images[0]?.image_url) {
        existing.image_url = item.product_variant.images[0].image_url;
      }
    }

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => {
        if (b.total_units_sold !== a.total_units_sold) {
          return b.total_units_sold - a.total_units_sold;
        }

        return b.total_revenue - a.total_revenue;
      })
      .slice(0, 5)
      .map((product, index) => ({
        rank: index + 1,
        ...product,
      }));

    return res.status(200).json(
      new ApiResponse("Admin top selling products retrieved successfully", {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        products: topProducts,
      }),
    );
  },
);

const getStartOfCurrentUtcWeek = () => {
  const now = new Date();
  const start = getStartOfUtcDay(now);
  const day = start.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
};

const resolveVisitorsRange = (query: WeeklyVisitorsQuery) => {
  if (query.from || query.to) {
    const fromDate = query.from
      ? parseDateInput(query.from, "from")
      : getStartOfCurrentUtcWeek();
    const toDate = query.to ? parseDateInput(query.to, "to") : new Date();

    if (fromDate > toDate) {
      throw new ApiError(400, "from date cannot be after to date");
    }

    return { fromDate, toDate };
  }

  const fromDate = getStartOfCurrentUtcWeek();
  const toDate = new Date(fromDate);
  toDate.setUTCDate(toDate.getUTCDate() + 6);
  toDate.setUTCHours(23, 59, 59, 999);

  return { fromDate, toDate };
};

const getAdminWeeklyVisitorsAndConversions = asyncHandler(
  async (req: Request, res: Response) => {
    const { fromDate, toDate } = resolveVisitorsRange(
      req.query as WeeklyVisitorsQuery,
    );

    const dayMap = new Map<
      string,
      {
        date: string;
        day: string;
        visitors: number;
        conversions: number;
      }
    >();

    const cursor = getStartOfUtcDay(fromDate);
    const end = getStartOfUtcDay(toDate);

    while (cursor <= end) {
      const key = formatDateKey(cursor);
      dayMap.set(key, {
        date: key,
        day: cursor.toLocaleString("en-US", {
          weekday: "short",
          timeZone: "UTC",
        }),
        visitors: 0,
        conversions: 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const [sessionRows, conversionOrders] = await Promise.all([
      prisma.userSession.findMany({
        where: {
          created_at: {
            gte: fromDate,
            lte: toDate,
          },
        },
        select: {
          user_id: true,
          created_at: true,
        },
      }),
      prisma.order.findMany({
        where: {
          created_at: {
            gte: fromDate,
            lte: toDate,
          },
          payment_status: PaymentStatus.SUCCESS,
          status: {
            not: OrderStatus.CANCELLED,
          },
        },
        select: {
          created_at: true,
        },
      }),
    ]);

    const uniqueVisitorsByDate = new Map<string, Set<number>>();
    for (const row of sessionRows) {
      const key = formatDateKey(row.created_at);
      const existing = uniqueVisitorsByDate.get(key);
      if (existing) {
        existing.add(row.user_id);
      } else {
        uniqueVisitorsByDate.set(key, new Set([row.user_id]));
      }
    }

    for (const [key, visitors] of uniqueVisitorsByDate.entries()) {
      const dayItem = dayMap.get(key);
      if (!dayItem) continue;
      dayItem.visitors = visitors.size;
    }

    for (const order of conversionOrders) {
      const key = formatDateKey(order.created_at);
      const dayItem = dayMap.get(key);
      if (!dayItem) continue;
      dayItem.conversions += 1;
    }

    const series = Array.from(dayMap.values());
    const totalVisitors = series.reduce((sum, item) => sum + item.visitors, 0);
    const totalConversions = series.reduce(
      (sum, item) => sum + item.conversions,
      0,
    );

    const conversionRate =
      totalVisitors > 0
        ? Number(((totalConversions / totalVisitors) * 100).toFixed(2))
        : 0;

    return res.status(200).json(
      new ApiResponse(
        "Admin weekly visitors and conversions retrieved successfully",
        {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          total_visitors: totalVisitors,
          total_conversions: totalConversions,
          conversion_rate: conversionRate,
          series,
        },
      ),
    );
  },
);

const getAdminSalesByCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { fromDate, toDate } = getRangeDates(
      req.query as SalesByCategoryQuery,
    );

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          created_at: {
            gte: fromDate,
            lte: toDate,
          },
          payment_status: PaymentStatus.SUCCESS,
          status: {
            not: OrderStatus.CANCELLED,
          },
        },
      },
      select: {
        quantity: true,
        price: true,
        product_variant: {
          select: {
            product: {
              select: {
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const categoryMap = new Map<
      number,
      {
        category_id: number;
        name: string;
        revenue: number;
        units_sold: number;
      }
    >();

    for (const item of orderItems) {
      const category = item.product_variant.product.category;
      if (!category) continue;

      const existing = categoryMap.get(category.id);
      if (!existing) {
        categoryMap.set(category.id, {
          category_id: category.id,
          name: category.name,
          revenue: item.quantity * item.price,
          units_sold: item.quantity,
        });
        continue;
      }

      existing.revenue += item.quantity * item.price;
      existing.units_sold += item.quantity;
    }

    const totalRevenue = Array.from(categoryMap.values()).reduce(
      (sum, item) => sum + item.revenue,
      0,
    );

    const categories = Array.from(categoryMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((item) => ({
        ...item,
        percentage:
          totalRevenue > 0
            ? Number(((item.revenue / totalRevenue) * 100).toFixed(2))
            : 0,
      }));

    return res.status(200).json(
      new ApiResponse("Admin sales by category retrieved successfully", {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        total_revenue: totalRevenue,
        categories,
      }),
    );
  },
);

const parseLimit = (
  rawLimit: string | undefined,
  fallback: number,
  max: number,
) => {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), max);
};

const formatStatusLabel = (status: string) =>
  status
    .toLowerCase()
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");

const getAdminOrderStatusSummary = asyncHandler(
  async (req: Request, res: Response) => {
    const { fromDate, toDate } = getRangeDates(
      req.query as AdminOrderStatusQuery,
    );

    const grouped = await prisma.order.groupBy({
      by: ["status"],
      where: {
        created_at: {
          gte: fromDate,
          lte: toDate,
        },
      },
      _count: {
        id: true,
      },
    });

    const totalOrders = grouped.reduce((sum, row) => sum + row._count.id, 0);

    const statusSummary = grouped
      .map((row) => ({
        status: row.status,
        label: formatStatusLabel(row.status),
        count: row._count.id,
        percentage:
          totalOrders > 0
            ? Number(((row._count.id / totalOrders) * 100).toFixed(2))
            : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return res.status(200).json(
      new ApiResponse("Admin order status summary retrieved successfully", {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        total_orders: totalOrders,
        statuses: statusSummary,
      }),
    );
  },
);

const getAdminRecentOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const query = req.query as AdminRecentOrdersQuery;
    const { fromDate, toDate } = getRangeDates(query);

    const limit = parseLimit(query.limit, 5, 50);

    let normalizedStatus: OrderStatus | undefined;
    if (query.status) {
      normalizedStatus = query.status.trim().toUpperCase() as OrderStatus;
      if (!Object.values(OrderStatus).includes(normalizedStatus)) {
        throw new ApiError(400, "Invalid status filter");
      }
    }

    const recentOrders = await prisma.order.findMany({
      where: {
        created_at: {
          gte: fromDate,
          lte: toDate,
        },
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
      },
      orderBy: {
        created_at: "desc",
      },
      take: limit,
      select: {
        order_number: true,
        created_at: true,
        status: true,
        final_amount: true,
        payment_status: true,
      },
    });

    return res.status(200).json(
      new ApiResponse("Admin recent orders retrieved successfully", {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        limit,
        total: recentOrders.length,
        orders: recentOrders.map((order) => ({
          order_number: order.order_number,
          order_date: order.created_at,
          status: order.status.toLowerCase(),
          payment_status: order.payment_status.toLowerCase(),
          final_amount: order.final_amount,
        })),
      }),
    );
  },
);

const getAdminLowStockProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const query = req.query as AdminLowStockQuery;
    const threshold = parseLimit(query.threshold, 5, 1000);
    const limit = parseLimit(query.limit, 5, 100);
    const stockType = query.stock_type ?? "all";

    if (!["all", "low_stock", "out_of_stock"].includes(stockType)) {
      throw new ApiError(
        400,
        "stock_type must be one of: all, low_stock, out_of_stock",
      );
    }

    const stockCondition =
      stockType === "out_of_stock"
        ? { equals: 0 }
        : stockType === "low_stock"
          ? { gt: 0, lte: threshold }
          : { lte: threshold };

    const variants = await prisma.productVariant.findMany({
      where: {
        is_active: true,
        stock: stockCondition,
        product: {
          is_active: true,
        },
      },
      orderBy: [
        {
          stock: "asc",
        },
        {
          updated_at: "desc",
        },
      ],
      take: limit,
      select: {
        id: true,
        stock: true,
        color: true,
        size: true,
        discounted_price: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        images: {
          where: {
            is_primary: true,
          },
          take: 1,
          select: {
            image_url: true,
          },
        },
      },
    });

    return res.status(200).json(
      new ApiResponse("Admin low stock products retrieved successfully", {
        threshold,
        limit,
        stock_type: stockType,
        total: variants.length,
        products: variants.map((variant) => ({
          product_variant_id: variant.id,
          product_id: variant.product.id,
          name: variant.product.name,
          slug: variant.product.slug,
          color: variant.color,
          size: variant.size,
          price: variant.discounted_price,
          stock: variant.stock,
          stock_status: variant.stock === 0 ? "out_of_stock" : "low_stock",
          image_url: variant.images[0]?.image_url ?? null,
        })),
      }),
    );
  },
);

export {
  getAdminHomeDashboardStats,
  getAdminRevenueTimeline,
  getAdminWeeklyVisitorsAndConversions,
  getAdminSalesByCategory,
  getAdminTopSellingProducts,
  getAdminOrderStatusSummary,
  getAdminRecentOrders,
  getAdminLowStockProducts,
};
