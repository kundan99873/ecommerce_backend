import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import bcrypt from "bcryptjs";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { TokenPayload } from "./types.js";
import googleClient from "../../libs/googleClient.js";
import {
  accessTokenCookieOptions,
  clearCookieOptions,
  refreshTokenCookieOptions,
} from "../../config/cookie.config.js";
import generateTokens from "./generateTokens.js";
import { uploadMediaToCloudinary } from "../../helper/uploadFileToCloudinary.js";
import type { UploadApiResponse } from "cloudinary";
// import { uploadMediaToCloudinary } from "../helper/uploadFileToCloudinary.js";

const registerUser = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  const verifyToken: string = crypto.randomBytes(20).toString("hex");
  const verifyTokenExpiry: Date = new Date(Date.now() + 10 * 60 * 1000);

  if (existingUser) {
    throw new ApiError(400, "User already exists");
  }

  let imageData: UploadApiResponse | undefined = undefined;

  if (req.file) {
    try {
      const uploadResult = await uploadMediaToCloudinary(req.file);
      imageData = uploadResult[0];
    } catch (error) {
      console.error("Error uploading avatar to Cloudinary:", error);
      throw new ApiError(500, "Failed to upload avatar");
    }
  }

  const hashedPassword: string = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      email_verification_token: verifyToken,
      email_verification_expiry: verifyTokenExpiry,
      avatar_url: imageData?.secure_url ?? null,
      avatar_public_id: imageData?.public_id ?? null,
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
      provider: true,
      provider_id: true,
    },
  });

  if (!user) throw new ApiError(400, "Invalid credentials");

  if (user.locked_until && user.locked_until > new Date()) {
    throw new ApiError(400, "Your account has been blocked for 24 hrs");
  }

  if (!user.password) {
    return res
      .status(400)
      .json(
        new ApiResponse("Please login with Google or reset your password."),
      );
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    if (user.failed_login_attempts >= 2) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: 0,
          locked_until: new Date(Date.now() + 24 * 60 * 60 * 1000),
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

  if (!user.is_email_verified) {
    const verifyToken = crypto.randomBytes(20).toString("hex");
    const verifyTokenExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email_verification_token: verifyToken,
        email_verification_expiry: verifyTokenExpiry,
      },
    });

    throw new ApiError(400, "Please verify your email before logging in");
  }

  const { refreshToken, accessToken } = generateTokens({
    user_id: user.id,
    role_id: user.role_id,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      last_login_at: new Date(),
      failed_login_attempts: 0,
      refresh_token: refreshToken,
    },
  });

  return res
    .cookie("accessToken", accessToken, accessTokenCookieOptions)
    .cookie("refreshToken", refreshToken, refreshTokenCookieOptions)
    .status(200)
    .json(new ApiResponse("User Login Successful"));
});

const googleLogin = asyncHandler(async (req: Request, res: Response) => {
  const { tokenId } = req.body;

  if (!tokenId) {
    throw new ApiError(400, "Google token is required");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: tokenId,
    audience: process.env.GOOGLE_CLIENT_ID!,
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.email) {
    throw new ApiError(400, "Invalid Google token");
  }

  let user = await prisma.user.findUnique({
    where: { email: payload.email },
    select: {
      id: true,
      role_id: true,
    },
  });

  console.log({ payload });

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: payload.name || "Google User",
        email: payload.email,
        is_email_verified: true,
        provider: "google",
        provider_id: payload.sub,
      },
      select: {
        id: true,
        role_id: true,
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        provider: "google",
        provider_id: payload.sub,
      },
    });
  }

  const { accessToken, refreshToken } = generateTokens({
    user_id: user.id,
    role_id: user.role_id,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { refresh_token: refreshToken },
  });

  return res
    .cookie("accessToken", accessToken, accessTokenCookieOptions)
    .cookie("refreshToken", refreshToken, refreshTokenCookieOptions)
    .status(200)
    .json(new ApiResponse("Google login successful"));
});

const logoutUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.user_id;
  await prisma.user.update({
    where: { id: userId },
    data: { refresh_token: null },
  });

  return res
    .clearCookie("accessToken", clearCookieOptions)
    .clearCookie("refreshToken", clearCookieOptions)
    .status(200)
    .json(new ApiResponse("User logged out successfully"));
});

const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    throw new ApiError(401, "No refresh token provided");
  }

  let decoded: TokenPayload | null;

  try {
    let jwtDecoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET!,
    ) as any;
    decoded = jwtDecoded?.data;
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await prisma.user.findFirst({
    where: { id: decoded?.user_id as number, refresh_token: refreshToken },
    select: {
      id: true,
      role_id: true,
    },
  });

  if (!user) {
    throw new ApiError(401, "Invalid refresh token");
  }

  const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
    generateTokens({
      user_id: user.id,
      role_id: user.role_id,
    });
  await prisma.user.update({
    where: { id: user.id },
    data: { refresh_token: newRefreshToken },
  });

  return res
    .cookie("accessToken", newAccessToken, accessTokenCookieOptions)
    .cookie("refreshToken", newRefreshToken, refreshTokenCookieOptions)
    .status(200)
    .json(new ApiResponse("Access token refreshed"));
});

const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token || typeof token !== "string") {
    throw new ApiError(400, "Invalid or missing token");
  }

  const user = await prisma.user.findFirst({
    where: {
      email_verification_token: token,
      email_verification_expiry: { gt: new Date() },
    },
  });

  if (!user) {
    throw new ApiError(400, "Invalid or expired token");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      is_email_verified: true,
      email_verification_token: null,
      email_verification_expiry: null,
    },
  });

  return res.status(200).json(new ApiResponse("Email verified successfully"));
});

const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.user_id;
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.password) {
    throw new ApiError(400, "This account does not have a password set");
  }

  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    user.password,
  );

  if (!isCurrentPasswordValid) {
    throw new ApiError(400, "Current password is incorrect");
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedNewPassword },
  });

  return res.status(200).json(new ApiResponse("Password changed successfully"));
});

const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(400, "User not found");
  }

  const resetToken = crypto.randomBytes(20).toString("hex");
  const resetTokenExpiry = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      forgot_password_token: resetToken,
      forgot_password_expires: resetTokenExpiry,
    },
  });

  return res.status(200).json(
    new ApiResponse("Password reset token generated", {
      resetToken,
    }),
  );
});

const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  if (!token || typeof token !== "string") {
    throw new ApiError(400, "Invalid or missing token");
  }

  const user = await prisma.user.findFirst({
    where: {
      forgot_password_token: token,
      forgot_password_expires: { gt: new Date() },
    },
  });

  if (!user) {
    throw new ApiError(400, "Invalid or expired token");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      forgot_password_token: null,
      forgot_password_expires: null,
    },
  });

  return res.status(200).json(new ApiResponse("Password reset successfully"));
});

export {
  registerUser,
  loginUser,
  googleLogin,
  logoutUser,
  refreshToken,
  verifyEmail,
  changePassword,
  resetPassword,
  forgotPassword,
};
