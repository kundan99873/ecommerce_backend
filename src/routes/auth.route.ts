import { Router } from "express";
import upload from "../middleware/image.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  changePasswordSchema,
  loginUserSchema,
  registerUserSchema,
} from "../validations/auth.validation.js";
import {
  changePassword,
  forgotPassword,
  googleLogin,
  isLogedInUser,
  loginUser,
  logoutUser,
  refreshToken,
  registerUser,
  resetPassword,
  verifyEmail,
} from "../controller/users/auth.controller.js";
import {
  verifyAdminToken,
  verifyUserToken,
} from "../middleware/auth.middleware.js";
import { getLoggedInUser } from "../controller/users/user.controller.js";
import { addRole } from "../controller/users/role.controller.js";

const router = Router();

router
  .route("/register")
  .post(upload.single("avatar"), validate(registerUserSchema), registerUser);
router.route("/login").post(validate(loginUserSchema), loginUser);
router.route("/google-login").post(googleLogin);
router.route("/verify-email").post(verifyEmail);
router.route("/forgot-password").post(resetPassword).patch(forgotPassword);
router.route("/me").post(verifyAdminToken, isLogedInUser);
router.route("/add-role").post(addRole);

router.use(verifyUserToken);
router.route("/refresh").post(refreshToken);
router
  .route("/change-password")
  .post(validate(changePasswordSchema), changePassword);
router.route("/get-details").get(getLoggedInUser);
router.post("/logout", logoutUser);

export default router;
