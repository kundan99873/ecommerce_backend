import { Router } from "express";
import upload from "../middleware/image.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { loginUserSchema, registerUserSchema } from "../validations/auth.validation.js";
import { loginUser, registerUser } from "../controller/auth.controller.js";

const router = Router();

router.route("/register").post(upload.single("avatar"), validate(registerUserSchema), registerUser)
router.route("/login").post(validate(loginUserSchema), loginUser)
export default router;