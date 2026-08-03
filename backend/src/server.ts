import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT: number = 5000;

mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => {
    console.log("Successfully connected to MongoDB");
  })
  .catch((err: Error) => {
    console.error(err);
  });

  app.get("/health", (_req, res) => {
  res.json({
    message: "API is healthy",
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});