import { Router } from "express";
import { verifyAdminToken } from "../middleware/auth.middleware.js";
import {
  changeUserRole,
  changeUserStatus,
  getAllUsers,
  getUserFullDetailsById,
} from "../controller/users/adminUser.controller.js";

const router = Router();

router.use(verifyAdminToken);

router.route("/users").get(getAllUsers);
router.route("/users/:id").get(getUserFullDetailsById);
router.route("/users/:id/role").patch(changeUserRole);
router.route("/users/:id/status").patch(changeUserStatus);

export default router;
