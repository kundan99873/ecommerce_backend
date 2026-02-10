import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import bcrypt from "bcryptjs";
import { prisma } from "../libs/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import crypto from "crypto";
import { encryptData } from "../utils/utils.js";
import jwt from "jsonwebtoken";
// import { uploadMediaToCloudinary } from "../helper/uploadFileToCloudinary.js";

const registerUser = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  const verifyToken = crypto.randomBytes(20).toString("hex");
  const verifyTokenExpiry = new Date(Date.now() + 10 * 60 * 1000);

  if (existingUser) {
    throw new ApiError(400, "User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      email_verification_token: verifyToken,
      email_verification_expiry: verifyTokenExpiry,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  return res
    .status(201)
    .json(new ApiResponse("User registered successfully", user));
});

const loginUser = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      password: true,
      is_email_verified: true,
      is_active: true,
      failed_login_attempts: true,
      locked_until: true,
      role_id: true,
    },
  });

  if (!user) throw new ApiError(400, "Invalid credentials");

  if (user.locked_until && user.locked_until > new Date()) {
    throw new ApiError(400, "Your account has been blocked for 24 hrs");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    if (user.failed_login_attempts >= 2) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: 0,
          locked_until: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hrs
        },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { failed_login_attempts: user.failed_login_attempts + 1 },
      });
    }
    throw new ApiError(400, "Invalid credentials");
  }

  const secretData = encryptData({ user_id: user.id, role_id: user.role_id });

  const accessToken = jwt.sign(
    { data: secretData },
    process.env.ACCESS_TOKEN_SECRET!,
    { expiresIn: "15m" },
  );
  const refreshToken = jwt.sign(
    { data: secretData },
    process.env.REFRESH_TOKEN_SECRET!,
    { expiresIn: "7d" },
  );

  await prisma.user.update({
    where: { id: user.id },
    data: {
      last_login_at: new Date(),
      failed_login_attempts: 0,
      refresh_token: refreshToken,
    },
  });

  return res
    .cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    })
    .cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .status(200)
    .json(new ApiResponse("User Login Successful"));
});

export { registerUser, loginUser };
