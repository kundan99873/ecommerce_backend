import cloudinary from "../config/cloudinaryConfig.js";


interface UploadFile {
  mimetype: string;
  buffer: Buffer;
  originalname: string;
}

const uploadMediaToCloudinary = async (files: UploadFile | UploadFile[]) => {
  if (!Array.isArray(files)) {
    files = [files];
  }
  const uploadPromises = files.map((file) => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: file.mimetype.includes("image") ? "image" : "video",
            folder: "social-media/",
          },
          (error, result) => {
            if (error) {
              reject(error);
            }
            resolve(result);
          }
        )
        .end(file.buffer);
    });
  });

  return Promise.all(uploadPromises);
};

const deleteMediaFromCloudinary = async (publicIds: string | string[]) => {
  if (!Array.isArray(publicIds)) {
    publicIds = [publicIds];
  }

  const deletePromises = publicIds.map((publicId) => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) {
          reject(error);
        }
        resolve(result); 
      });
    });
  });

  return Promise.all(deletePromises);
};


export { uploadMediaToCloudinary, deleteMediaFromCloudinary };