require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const app = express();
const PORT = 5000;

console.log(process.env.MONGO_URI);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Successfully connected to MongoDB");
  })
  .catch((err) => {
    console.log(err);
  });


// Health check route
app.get("/health", (req, res) => {
  res.json({
    message: "API is healthy",
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});