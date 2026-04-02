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
import { sendTemplateEmail } from "../../helper/sendMail.js";
import {
  AUTH_EMAIL_TEMPLATES,
  type AuthEmailTemplateKey,
} from "../../helper/authEmailTemplates.js";
import { mailDefaults } from "../../config/nodemailer.config.js";
// import { uploadMediaToCloudinary } from "../helper/uploadFileToCloudinary.js";

const verifyEmailPath = process.env.VERIFY_EMAIL_PATH || "/verify-email";
const resetPasswordPath = process.env.RESET_PASSWORD_PATH || "/reset-password";
const commonEmailSentence =
  "For your security, never share your password or verification codes with anyone.";

const sendAuthTemplateEmail = async (
  to: string,
  templateKey: AuthEmailTemplateKey,
  data: Record<string, unknown>,
) => {
  const templateConfig = AUTH_EMAIL_TEMPLATES[templateKey];

  const subject = templateConfig.subject.replace(
    "{{appName}}",
    mailDefaults.appName,
  );

  const result = await sendTemplateEmail({
    to,
    subject,
    template: templateConfig.template,
    data: {
      appName: mailDefaults.appName,
      supportEmail: mailDefaults.supportEmail,
      frontendUrl: mailDefaults.frontendUrl,
      commonSentence: commonEmailSentence,
      ...data,
    },
  });

  if (!result.success) {
    console.error(
      `Failed to send ${templateKey} email to ${to}:`,
      result.error,
    );
  }
};

const getActiveUserSessions = async (userId: number) => {
  const sessions = await prisma.userSession.findMany({
    where: {
      user_id: userId,
      is_revoked: false,
    },
    orderBy: {
      last_used_at: "desc",
    },
    select: {
      id: true,
      device_id: true,
      device_name: true,
      user_agent: true,
      ip_address: true,
      created_at: true,
      last_used_at: true,
    },
  });

  return sessions;
};

type ActiveUserSession = Awaited<
  ReturnType<typeof getActiveUserSessions>
>[number];

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
      const uploadResult = await uploadMediaToCloudinary(req.file, "users");
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

  await sendAuthTemplateEmail(user.email, "verifyAccount", {
    userName: user.name,
    verifyUrl: `${mailDefaults.frontendUrl}${verifyEmailPath}?token=${verifyToken}`,
    expiresInMinutes: 10,
  });

  return res
    .status(201)
    .json(new ApiResponse("User registered successfully", user));
});

