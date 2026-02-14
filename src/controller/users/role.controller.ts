import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";

const addRole = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Role name is required" });
  }

  const existingRole = await prisma.role.findUnique({
    where: { name },
  });

  if (existingRole) {
    throw new ApiError(400, "Role with this name already exists");
  }

  const role = await prisma.role.create({
    data: { name },
  });

  return res
    .status(201)
    .json(new ApiResponse("Role created successfully", role));
});

const getRoles = asyncHandler(async (req: Request, res: Response) => {
  const roles = await prisma.role.findMany();
  return res
    .status(200)
    .json(new ApiResponse("Roles retrieved successfully", roles));
});

const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name } = req.body;

  if (!id) {
    return res.status(400).json({ message: "Role ID is required" });
  }

  const role = await prisma.role.findUnique({
    where: { id },
  });

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  const updateRole = await prisma.role.update({
    where: { id },
    data: { name },
  });

  return res
    .status(200)
    .json(new ApiResponse("Role updated successfully", updateRole));
});

const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Role ID is required" });
  }

  const role = await prisma.role.findUnique({
    where: { id },
  });

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  await prisma.role.delete({
    where: { id },
  });

  return res.status(200).json(new ApiResponse("Role deleted successfully"));
});

export { addRole, getRoles, updateRole, deleteRole };
