import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../libs/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { decryptData } from "../utils/utils.js";
import generateTokens from "../controller/users/generateTokens.js";
import { accessTokenCookieOptions } from "../config/cookie.config.js";
import type { TokenPayload } from "../controller/users/types.js";

const verifyAccessToken = (token: string): TokenPayload => {
  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as any;

  return decryptData(decoded.data);
};

const verifyRefreshToken = (token: string): TokenPayload => {
  const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET!) as any;

  return decryptData(decoded.data);
};

const assertActiveSession = async (userId: number, deviceId: string) => {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, "Invalid session user");
  }

  const normalizedDeviceId = deviceId?.trim();

  if (!normalizedDeviceId) {
    throw new ApiError(401, "Invalid session device");
  }

  const session = await prisma.userSession.findFirst({
    where: {
      user_id: userId,
      device_id: normalizedDeviceId,
      is_revoked: false,
    },
    select: {
      id: true,
    },
  });

  if (!session) {
    throw new ApiError(401, "Session expired");
  }

  await prisma.userSession.update({
    where: {
      id: session.id,
    },
    data: {
      last_used_at: new Date(),
    },
  });
};

const handleRefreshToken = async (
  refreshToken: string,
  res: Response,
): Promise<TokenPayload> => {
  const payload = verifyRefreshToken(refreshToken);

  const user = await prisma.user.findUnique({
    where: { id: payload.user_id },
    select: {
      id: true,
      role_id: true,
    },
  });

  if (!user) {
    throw new ApiError(401, "Invalid refresh token");
  }

  await assertActiveSession(payload.user_id, payload.device_id);

  // 🔥 Generate new access token
  const { accessToken: newAccessToken } = generateTokens({
    user_id: user.id,
    role_id: user.role_id,
    device_id: payload.device_id,
  });

  res.cookie("accessToken", newAccessToken, accessTokenCookieOptions);

  return {
    user_id: user.id,
    role_id: user.role_id,
    device_id: payload.device_id,
  };
};

const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const accessToken =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  const refreshToken = req.cookies?.refreshToken;

  try {
    if (!accessToken) {
      if (!refreshToken) {
        return next(new ApiError(401, "Authentication required"));
      }

      const refreshedUser = await handleRefreshToken(refreshToken, res);

      req.user = refreshedUser;
      return next();
    }

    const payload = verifyAccessToken(accessToken);
    await assertActiveSession(payload.user_id, payload.device_id);
    req.user = payload;
    return next();
  } catch (error: any) {
    // 🔥 If access token expired → try refresh
    if (error?.name === "TokenExpiredError" && refreshToken) {
      try {
        const refreshedUser = await handleRefreshToken(refreshToken, res);
        req.user = refreshedUser;
        return next();
      } catch {
        return next(new ApiError(401, "Session expired"));
      }
    }

    return next(new ApiError(401, "Invalid or expired token"));
  }
};

const authorize =
  (requiredRole?: number) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required"));
    }

    if (requiredRole && req.user.role_id !== requiredRole) {
      return next(new ApiError(403, "Access denied"));
    }

    next();
  };

const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const accessToken =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");
  const refreshToken = req.cookies?.refreshToken;

  if (!accessToken && !refreshToken) return next();

  try {
    if (accessToken) {
      const payload = verifyAccessToken(accessToken);
      await assertActiveSession(payload.user_id, payload.device_id);
      req.user = payload;
      return next();
    }

    if (refreshToken) {
      req.user = await handleRefreshToken(refreshToken, res);
    }
  } catch {
    // ignore errors in optional auth
  }

  next();
};

export const verifyUserToken = [authenticate, authorize()];
export const verifyAdminToken = [authenticate, authorize(1)];
export const verifyOptionalToken = optionalAuth;
