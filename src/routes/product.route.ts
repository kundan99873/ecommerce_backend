import { Router } from "express";
import {
  addProduct,
  deleteProduct,
  getAllProducts,
  getProductBySlug,
  getProductWithoutVariants,
  updateProduct,
} from "../controller/products/product.controller.js";
import {
  verifyAdminToken,
  verifyOptionalToken,
  verifyUserToken,
} from "../middleware/auth.middleware.js";
import upload from "../middleware/image.middleware.js";
import { addRatingToProduct } from "../controller/products/productRating.controller.js";

const router = Router();

router.route("/").get(verifyOptionalToken, getAllProducts);
router
  .route("/without-variants")
  .get(verifyOptionalToken, getProductWithoutVariants);
router
  .route("/:slug")
  .get(getProductBySlug)
  .patch(upload.any(), verifyAdminToken, updateProduct)
  .delete(deleteProduct);

router.use(verifyUserToken);
router.route("/rating/:slug").post(addRatingToProduct);

router.use(verifyAdminToken);
router.route("/add").post(upload.any(), addProduct);
// router.route("/:slug").post(verifyAdminToken, updateProduct);

export default router;
