import { Router } from "express";
import {
  addProductUnserviceablePincodes,
  addProduct,
  getProductUnserviceablePincodes,
  checkProductAvailabilityByPincode,
  deleteProduct,
  getAllProducts,
  getProductBySlug,
  getTopRatedProducts,
  getRecentlyVisitedProducts,
  getProductWithoutVariants,
  removeProductUnserviceablePincode,
  replaceProductUnserviceablePincodes,
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
router
  .route("/:slug")
  .get(verifyOptionalToken, getProductBySlug);

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
  .patch(upload.any(), verifyAdminToken, updateProduct)
  .delete(deleteProduct);

router.use(verifyAdminToken);
router.route("/add").post(upload.any(), addProduct);
router
  .route("/:slug/pincodes")
  .get(getProductUnserviceablePincodes)
  .post(addProductUnserviceablePincodes)
  .put(replaceProductUnserviceablePincodes);
router
  .route("/:slug/pincodes/:pincode")
  .delete(removeProductUnserviceablePincode);
// router.route("/:slug").post(verifyAdminToken, updateProduct);

export default router;
