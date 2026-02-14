import { Router } from "express";
import { verifyAdminToken } from "../middleware/auth.middleware.js";
import {
  addCategory,
  deleteCategory,
  getCategories,
  getCategoryById,
  updateCategory,
} from "../controller/categories/category.controller.js";

const router = Router();

router.use(verifyAdminToken);
router.route("/").get(getCategories).post(addCategory);
router
  .route("/:id")
  .get(getCategoryById)
  .patch(updateCategory)
  .delete(deleteCategory);

export default router;
