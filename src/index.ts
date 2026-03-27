import express from "express";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import compression from "compression";
import errorMiddleware from "./middleware/error.middleware.js";
import authRoutes from "./routes/auth.route.js";
import corsConfig from "./config/cors.config.js";
import productRoutes from "./routes/product.route.js";
import categoryRoutes from "./routes/category.route.js";
import heroSlideRoutes from "./routes/heroSlide.route.js";
import userRoutes from "./routes/user.route.js"
import couponRoutes from "./routes/coupon.routes.js";
import orderRoutes from "./routes/order.route.js";
import landingRoutes from "./routes/landing.route.js";
import adminRoutes from "./routes/admin.route.js";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(corsConfig);
app.use(cookieParser());
app.use(morgan("dev"));
app.use(compression());

const PORT = process.env.PORT || 3000;

app.use("/", landingRoutes);
app.get("/test", (req, res) => {
  const user_agent = req.headers["user-agent"] || "";
  const ip_address = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  return res.json({
    ip_address,
    user_agent,
    ip: req.ip,
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/product", productRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/hero-slides", heroSlideRoutes);
app.use("/api/coupon", couponRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/admin", adminRoutes);

app.use(errorMiddleware);
app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
