import express from "express";
import errorMiddleware from "./middleware/error.middleware.js";

const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello, World!");
});


app.use(errorMiddleware);
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
