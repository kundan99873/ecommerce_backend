import { Router } from "express";
import cartWishlistRoutes from "./cartWishlist.route.js";
import { addAddressSchema, updateProfileSchema } from "../validations/user.validation.js";
import {
  addAddress,
  deleteAddress,
  getUserAddresses,
  updateAddress,
} from "../controller/users/userInfo.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { getLoggedInUser, updateUserProfile } from "../controller/users/user.controller.js";
import { getUserFullDetailsById } from "../controller/users/adminUser.controller.js";
import upload from "../middleware/image.middleware.js";

const router = Router();

router.use("", cartWishlistRoutes);


router.route("/get-details").get(getLoggedInUser);
router
  .route("/profile")
  .get(getUserFullDetailsById)
  .patch(
    upload.single("avatar"),
    validate(updateProfileSchema),
    updateUserProfile,
  );

router
  .route("/address")
  .post(validate(addAddressSchema), addAddress)
  .get(getUserAddresses);
router
  .route("/address/:id")
  .delete(deleteAddress)
  .patch(validate(addAddressSchema), updateAddress);

export default router;
