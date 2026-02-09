import type { NextFunction, Request, Response } from "express";

const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error("🔥 Error:", err);

  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  return res.status(statusCode).json({
    success: false,
    message,
    ...(err.errors ? { error: err.errors } : {}),
  });
};

export default errorMiddleware;
