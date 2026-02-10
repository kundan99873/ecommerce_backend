import express from "express";
import errorMiddleware from "./middleware/error.middleware.js";
import { prisma } from "./libs/prisma.js";
import userRoutes from "./routes/auth.route.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello, World!");
});

async function addRoles() {
  const rolesToAdd = ["admin", "customer"];
  for (const roleName of rolesToAdd) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
  }
  console.log("✅ Roles added or already exist");
}

app.use("/api/user", userRoutes);

app.use(errorMiddleware);
app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  try {
    await addRoles();
  } catch (error) {
    console.error("Failed to add roles:", error);
  }
});
