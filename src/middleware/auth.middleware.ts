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

  // 🔥 Generate new access token
  const { accessToken: newAccessToken } = generateTokens({
    user_id: user.id,
    role_id: user.role_id,
    device_id: payload.device_id
  });
  
  res.cookie("accessToken", newAccessToken, accessTokenCookieOptions);
  
  return {
    user_id: user.id,
    role_id: user.role_id,
    device_id: payload.device_id
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
      const deviceInfo = await prisma.userSession.findFirst({
        where: {
          user_id: refreshedUser.user_id,
          device_id: refreshedUser.device_id,
          is_revoked: false
        }
      });

      if(!deviceInfo) throw new ApiError(400, "Logged in with another devices");
 
      req.user = refreshedUser;
      return next();
    }

    const payload = verifyAccessToken(accessToken);
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
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
  } catch {
    // ignore errors in optional auth
  }

  next();
};

export const verifyUserToken = [authenticate, authorize()];
export const verifyAdminToken = [authenticate, authorize(1)];
export const verifyOptionalToken = optionalAuth;

