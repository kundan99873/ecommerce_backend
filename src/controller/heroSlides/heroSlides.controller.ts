import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";
import type { UploadApiResponse } from "cloudinary";
import {
  deleteMediaFromCloudinary,
  uploadMediaToCloudinary,
} from "../../helper/uploadFileToCloudinary.js";
import { prisma } from "../../libs/prisma.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import type { HeroSlideInput, HeroSlideQuery } from "./heroSlides.types.js";

const addHeroSlide = asyncHandler(async (req: Request, res: Response) => {
  const { title, description, link, cta, is_active } =
    req.body as HeroSlideInput;

  if (!req.file) {
    throw new ApiError(400, "Image file is required");
  }

  const uploadResults: UploadApiResponse[] = await uploadMediaToCloudinary(
    req.file,
    "hero-slides",
  );

  if (!uploadResults || uploadResults.length === 0 || !uploadResults[0]) {
    throw new ApiError(500, "Failed to upload hero slide image");
  }
  const uploadResult = uploadResults[0];

  const newHeroSlide = await prisma.heroSlides.create({
    data: {
      title,
      description: description ?? null,
      link: link ?? null,
      cta: cta ?? null,
      is_active:
        is_active !== undefined
          ? is_active === "true" || is_active === true
          : true,
      image_url: uploadResult.secure_url,
      image_public_id: uploadResult.public_id,
    },
  });

  return res
    .status(201)
    .json(new ApiResponse("Hero slide created successfully", newHeroSlide));
});

const getHeroSlides = asyncHandler(async (req: Request, res: Response) => {
  const { is_active, search } = req.query as HeroSlideQuery;
  const whereClause: Record<string, any> =
    is_active !== undefined
      ? { is_active: is_active === "true" || is_active === true }
      : {};
  if (search) {
    whereClause["title"] = {
      contains: search,
      mode: "insensitive",
    };
  }
  const heroSlides = await prisma.heroSlides.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      link: true,
      cta: true,
      is_active: true,
      image_url: true,
    },
    where: whereClause,
    orderBy: {
      created_at: "desc",
    },
  });

  return res
    .status(200)
    .json(new ApiResponse("Hero slides retrieved successfully", heroSlides));
});

const updateHeroSlide = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, description, link, cta, is_active } =
    req.body as HeroSlideInput;
  const existingSlide = await prisma.heroSlides.findUnique({
    where: { id: Number(id) },
  });

  if (!existingSlide) {
    throw new ApiError(404, "Hero slide not found");
  }

  let imageUrl = existingSlide.image_url;

  if (req.file) {
    const uploadResults: UploadApiResponse[] = await uploadMediaToCloudinary(
      req.file,
      "hero-slides",
    );
    if (!uploadResults || uploadResults.length === 0 || !uploadResults[0]) {
      throw new ApiError(500, "Failed to upload hero slide image");
    }
    const uploadResult = uploadResults[0];
    imageUrl = uploadResult.secure_url;
    await prisma.heroSlides.update({
      where: { id: Number(id) },
      data: {
        image_url: imageUrl,
        image_public_id: uploadResult.public_id,
      },
    });

    if (existingSlide.image_public_id) {
      await deleteMediaFromCloudinary(existingSlide.image_public_id).catch(
        (err) => {
          console.error(
            "Failed to delete old hero slide image from Cloudinary:",
            err,
          );
        },
      );
    }
  }

  const updatedSlide = await prisma.heroSlides.update({
    where: { id: Number(id) },
    data: {
      title: title ?? existingSlide.title,
      description: description ?? existingSlide.description,
      link: link ?? existingSlide.link,
      cta: cta ?? existingSlide.cta,
      is_active:
        is_active !== undefined
          ? is_active === "true" || is_active === true
          : existingSlide.is_active,
    },
  });

  return res
    .status(200)
    .json(new ApiResponse("Hero slide updated successfully", updatedSlide));
});

const deleteHeroSlide = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const existingSlide = await prisma.heroSlides.findUnique({
    where: { id: Number(id) },
  });

  if (!existingSlide) {
    throw new ApiError(404, "Hero slide not found");
  }

  await prisma.heroSlides.delete({
    where: { id: Number(id) },
  });

  return res
    .status(200)
    .json(new ApiResponse("Hero slide deleted successfully"));
});

export { addHeroSlide, getHeroSlides, updateHeroSlide, deleteHeroSlide };