const loginUser = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, force_logout_device_id } = req.body as {
    email: string;
    password: string;
    force_logout_device_id?: string;
  };

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
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
      const lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: 0,
          locked_until: lockedUntil,
        },
      });

      await sendAuthTemplateEmail(email, "accountLocked", {
        userName: user.name || "User",
        lockedUntil: lockedUntil.toISOString(),
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

    await sendAuthTemplateEmail(email, "verifyAccount", {
      userName: user.name || "User",
      verifyUrl: `${mailDefaults.frontendUrl}${verifyEmailPath}?token=${verifyToken}`,
      expiresInMinutes: 10,
    });

    throw new ApiError(400, "Please verify your email before logging in");
  }

  const activeDeviceCount = await prisma.userSession.count({
    where: {
      user_id: user.id,
      is_revoked: false,
    },
  });

  if (activeDeviceCount >= 3) {
    const forcedDeviceId = force_logout_device_id?.trim();

    if (forcedDeviceId) {
      const revokedSession = await prisma.userSession.updateMany({
        where: {
          user_id: user.id,
          device_id: forcedDeviceId,
          is_revoked: false,
        },
        data: {
          is_revoked: true,
          last_used_at: new Date(),
        },
      });

      if (revokedSession.count === 0) {
        const activeSessions = await getActiveUserSessions(user.id);

        return res
          .status(403)
          .json(
            new ApiResponse(
              "Invalid device selected. Please choose one of the active devices to sign out.",
              activeSessions,
            ),
          );
      }
    }

    const refreshedActiveDeviceCount = await prisma.userSession.count({
      where: {
        user_id: user.id,
        is_revoked: false,
      },
    });

    if (refreshedActiveDeviceCount >= 3) {
      const activeSessions = await getActiveUserSessions(user.id);

      return res
        .status(403)
        .json(
          new ApiResponse(
            "You are already logged in on 3 devices. Please log out from any one device and try again.",
            activeSessions,
          ),
        );
    }
  }

  const deviceId = crypto.randomBytes(32).toString("hex");

  const forwardedFor = req.headers["x-forwarded-for"];
  const remoteAddress = req.socket?.remoteAddress;

  const rawIp =
    (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) ??
    remoteAddress ??
    "";

  const ip_address = (String(rawIp).split(",").at(0) ?? "").trim() || "unknown";

  const user_agent = req.headers["user-agent"] ?? "unknown";

  await prisma.userSession.create({
    data: {
      device_id: deviceId,
      device_name: "",
      ip_address,
      user_id: user.id,
      last_used_at: new Date(),
      user_agent,
    },
  });

  const { refreshToken, accessToken } = generateTokens({
    user_id: user.id,
    role_id: user.role_id,
    device_id: deviceId,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      last_login_at: new Date(),
      failed_login_attempts: 0,
      locked_until: null,
    },
  });

  await sendAuthTemplateEmail(email, "newLoginAlert", {
    userName: user.name || "User",
    loginTime: new Date().toISOString(),
    deviceName: String(user_agent),
    ipAddress: ip_address,
    location: "Unknown",
  });

  return res
    .cookie("accessToken", accessToken, accessTokenCookieOptions)
    .cookie("refreshToken", refreshToken, refreshTokenCookieOptions)
    .status(200)
    .json(new ApiResponse("User Login Successful"));
});

