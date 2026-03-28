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
  getActiveSessions,
  googleLogin,
  isLogedInUser,
  loginUser,
  logoutOtherSessions,
  logoutUser,
  refreshToken,
  registerUser,
  revokeSession,
  resetPassword,
  verifyEmail,
  verifyResetToken,
} from "../controller/users/auth.controller.js";
import {
  verifyOptionalToken,
  verifyUserToken,
} from "../middleware/auth.middleware.js";
import { addRole } from "../controller/users/role.controller.js";

const router = Router();

router
  .route("/register")
  .post(upload.single("avatar"), validate(registerUserSchema), registerUser);
router.route("/login").post(validate(loginUserSchema), loginUser);
router.route("/google-login").post(googleLogin);
router.route("/verify-email").post(verifyEmail);
router.route("/forgot-password").post(forgotPassword);
router.route("/reset-password").post(verifyResetToken).patch(resetPassword);
router
  .route("/me")
  .get(verifyOptionalToken, isLogedInUser)
  .post(verifyOptionalToken, isLogedInUser);
router.route("/add-role").post(addRole);

router.use(verifyUserToken);
router.route("/refresh").post(refreshToken);
router
  .route("/change-password")
  .post(validate(changePasswordSchema), changePassword);

router.post("/logout", logoutUser);
router.route("/sessions").get(getActiveSessions);
router.route("/sessions/logout-others").post(logoutOtherSessions);
router.route("/sessions/:sessionId").delete(revokeSession);

export default router;
