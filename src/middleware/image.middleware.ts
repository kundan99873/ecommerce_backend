import multer, { type FileFilterCallback } from "multer";
import type { Request } from "express";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 5 },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowedImageTypes = ["image/jpeg", "image/png", "image/jpg"];
    const allowedVideoTypes = ["video/mp4", "video/mkv", "video/avi"];

    const isValid =
      allowedImageTypes.includes(file.mimetype) ||
      allowedVideoTypes.includes(file.mimetype);

    if (isValid) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images (jpg, jpeg, png) and videos (mp4, mkv, avi) are allowed."));
    }
  },
});

export default upload;
