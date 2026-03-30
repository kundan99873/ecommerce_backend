import { Router } from "express";
import { verifyAdminToken } from "../middleware/auth.middleware.js";
import { getAdminHomeDashboardStats } from "../controller/admin/home.controller.js";
import adminUserRoutes from "./admin/user.route.js";

const router = Router();

router.use(verifyAdminToken);

router.use("/user", adminUserRoutes);
router.route("/dashboard/home").get(getAdminHomeDashboardStats);
router.route("/home/dashboard").get(getAdminHomeDashboardStats);

export default router;
