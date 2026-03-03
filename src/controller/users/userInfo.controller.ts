import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { addAddressBody } from "./types.js";
import { prisma } from "../../libs/prisma.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/apiError.js";

const addAddress = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.user_id;
  const body = req.body as addAddressBody;

  const getUserAddresses = await prisma.address.findMany({
    where: { user_id: userId as number },
  });

  const address = await prisma.address.create({
    data: {
      user_id: userId as number,
      first_name: body.first_name,
      last_name: body.last_name,
      phone_code: body.phone_code ?? null,
      phone_number: body.phone_number,
      line1: body.line1,
      line2: body.line2 ?? null,
      city: body.city,
      state: body.state,
      pin_code: body.pin_code,
      country: body.country,
      landmark: body.landmark ?? null,
      is_default:
        getUserAddresses.length === 0 ? true : (body.is_default ?? false),
      is_active: body.is_active ?? true,
    },
  });

  return res
    .status(201)
    .json(new ApiResponse("Address added successfully", address));
});

const getUserAddresses = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.user_id;

  const addresses = await prisma.address.findMany({
    where: { user_id: userId as number },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      phone_code: true,
      phone_number: true,
      line1: true,
      line2: true,
      city: true,
      state: true,
      pin_code: true,
      country: true,
      landmark: true,
      is_default: true,
      is_active: true,
    },
  });

  return res
    .status(200)
    .json(new ApiResponse("User addresses retrieved successfully", addresses));
});

const deleteAddress = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.user_id;
  const addressId = parseInt(req.params.id as string);

  const address = await prisma.address.findFirst({
    where: { id: addressId, user_id: userId as number },
  });

  if (!address) {
    throw new ApiError(404, "Address not found");
  }

  await prisma.address.delete({
    where: { id: addressId },
  });

  return res.status(200).json(new ApiResponse("Address deleted successfully"));
});

const updateAddress = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.user_id;
  const addressId = parseInt(req.params.id as string);
  const body = req.body as addAddressBody;

  const address = await prisma.address.findFirst({
    where: { id: addressId, user_id: userId as number },
  });

  if (!address) throw new ApiError(404, "Address not found");

  const updatedAddress = await prisma.address.update({
    where: { id: addressId },
    data: {
      first_name: body.first_name,
      last_name: body.last_name,
      phone_code: body.phone_code ?? null,
      phone_number: body.phone_number,
      line1: body.line1,
      line2: body.line2 ?? null,
      city: body.city,
      state: body.state,
      pin_code: body.pin_code,
      country: body.country,
      landmark: body.landmark ?? null,
      is_default: body.is_default ?? false,
      is_active: body.is_active ?? true,
    },
  });

  return res
    .status(200)
    .json(new ApiResponse("Address updated successfully", updatedAddress));
});

export { addAddress, getUserAddresses, deleteAddress, updateAddress };
