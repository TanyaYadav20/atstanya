import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes";
import jobRoutes from "./routes/jobRoutes";
import candidateRoutes from "./routes/candidateRoutes";
import applicationRoutes from "./routes/applicationRoutes";
import resumeRoutes from "./routes/resumeRoutes";
import errorHandler from "./middleware/errorHandler";


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
app.use("/api/applications", applicationRoutes);
app.use("/api/resumes", resumeRoutes);



// Health check route
app.get("/health", (_req, res) => {
  res.json({
    message: "API is healthy",
  });
});

// Centralized error handler — must be registered after every
// route so it can catch errors passed via next(error).
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});