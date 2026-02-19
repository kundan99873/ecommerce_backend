import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/apiError.js";
import { decryptData } from "../utils/utils.js";
import type { TokenPayload } from "../controller/users/types.js";
import { prisma } from "../libs/prisma.js";
import generateTokens from "../controller/users/generateTokens.js";
import { accessTokenCookieOptions } from "../config/cookie.config.js";

// const verifyAdminToken = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   try {
//     const token =
//       req.cookies.accessToken ||
//       (req.header("Authorization")?.replace("Bearer ", "") as string);
//     if (!token) throw new ApiError(401, "Access denied, token missing");

//     const decoded: { data: string } = jwt.verify(
//       token,
//       process.env.ACCESS_TOKEN_SECRET!,
//     ) as any;

//     if (!decoded) throw new ApiError(401, "Invalid or expired token");

//     const userDetails: TokenPayload = decryptData(decoded?.data);
//     if (userDetails.role_id !== 1) {
//       throw new ApiError(403, "Access denied, admin only");
//     }
//     req.user = userDetails;
//     next();
//   } catch (error) {
//     if (error instanceof ApiError) {
//       return next(error);
//     }
//     next(new ApiError(401, "Invalid or expired token"));
//   }
// };

// const verifyAdminToken = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   const accessToken = req.cookies.accessToken;
//   const refreshToken = req.cookies.refreshToken;

//   if (!accessToken && !refreshToken) {
//     return next(new ApiError(401, "Access denied, token missing"));
//   }

//   try {
//     if(!accessToken) throw new ApiError(401, "Access denied, token missing");
//     const decoded = jwt.verify(
//       accessToken,
//       process.env.ACCESS_TOKEN_SECRET!,
//     ) as any;

//     const userDetails: TokenPayload = decryptData(decoded.data);
//     if (userDetails.role_id !== 1) {
//       throw new ApiError(403, "Access denied, admin only");
//     }
//     req.user = userDetails;
//     return next();
//   } catch (error: any) {
//     console.log(error);
//     if (error.name === "TokenExpiredError" && refreshToken) {
//       try {
//         const decodedRefresh = jwt.verify(
//           refreshToken,
//           process.env.REFRESH_TOKEN_SECRET!,
//         ) as any;

//         const refreshPayload: TokenPayload = decryptData(decodedRefresh.data);

//         const user = await prisma.user.findFirst({
//           where: {
//             id: refreshPayload.user_id,
//             refresh_token: refreshToken,
//           },
//         });

//         if (!user) return next(new ApiError(401, "Invalid refresh token"));

//         const { accessToken: newAccessToken } = generateTokens({
//           user_id: user.id,
//           role_id: user.role_id,
//         });

//         res.cookie("accessToken", newAccessToken, accessTokenCookieOptions);

//         req.user = {
//           user_id: user.id,
//           role_id: user.role_id,
//         };

//         return next();
//       } catch {
//         return next(new ApiError(401, "Invalid or expired refresh token"));
//       }
//     }

//     return next(new ApiError(401, "Invalid or expired token"));
//   }
// };

const verifyAdminToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const accessToken = req.cookies?.accessToken;
  const refreshToken = req.cookies?.refreshToken;

  if (!accessToken) {
    return tryRefresh();
  }

  try {
    const decoded = jwt.verify(
      accessToken,
      process.env.ACCESS_TOKEN_SECRET!,
    ) as any;

    const payload: TokenPayload = decryptData(decoded.data);

    if (payload.role_id !== 1) {
      return next(new ApiError(403, "Admin only"));
    }

    req.user = payload;
    return next();
  } catch (error: any) {
    // 🔥 Improved expiration detection
    if (
      error.name === "TokenExpiredError" ||
      error.message?.includes("jwt expired")
    ) {
      return tryRefresh();
    }

    return next(new ApiError(401, "Invalid token"));
  }

  async function tryRefresh() {
    if (!refreshToken) {
      return next(new ApiError(401, "Authentication required"));
    }

    try {
      const decodedRefresh = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET!,
      ) as any;

      const payload: TokenPayload = decryptData(decodedRefresh.data);

      const user = await prisma.user.findUnique({
        where: { id: payload.user_id },
        select: { id: true, role_id: true, refresh_token: true },
      });

      if (!user || user.refresh_token !== refreshToken) {
        return next(new ApiError(401, "Invalid refresh token"));
      }

      if (user.role_id !== 1) {
        return next(new ApiError(403, "Admin only"));
      }

      const { accessToken: newAccessToken } = generateTokens({
        user_id: user.id,
        role_id: user.role_id,
      });

      res.cookie("accessToken", newAccessToken, accessTokenCookieOptions);

      req.user = {
        user_id: user.id,
        role_id: user.role_id,
      };

      return next();
    } catch (err) {
      return next(new ApiError(401, "Session expired"));
    }
  }
};

const verifyUserToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const accessToken = req.cookies.accessToken;
  const refreshToken = req.cookies.refreshToken;

  if (!accessToken) {
    return next(new ApiError(401, "Access denied, token missing"));
  }

  try {
    const decoded = jwt.verify(
      accessToken,
      process.env.ACCESS_TOKEN_SECRET!,
    ) as any;

    const userDetails: TokenPayload = decryptData(decoded.data);
    req.user = userDetails;
    return next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError" && refreshToken) {
      try {
        const decodedRefresh = jwt.verify(
          refreshToken,
          process.env.REFRESH_TOKEN_SECRET!,
        ) as any;

        const refreshPayload: TokenPayload = decryptData(decodedRefresh.data);

        const user = await prisma.user.findFirst({
          where: {
            id: refreshPayload.user_id,
            refresh_token: refreshToken,
          },
        });

        if (!user) return next(new ApiError(401, "Invalid refresh token"));

        const { accessToken: newAccessToken } = generateTokens({
          user_id: user.id,
          role_id: user.role_id,
        });

        res.cookie("accessToken", newAccessToken, accessTokenCookieOptions);

        req.user = {
          user_id: user.id,
          role_id: user.role_id,
        };

        return next();
      } catch {
        return next(new ApiError(401, "Invalid or expired refresh token"));
      }
    }

    return next(new ApiError(401, "Invalid or expired token"));
  }
};

const verifyOptionalToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token =
      req.cookies.accessToken ||
      (req.header("Authorization")?.replace("Bearer ", "") as string);
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as any;

    if (!decoded) return next();

    const userDetails: TokenPayload = decryptData(decoded?.data);
    req.user = userDetails;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(new ApiError(401, "Invalid or expired token"));
  }
};

export { verifyAdminToken, verifyUserToken, verifyOptionalToken };
