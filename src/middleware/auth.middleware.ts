import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/apiError.js";
import { decryptData } from "../utils/utils.js";

const verifyAdminToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token =
      req.cookies.accessToken ||
      (req.header("Authorization")?.replace("Bearer ", "") as string);
    if (!token) throw new ApiError(401, "Access denied, token missing");

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as any;

    if (!decoded) throw new ApiError(401, "Invalid or expired token");

    const userDetails = decryptData(decoded?.data);
    if (userDetails.role_id !== 1) {
      throw new ApiError(403, "Access denied, admin only");
    }
    req.user = userDetails;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(new ApiError(401, "Invalid or expired token"));
  }
};
const verifyUserToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token =
      req.cookies.accessToken ||
      (req.header("Authorization")?.replace("Bearer ", "") as string);
    if (!token) throw new ApiError(401, "Access denied, token missing");

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as any;

    if (!decoded) throw new ApiError(401, "Invalid or expired token");

    const userDetails = decryptData(decoded?.data);
    req.user = userDetails;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(new ApiError(401, "Invalid or expired token"));
  }
};

export { verifyAdminToken, verifyUserToken };
