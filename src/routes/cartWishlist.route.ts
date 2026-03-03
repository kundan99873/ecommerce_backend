import { Router } from "express";
import {
  addProductToCart,
  clearCart,
  deleteProductFromCart,
  getCartProducts,
  updateCartItem,
} from "../controller/carts/cart.controller.js";
import { verifyUserToken } from "../middleware/auth.middleware.js";
import {
  addProductToWishlist,
  getWishlistProducts,
  removeProductToWishlist,
} from "../controller/carts/wishlist.controller.js";

const router = Router();

router.use(verifyUserToken);
router
  .route("/cart")
  .post(addProductToCart)
  .get(getCartProducts)
  .patch(updateCartItem);

router.route("/cart/clear").post(clearCart);
router.route("/cart/remove/:slug").post(deleteProductFromCart);

router
  .route("/wishlist/:slug")
  .post(addProductToWishlist)
  .delete(removeProductToWishlist);

router.route("/wishlist").get(getWishlistProducts);

export default router;
