import { Router } from "express";
import {
  addProduct,
  getAllProducts,
  getProductBySlug,
  updateProduct,
} from "../controller/products/product.controller.js";
import { verifyAdminToken, verifyOptionalToken } from "../middleware/auth.middleware.js";

const router = Router();

router.route("/").get(verifyOptionalToken, getAllProducts);
router
  .route("/:slug")
  .get(getProductBySlug)
  .patch(verifyAdminToken, updateProduct);

router.use(verifyAdminToken);
router.route("/add").post(addProduct);

export default router;
