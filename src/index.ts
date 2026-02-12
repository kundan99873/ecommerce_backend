import express from "express";
import errorMiddleware from "./middleware/error.middleware.js";
import userRoutes from "./routes/auth.route.js";
import corsConfig from "./config/cors.config.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(corsConfig);

const PORT = process.env.PORT || 3000;

app.use("/api/user", userRoutes);

app.use(errorMiddleware);
app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
