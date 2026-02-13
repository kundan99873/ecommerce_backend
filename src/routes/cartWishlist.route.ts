import { Router } from "express";
import { addProductToCart, getCartProducts } from "../controller/carts/cartController.js";

const router = Router();

router.route("/cart").post(addProductToCart).get(getCartProducts).

export default router;