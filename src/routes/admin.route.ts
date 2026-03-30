import { Router } from "express";
import { verifyAdminToken } from "../middleware/auth.middleware.js";
import {
  getAdminHomeDashboardStats,
  getAdminLowStockProducts,
  getAdminOrderStatusSummary,
  getAdminRecentOrders,
  getAdminRevenueTimeline,
  getAdminSalesByCategory,
  getAdminTopSellingProducts,
  getAdminWeeklyVisitorsAndConversions,
} from "../controller/admin/home.controller.js";
import adminUserRoutes from "./admin/user.route.js";

const router = Router();

router.use(verifyAdminToken);

router.use("/user", adminUserRoutes);
router.route("/dashboard/home").get(getAdminHomeDashboardStats);
router.route("/home/dashboard").get(getAdminHomeDashboardStats);
router.route("/dashboard/revenue").get(getAdminRevenueTimeline);
router
  .route("/dashboard/weekly-visitors-conversions")
  .get(getAdminWeeklyVisitorsAndConversions);
router.route("/dashboard/sales-by-category").get(getAdminSalesByCategory);
router.route("/dashboard/top-products").get(getAdminTopSellingProducts);
router.route("/dashboard/order-status").get(getAdminOrderStatusSummary);
router.route("/dashboard/recent-orders").get(getAdminRecentOrders);
router.route("/dashboard/low-stock").get(getAdminLowStockProducts);

export default router;
