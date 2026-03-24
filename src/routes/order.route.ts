import { Router } from "express";
import {
  verifyAdminToken,
  verifyUserToken,
} from "../middleware/auth.middleware.js";
import {
  addOrder,
  getAllOrders,
  getOrderDetails,
  getUserOrders,
  updateOrderStatus,
} from "../controller/orders/order.controller.js";

const router = Router();

router.use(verifyUserToken);
router.route("/all").get(verifyAdminToken, getAllOrders);
router.route("/").post(addOrder).get(getUserOrders);
router.route("/:order_number/status").patch(updateOrderStatus);
router.route("/:order_number").get(getOrderDetails);

export default router;
