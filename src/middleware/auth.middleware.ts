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
      refresh_token: true,
    },
  });

  if (!user || user.refresh_token !== refreshToken) {
    throw new ApiError(401, "Invalid refresh token");
  }

  // 🔥 Generate new access token
  const { accessToken: newAccessToken } = generateTokens({
    user_id: user.id,
    role_id: user.role_id,
  });

  res.cookie("accessToken", newAccessToken, accessTokenCookieOptions);

  return {
    user_id: user.id,
    role_id: user.role_id,
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

// import type { NextFunction, Request, Response } from "express";
// import jwt from "jsonwebtoken";
// import { ApiError } from "../utils/apiError.js";
// import { decryptData } from "../utils/utils.js";
// import type { TokenPayload } from "../controller/users/types.js";
// import { prisma } from "../libs/prisma.js";
// import generateTokens from "../controller/users/generateTokens.js";
// import { accessTokenCookieOptions } from "../config/cookie.config.js";

// const verifyAdminToken = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   const accessToken = req.cookies?.accessToken;
//   const refreshToken = req.cookies?.refreshToken;

//   if (!accessToken) {
//     return tryRefresh();
//   }

//   try {
//     const decoded = jwt.verify(
//       accessToken,
//       process.env.ACCESS_TOKEN_SECRET!,
//     ) as any;

//     const payload: TokenPayload = decryptData(decoded.data);

//     if (payload.role_id !== 1) {
//       return next(new ApiError(403, "Admin only"));
//     }

//     req.user = payload;
//     return next();
//   } catch (error: any) {
//     // 🔥 Improved expiration detection
//     if (
//       error.name === "TokenExpiredError" ||
//       error.message?.includes("jwt expired")
//     ) {
//       return tryRefresh();
//     }

//     return next(new ApiError(401, "Invalid token"));
//   }

//   async function tryRefresh() {
//     if (!refreshToken) {
//       return next(new ApiError(401, "Authentication required"));
//     }

//     try {
//       const decodedRefresh = jwt.verify(
//         refreshToken,
//         process.env.REFRESH_TOKEN_SECRET!,
//       ) as any;

//       const payload: TokenPayload = decryptData(decodedRefresh.data);

//       const user = await prisma.user.findUnique({
//         where: { id: payload.user_id },
//         select: { id: true, role_id: true, refresh_token: true },
//       });

//       if (!user || user.refresh_token !== refreshToken) {
//         return next(new ApiError(401, "Invalid refresh token"));
//       }

//       if (user.role_id !== 1) {
//         return next(new ApiError(403, "Admin only"));
//       }

//       const { accessToken: newAccessToken } = generateTokens({
//         user_id: user.id,
//         role_id: user.role_id,
//       });

//       res.cookie("accessToken", newAccessToken, accessTokenCookieOptions);

//       req.user = {
//         user_id: user.id,
//         role_id: user.role_id,
//       };

//       return next();
//     } catch (err) {
//       return next(new ApiError(401, "Session expired"));
//     }
//   }
// };

// const verifyUserToken = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   const accessToken = req.cookies.accessToken;
//   const refreshToken = req.cookies.refreshToken;

//   if (!accessToken) {
//     return next(new ApiError(401, "Access denied, token missing"));
//   }

//   try {
//     const decoded = jwt.verify(
//       accessToken,
//       process.env.ACCESS_TOKEN_SECRET!,
//     ) as any;

//     const userDetails: TokenPayload = decryptData(decoded.data);
//     req.user = userDetails;
//     return next();
//   } catch (error: any) {
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

// const verifyOptionalToken = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   try {
//     const token =
//       req.cookies.accessToken ||
//       (req.header("Authorization")?.replace("Bearer ", "") as string);
//     if (!token) return next();

//     const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as any;

//     if (!decoded) return next();

//     const userDetails: TokenPayload = decryptData(decoded?.data);
//     req.user = userDetails;
//     next();
//   } catch (error) {
//     if (error instanceof ApiError) {
//       return next(error);
//     }
//     next(new ApiError(401, "Invalid or expired token"));
//   }
// };

// export { verifyAdminToken, verifyUserToken, verifyOptionalToken };
