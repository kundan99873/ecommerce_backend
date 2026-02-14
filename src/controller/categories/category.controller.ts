import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { prisma } from "../../libs/prisma.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import {
  uploadMediaToCloudinary,
  deleteMediaFromCloudinary,
} from "../../helper/uploadFileToCloudinary.js";
import type { UploadApiResponse } from "cloudinary";

const addCategory = asyncHandler(async (req: Request, res: Response) => {
  const { name, description } = req.body;

  if (!req.file) {
    throw new ApiError(400, "Category image is required");
  }

  const existingCategory = await prisma.category.findUnique({
    where: { name },
  });

  if (existingCategory) {
    throw new ApiError(400, "Category with this name already exists");
  }

  const uploadResults: UploadApiResponse[] = await uploadMediaToCloudinary(
    req.file,
  );

  if (!uploadResults || uploadResults.length === 0 || !uploadResults[0]) {
    throw new ApiError(500, "Failed to upload category image");
  }
  const uploadResult = uploadResults[0];

  const slug = name.toLowerCase().trim().replace(/\s+/g, "-");

  const category = await prisma.category.create({
    data: {
      name,
      description,
      slug,
      image_url: uploadResult.secure_url,
      image_public_id: uploadResult.public_id,
    },
  });

  res
    .status(201)
    .json(new ApiResponse("Category created successfully", category));
});

const getCategories = asyncHandler(async (req: Request, res: Response) => {
    const { search } = req.query;

    let whereClause = {};
    if (search && typeof search === "string") {
      whereClause = {
        name: {
            contains: search,
            mode: "insensitive",
        },
      };
    }
  const categories = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      slug: true,
      image_url: true,
    },
    where: whereClause,
  });

  res
    .status(200)
    .json(new ApiResponse("Categories retrieved successfully", categories));
});

const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    throw new ApiError(400, "Invalid category ID");
  }

  const { name, description } = req.body;

  const category = await prisma.category.findUnique({
    where: { id },
  });

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  if (name && name !== category.name) {
    const existingCategory = await prisma.category.findUnique({
      where: { name },
    });

    if (existingCategory) {
      throw new ApiError(400, "Category with this name already exists");
    }
  }

  let imageUrl = category.image_url;
  let imagePublicId = category.image_public_id;

  if (req.file) {
    await deleteMediaFromCloudinary(imagePublicId as string);
    const uploadResults: UploadApiResponse[] = await uploadMediaToCloudinary(
      req.file,
    );

    if (!uploadResults || uploadResults.length === 0 || !uploadResults[0]) {
      throw new ApiError(500, "Failed to upload category image");
    }
    const uploadResult = uploadResults[0];

    imageUrl = uploadResult.secure_url;
    imagePublicId = uploadResult.public_id;
  }

  const slug = name.toLowerCase().trim().replace(/\s+/g, "-");

  const updatedCategory = await prisma.category.update({
    where: { id },
    data: {
      name,
      description,
      slug,
      image_url: imageUrl,
      image_public_id: imagePublicId,
    },
  });

  res
    .status(200)
    .json(new ApiResponse("Category updated successfully", updatedCategory));
});

const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    throw new ApiError(400, "Invalid category ID");
  }
  const category = await prisma.category.findUnique({
    where: { id },
  });

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  await deleteMediaFromCloudinary(category.image_public_id as string);
  await prisma.category.delete({
    where: { id },
  });

  return res.status(200).json(new ApiResponse("Category deleted successfully"));
});

const getCategoryById = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    throw new ApiError(400, "Invalid category ID");
  }

  const category = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      slug: true,
      image_url: true,
    },
  });

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  res
    .status(200)
    .json(new ApiResponse("Category retrieved successfully", category));
});

export { addCategory, getCategories, deleteCategory, updateCategory, getCategoryById };
