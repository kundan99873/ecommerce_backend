import express from "express";
import {
  addCoupon,
  deleteCoupon,
  getCoupons,
  updateCoupon,
} from "../controller/coupon/coupon.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { addCouponSchema } from "../validations/coupon.validation.js";

const router = express.Router();

router.route("/").get(getCoupons).post(validate(addCouponSchema), addCoupon);
router.route("/:id").patch(updateCoupon).delete(deleteCoupon);

export default router;
