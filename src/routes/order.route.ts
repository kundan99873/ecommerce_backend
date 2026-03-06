import { Router } from "express";
import { verifyUserToken } from "../middleware/auth.middleware.js";
import {
  addOrder,
  getOrderDetails,
  getUserOrders,
} from "../controller/orders/order.controller.js";

const router = Router();

router.use(verifyUserToken);
router.route("/").post(addOrder).get(getUserOrders);
router.route("/:order_number").get(getOrderDetails);

export default router;
