import { Router } from "express";
import {
  addProductAvailablePincodes,
  addProduct,
  getProductAvailablePincodes,
  checkProductAvailabilityByPincode,
  deleteProduct,
  getAllProducts,
  getProductBySlug,
  getTopRatedProducts,
  getRecentlyVisitedProducts,
  getProductWithoutVariants,
  removeProductAvailablePincode,
  replaceProductAvailablePincodes,
  trackRecentlyVisitedProduct,
  updateProduct,
} from "../controller/products/product.controller.js";
import {
  verifyAdminToken,
  verifyOptionalToken,
  verifyUserToken,
} from "../middleware/auth.middleware.js";
import upload from "../middleware/image.middleware.js";
import {
  addRatingToProduct,
  deleteProductReview,
  getProductReviews,
} from "../controller/products/productRating.controller.js";
import { getRecentSearches } from "../controller/products/search.controller.js";

const router = Router();

router.route("/").get(verifyOptionalToken, getAllProducts);
router
  .route("/without-variants")
  .get(verifyOptionalToken, getProductWithoutVariants);
router.route("/top-rated").get(verifyOptionalToken, getTopRatedProducts);
router.route("/:slug/availability").get(checkProductAvailabilityByPincode);
router.route("/:slug/reviews").get(verifyOptionalToken, getProductReviews);

router.use(verifyUserToken);
router.route("/search/recent").get(getRecentSearches);
router
  .route("/review/:slug")
  .post(addRatingToProduct)
  .patch(addRatingToProduct)
  .delete(deleteProductReview);
router.route("/recently-visited/:slug").post(trackRecentlyVisitedProduct);
router.route("/recently-visited").get(getRecentlyVisitedProducts);

router
  .route("/:slug")
  .get(getProductBySlug)
  .patch(upload.any(), verifyAdminToken, updateProduct)
  .delete(deleteProduct);

router.use(verifyAdminToken);
router.route("/add").post(upload.any(), addProduct);
router
  .route("/:slug/pincodes")
  .get(getProductAvailablePincodes)
  .post(addProductAvailablePincodes)
  .put(replaceProductAvailablePincodes);
router.route("/:slug/pincodes/:pincode").delete(removeProductAvailablePincode);
// router.route("/:slug").post(verifyAdminToken, updateProduct);

export default router;
