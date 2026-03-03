import express from "express";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import compression from "compression";
import errorMiddleware from "./middleware/error.middleware.js";
import userRoutes from "./routes/auth.route.js";
import corsConfig from "./config/cors.config.js";
import productRoutes from "./routes/product.route.js";
import categoryRoutes from "./routes/category.route.js";
import heroSlideRoutes from "./routes/heroSlide.route.js";
import couponRoutes from "./routes/coupon.routes.js";
import cartWishliadtRoutes from "./routes/cartWishlist.route.js";
import orderRoutes from "./routes/order.route.js";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(corsConfig);
app.use(cookieParser());
app.use(morgan("dev"));
app.use(compression())

const PORT = process.env.PORT || 3000;

app.use("/api/user", userRoutes);
app.use("/api/users", cartWishliadtRoutes);
app.use("/api/product", productRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/hero-slides", heroSlideRoutes);
app.use("/api/coupon", couponRoutes);
app.use("/api/order", orderRoutes);

app.use(errorMiddleware);
app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
