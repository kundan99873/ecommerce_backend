import { Router } from "express";
import {
  addProduct,
  checkProductAvailabilityByPincode,
  deleteProduct,
  getAllProducts,
  getProductBySlug,
  getTopRatedProducts,
  getRecentlyVisitedProducts,
  getProductWithoutVariants,
  trackRecentlyVisitedProduct,
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
router.route("/top-rated").get(verifyOptionalToken, getTopRatedProducts);
router.route("/:slug/availability").get(checkProductAvailabilityByPincode);
router
  .route("/:slug")
  .get(getProductBySlug)
  .patch(upload.any(), verifyAdminToken, updateProduct)
  .delete(deleteProduct);

router.use(verifyUserToken);
router.route("/review/:slug").post(addRatingToProduct);
router.route("/recently-visited/:slug").post(trackRecentlyVisitedProduct);
router.route("/recently-visited").get(getRecentlyVisitedProducts);

router.use(verifyAdminToken);
router.route("/add").post(upload.any(), addProduct);
// router.route("/:slug").post(verifyAdminToken, updateProduct);

export default router;
