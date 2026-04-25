import type { Request, Response } from "express";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { TokenPayload } from "./types.js";
import {
  deleteMediaFromCloudinary,
  uploadMediaToCloudinary,
} from "../../helper/uploadFileToCloudinary.js";
import type { UploadApiResponse } from "cloudinary";

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

const updateUserProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req.user as TokenPayload).user_id;
  const { name, email, phone_code, phone_number } = req.body as {
    name?: string;
    email?: string;
    phone_code?: string;
    phone_number?: string;
  };

  const normalizedName = typeof name === "string" ? name.trim() : undefined;
  const normalizedEmail = typeof email === "string" ? email.trim() : undefined;
  const normalizedPhoneCode =
    typeof phone_code === "string" ? phone_code.trim() : undefined;
  const normalizedPhoneNumber =
    typeof phone_number === "string" ? phone_number.trim() : undefined;

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      avatar_public_id: true,
    },
  });

  if (!existingUser) {
    throw new ApiError(404, "User not found");
  }

  if (
    normalizedEmail !== undefined &&
    normalizedEmail.toLowerCase() !== existingUser.email.toLowerCase()
  ) {
    throw new ApiError(400, "Email cannot be changed for this account");
  }

  const hasProfileFieldUpdate =
    normalizedName !== undefined ||
    normalizedPhoneCode !== undefined ||
    normalizedPhoneNumber !== undefined;

  if (!hasProfileFieldUpdate && !req.file) {
    throw new ApiError(
      400,
      "At least one profile field or avatar must be provided",
    );
  }

  if (normalizedPhoneNumber !== undefined) {
    const phoneOwner = await prisma.user.findUnique({
      where: { phone_number: normalizedPhoneNumber },
      select: { id: true },
    });

    if (phoneOwner && phoneOwner.id !== userId) {
      throw new ApiError(400, "Phone number is already in use");
    }
  }

  let imageData: UploadApiResponse | undefined;
  if (req.file) {
    try {
      if (existingUser.avatar_public_id) {
        await deleteMediaFromCloudinary(existingUser.avatar_public_id);
      }

      const uploadResult = await uploadMediaToCloudinary(req.file, "users");
      imageData = uploadResult[0];
    } catch (error) {
      console.error("Error replacing avatar in Cloudinary:", error);
      throw new ApiError(500, "Failed to replace avatar");
    }
  }

  const updateData: {
    name?: string;
    phone_code?: string;
    phone_number?: string;
    avatar_url?: string;
    avatar_public_id?: string;
  } = {};

  if (normalizedName !== undefined) updateData.name = normalizedName;
  if (normalizedPhoneCode !== undefined)
    updateData.phone_code = normalizedPhoneCode;
  if (normalizedPhoneNumber !== undefined)
    updateData.phone_number = normalizedPhoneNumber;

  if (imageData) {
    updateData.avatar_url = imageData.secure_url;
    updateData.avatar_public_id = imageData.public_id;
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      phone_code: true,
      phone_number: true,
      avatar_url: true,
      is_active: true,
      role: {
        select: {
          name: true,
        },
      },
    },
  });

  res.status(200).json(
    new ApiResponse("Profile updated successfully", {
      id: updatedUser.id,
      username: updatedUser.name,
      email: updatedUser.email,
      phone_code: updatedUser.phone_code,
      phone_number: updatedUser.phone_number,
      avatar_url: updatedUser.avatar_url,
      role: updatedUser.role?.name,
      status: updatedUser.is_active ? "active" : "inactive",
    }),
  );
});

export { getLoggedInUser, updateUserProfile };
