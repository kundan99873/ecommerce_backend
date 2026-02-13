import { Router } from "express";
import { addProduct } from "../controller/products/product.js";
import { verifyAdminToken } from "../middleware/auth.middleware.js";

const router = Router();


router.use(verifyAdminToken);
router.route("/add").post(addProduct)


export default router;