const googleLogin = asyncHandler(async (req: Request, res: Response) => {
  const { token, force_logout_device_id } = req.body as {
    token: string;
    force_logout_device_id?: string;
  };

  if (!token) throw new ApiError(400, "Google token is required");

  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID!,
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.email)
    throw new ApiError(400, "Invalid Google token");

  let isNewGoogleUser = false;

  let user = await prisma.user.findUnique({
    where: { email: payload.email },
    select: {
      id: true,
      role_id: true,
      name: true,
      email: true,
    },
  });

  if (!user) {
    isNewGoogleUser = true;

    user = await prisma.user.create({
      data: {
        name: payload.name || "Google User",
        email: payload.email,
        is_email_verified: true,
        provider: "google",
        provider_id: payload.sub,
        avatar_url: payload.picture || null,
      },
      select: {
        id: true,
        role_id: true,
        name: true,
        email: true,
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

  const activeDeviceCount = await prisma.userSession.count({
    where: {
      user_id: user.id,
      is_revoked: false,
    },
  });

  if (activeDeviceCount >= 3) {
    const forcedDeviceId = force_logout_device_id?.trim();

    if (forcedDeviceId) {
      const revokedSession = await prisma.userSession.updateMany({
        where: {
          user_id: user.id,
          device_id: forcedDeviceId,
          is_revoked: false,
        },
        data: {
          is_revoked: true,
          last_used_at: new Date(),
        },
      });

      if (revokedSession.count === 0) {
        const activeSessions = await getActiveUserSessions(user.id);

        return res
          .status(403)
          .json(
            new ApiResponse(
              "Invalid device selected. Please choose one of the active devices to sign out.",
              activeSessions,
            ),
          );
      }
    }

    const refreshedActiveDeviceCount = await prisma.userSession.count({
      where: {
        user_id: user.id,
        is_revoked: false,
      },
    });

    if (refreshedActiveDeviceCount >= 3) {
      const activeSessions = await getActiveUserSessions(user.id);

      return res
        .status(403)
        .json(
          new ApiResponse(
            "You are already logged in on 3 devices. Please log out from any one device and try again.",
            activeSessions,
          ),
        );
    }
  }

  const deviceId = crypto.randomBytes(32).toString("hex");

  const forwardedFor = req.headers["x-forwarded-for"];
  const remoteAddress = req.socket?.remoteAddress;

  const rawIp =
    (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) ??
    remoteAddress ??
    "";

  const ip_address = (String(rawIp).split(",").at(0) ?? "").trim() || "unknown";
  const user_agent = req.headers["user-agent"] ?? "unknown";

  await prisma.userSession.create({
    data: {
      device_id: deviceId,
      device_name: "",
      ip_address,
      user_id: user.id,
      last_used_at: new Date(),
      user_agent,
    },
  });

  const { accessToken, refreshToken } = generateTokens({
    user_id: user.id,
    role_id: user.role_id,
    device_id: deviceId,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      last_login_at: new Date(),
      failed_login_attempts: 0,
      locked_until: null,
    },
  });

  if (isNewGoogleUser) {
    await sendAuthTemplateEmail(user.email, "registrationSuccess", {
      userName: user.name || "User",
    });
  }

  await sendAuthTemplateEmail(user.email, "newLoginAlert", {
    userName: user.name || "User",
    loginTime: new Date().toISOString(),
    deviceName: String(user_agent),
    ipAddress: ip_address,
    location: "Unknown",
  });

  return res
    .cookie("accessToken", accessToken, accessTokenCookieOptions)
    .cookie("refreshToken", refreshToken, refreshTokenCookieOptions)
    .status(200)
    .json(new ApiResponse("Google login successful"));
});

const logoutUser = asyncHandler(async (req: Request, res: Response) => {
  const { user_id, device_id } = req.user as TokenPayload;

  await prisma.userSession.updateMany({
    where: {
      user_id,
      device_id,
      is_revoked: false,
    },
    data: {
      is_revoked: true,
      last_used_at: new Date(),
    },
  });

  return res
    .clearCookie("accessToken", clearCookieOptions)
    .clearCookie("refreshToken", clearCookieOptions)
    .status(200)
    .json(new ApiResponse("User logged out successfully"));
});

const getActiveSessions = asyncHandler(async (req: Request, res: Response) => {
  const { user_id, device_id } = req.user as TokenPayload;

  const sessions = await getActiveUserSessions(user_id);

  return res.status(200).json(
    new ApiResponse(
      "Active sessions fetched successfully",
      sessions.map((session: ActiveUserSession) => ({
        ...session,
        is_current: session.device_id === device_id,
      })),
    ),
  );
});

const revokeSession = asyncHandler(async (req: Request, res: Response) => {
  const { user_id, device_id } = req.user as TokenPayload;
  const rawSessionId = req.params.sessionId;
  const sessionId = Array.isArray(rawSessionId)
    ? rawSessionId[0]
    : rawSessionId;

  if (!sessionId) {
    throw new ApiError(400, "Session id is required");
  }

  const session = await prisma.userSession.findFirst({
    where: {
      id: sessionId,
      user_id,
      is_revoked: false,
    },
    select: {
      id: true,
      device_id: true,
    },
  });

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  await prisma.userSession.update({
    where: {
      id: session.id,
    },
    data: {
      is_revoked: true,
      last_used_at: new Date(),
    },
  });

  const isCurrentSession = session.device_id === device_id;

  if (isCurrentSession) {
    res
      .clearCookie("accessToken", clearCookieOptions)
      .clearCookie("refreshToken", clearCookieOptions);
  }

  return res.status(200).json(
    new ApiResponse("Session logged out successfully", {
      is_current: isCurrentSession,
    }),
  );
});

const logoutOtherSessions = asyncHandler(
  async (req: Request, res: Response) => {
    const { user_id, device_id } = req.user as TokenPayload;

    const result = await prisma.userSession.updateMany({
      where: {
        user_id,
        is_revoked: false,
        device_id: {
          not: device_id,
        },
      },
      data: {
        is_revoked: true,
        last_used_at: new Date(),
      },
    });

    return res.status(200).json(
      new ApiResponse("Logged out from other devices successfully", {
        logged_out_count: result.count,
      }),
    );
  },
);

const logoutByDeviceId = asyncHandler(async (req: Request, res: Response) => {
  const { user_id, device_id: currentDeviceId } = req.user as TokenPayload;
  const rawDeviceId = req.params.device_id;
  const targetDeviceId = Array.isArray(rawDeviceId)
    ? rawDeviceId[0]?.trim()
    : rawDeviceId?.trim();

  if (!targetDeviceId) {
    throw new ApiError(400, "device_id is required");
  }

  const targetSession = await prisma.userSession.findFirst({
    where: {
      user_id,
      device_id: targetDeviceId,
      is_revoked: false,
    },
    select: {
      id: true,
      device_id: true,
    },
  });

  if (!targetSession) {
    throw new ApiError(404, "Active session not found for this device_id");
  }

  const result = await prisma.userSession.updateMany({
    where: {
      user_id,
      device_id: targetDeviceId,
      is_revoked: false,
    },
    data: {
      is_revoked: true,
      last_used_at: new Date(),
    },
  });

  const isCurrentSession = targetDeviceId === currentDeviceId;

  if (isCurrentSession) {
    res
      .clearCookie("accessToken", clearCookieOptions)
      .clearCookie("refreshToken", clearCookieOptions);
  }

  return res.status(200).json(
    new ApiResponse("Device session logged out successfully", {
      device_id: targetDeviceId,
      is_current: isCurrentSession,
      logged_out_count: result.count,
    }),
  );
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
    where: { id: decoded?.user_id as number },
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
      device_id: decoded?.device_id || "",
    });
  // await prisma.user.update({
  //   where: { id: user.id },
  //   data: { refresh_token: newRefreshToken },
  // });

  return res
    .cookie("accessToken", newAccessToken, accessTokenCookieOptions)
    .cookie("refreshToken", newRefreshToken, refreshTokenCookieOptions)
    .status(200)
    .json(new ApiResponse("Access token refreshed"));
});

const isLogedInUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.user_id) {
    throw new ApiError(404, "User is not logged in");
  }

  const userId = req.user.user_id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      avatar_url: true,
      created_at: true,
      role: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(404, "User is not logged in");
  }

  return res.status(200).json(
    new ApiResponse("User is logged in", {
      isLoggedIn: true,
      ...user,
      role: user.role?.name,
    }),
  );
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

  await sendAuthTemplateEmail(user.email, "registrationSuccess", {
    userName: user.name || "User",
  });

  return res.status(200).json(new ApiResponse("Email verified successfully"));
});

const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.user_id;
  const { current_password: currentPassword, new_password: newPassword } =
    req.body;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      password: true,
      email: true,
      name: true,
    },
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

  await sendAuthTemplateEmail(user.email, "passwordResetSuccess", {
    userName: user.name || "User",
  });

  return res.status(200).json(new ApiResponse("Password changed successfully"));
});

const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
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

  await sendAuthTemplateEmail(user.email, "forgotPassword", {
    userName: user.name || "User",
    resetUrl: `${mailDefaults.frontendUrl}${resetPasswordPath}?token=${resetToken}`,
    expiresInMinutes: 10,
  });

  return res.status(200).json(
    new ApiResponse("Password reset token generated", {
      resetToken,
    }),
  );
});

const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, new_password: newPassword } = req.body;

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

  await sendAuthTemplateEmail(user.email, "passwordResetSuccess", {
    userName: user.name || "User",
  });

  return res.status(200).json(new ApiResponse("Password reset successfully"));
});

const verifyResetToken = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;

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

  return res.status(200).json(new ApiResponse("Token is valid"));
});

export {
  registerUser,
  loginUser,
  googleLogin,
  logoutUser,
  getActiveSessions,
  revokeSession,
  logoutByDeviceId,
  logoutOtherSessions,
  isLogedInUser,
  refreshToken,
  verifyEmail,
  changePassword,
  resetPassword,
  forgotPassword,
  verifyResetToken,
};
