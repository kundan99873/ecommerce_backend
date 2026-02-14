import { Router } from "express";
import {
  addProductToCart,
  deleteProductFromCart,
  getCartProducts,
  updateCartItem,
} from "../controller/carts/cart.controller.js";
import { verifyUserToken } from "../middleware/auth.middleware.js";
import {
  addProductToWishlist,
  removeProductToWishlist,
} from "../controller/carts/wishlist.controller.js";

const router = Router();

router.use(verifyUserToken);
router
  .route("/cart")
  .post(addProductToCart)
  .get(getCartProducts)
  .patch(updateCartItem);
router.route("/cart/:slug").delete(deleteProductFromCart);

router
  .route("/wishlist")
  .post(addProductToWishlist)
  .delete(removeProductToWishlist);

export default router;
