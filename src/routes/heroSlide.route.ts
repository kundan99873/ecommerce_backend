import express from "express";
import {
  addHeroSlide,
  deleteHeroSlide,
  getHeroSlides,
  updateHeroSlide,
} from "../controller/heroSlides/heroSlides.controller.js";
import upload from "../middleware/image.middleware.js";

const router = express.Router();

router.route("/").get(getHeroSlides).post(upload.single("image"), addHeroSlide);
router
  .route("/:id")
  .patch(upload.single("image"), updateHeroSlide)
  .delete(deleteHeroSlide);

export default router;
