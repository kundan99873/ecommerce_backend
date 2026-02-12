import type { UploadApiResponse } from "cloudinary";
import cloudinary from "../config/cloudinary.config.js";


interface UploadFile {
  mimetype: string;
  buffer: Buffer;
  originalname: string;
}

const uploadMediaToCloudinary = async (files: UploadFile | UploadFile[]): Promise<UploadApiResponse[]> => {
  if (!Array.isArray(files)) {
    files = [files];
  }
  const uploadPromises: Promise<UploadApiResponse>[] = files.map((file) => {
    return new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: file.mimetype.includes("image") ? "image" : "video",
            folder: "ecommerce/",
          },
          (error, result) => {
            if (error) {
              reject(error);
            }
            resolve(result as UploadApiResponse);
          }
        )
        .end(file.buffer);
    });
  });

  return Promise.all(uploadPromises);
};

const deleteMediaFromCloudinary = async (publicIds: string | string[]): Promise<UploadApiResponse[]> => {
  if (!Array.isArray(publicIds)) {
    publicIds = [publicIds];
  }

  const deletePromises: Promise<UploadApiResponse>[] = publicIds.map((publicId) => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) {
          reject(error);
        }
        resolve(result as UploadApiResponse); 
      });
    });
  });

  return Promise.all(deletePromises);
};


export { uploadMediaToCloudinary, deleteMediaFromCloudinary };