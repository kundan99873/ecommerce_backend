import type { Request, Response, NextFunction } from "express";
import { ZodType, ZodError } from "zod";
import { ApiError } from "../utils/apiError.js";

export const validate = (schema: ZodType<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        console.log({ err });
        const errors: Record<string, string> = {};
        err.issues.map(
          (issue) => (errors[issue.path.join(".")] = issue.message)
        );

        return next(new ApiError(400, "Validation error", errors));
      }
      next(err);
    }
  };
};
