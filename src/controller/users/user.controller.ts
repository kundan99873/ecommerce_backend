import type { Request, Response } from "express";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { TokenPayload } from "./types.js";

const getLoggedInUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req.user as TokenPayload).user_id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatar_url: true,
      role: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json(new ApiResponse("User retrieved successfully", user));
});



export { getLoggedInUser };
