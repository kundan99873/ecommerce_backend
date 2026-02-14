import type { Request, Response } from "express";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { getUserQuery, TokenPayload } from "./types.js";

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

const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const { search, role, limit = 50, page = 1, sort } = req.query as getUserQuery;
  const whereClause: any = {};
  if (search) whereClause.name = { contains: search, mode: "insensitive" };
  if (role) whereClause.role_id = Number(role);

  const users = await prisma.user.findMany({
    where: whereClause,
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
      is_active: true,
      _count: {
        select: {
          order: true,
        }
      },
      order: {
        select: {
          total_amount: true,
        }
      }
    },
    orderBy: {

    },
    skip: (page - 1) * limit,
    take: limit,
  });

  res.status(200).json(new ApiResponse("Users retrieved successfully", users));
});

const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const userId = Number(req.params.id);

  if (isNaN(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

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
      is_active: true,
      _count: {
        select: {
          order: true,
        }
      },
      order: {
        select: {
          total_amount: true,
        }
      }
    },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json(new ApiResponse("User retrieved successfully", user));
});

const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const { name, email, role_id, is_active } = req.body;

  if (isNaN(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { name, email, role_id, is_active },
  });

  res.status(200).json(new ApiResponse("User updated successfully", updatedUser));
});

const changeUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = Number(req.params.id);

  if (isNaN(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { is_active: !user.is_active },
  });

  res.status(200).json(new ApiResponse("User status updated successfully", updatedUser));
}); 


export { getLoggedInUser, getAllUsers };
