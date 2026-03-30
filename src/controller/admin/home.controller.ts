import type { Request, Response } from "express";
import { OrderStatus, PaymentStatus } from "../../../generated/prisma/enums.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

type AdminDashboardQuery = {
  from?: string;
  to?: string;
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

export { getAdminHomeDashboardStats };
