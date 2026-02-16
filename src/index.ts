import express from "express";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import errorMiddleware from "./middleware/error.middleware.js";
import userRoutes from "./routes/auth.route.js";
import corsConfig from "./config/cors.config.js";
import productRoutes from "./routes/product.route.js";
import categoryRoutes from "./routes/category.route.js";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(corsConfig);
app.use(cookieParser());
app.use(morgan("dev"));

const PORT = process.env.PORT || 3000;

app.use("/api/user", userRoutes);
app.use("/api/product", productRoutes);
app.use("/api/category", categoryRoutes);

app.use(errorMiddleware);
app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
