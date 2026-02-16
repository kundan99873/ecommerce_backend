import { Router } from "express";
import { verifyAdminToken } from "../middleware/auth.middleware.js";
import {
  addCategory,
  deleteCategory,
  getCategories,
  getCategoryBySlug,
  updateCategory,
} from "../controller/categories/category.controller.js";
import upload from "../middleware/image.middleware.js";

const router = Router();

router.route("/").get(getCategories);
router.use(verifyAdminToken);
router.route("/").post(upload.single("image"), addCategory);
router
  .route("slug")
  .get(getCategoryBySlug)
  .patch(upload.single("image"), updateCategory)
  .delete(deleteCategory);

export default router;
