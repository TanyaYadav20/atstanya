import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes";
import jobRoutes from "./routes/jobRoutes";
import candidateRoutes from "./routes/candidateRoutes";


dotenv.config();

const app = express();
const PORT: number = 5000;

// Parse JSON request bodies
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => {
    console.log("Successfully connected to MongoDB");
  })
  .catch((err: Error) => {
    console.error(err);
  });

// Auth routes
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/candidates", candidateRoutes);



// Health check route
app.get("/health", (_req, res) => {
  res.json({
    message: "API is healthy",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});