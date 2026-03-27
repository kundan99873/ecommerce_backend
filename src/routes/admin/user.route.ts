import { Router } from "express";
import { verifyAdminToken } from "../../middleware/auth.middleware.js";
import {
  changeUserRole,
  changeUserStatus,
  getAllUsers,
  getUserFullDetailsById,
} from "../../controller/users/adminUser.controller.js";

const router = Router();

router.use(verifyAdminToken);


router.route("/all").get(getAllUsers);
router.route("/:id").get(getUserFullDetailsById);
router.route("/:id/role").patch(changeUserRole);
router.route("/:id/status").patch(changeUserStatus);

export default router;
