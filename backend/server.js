const express = require("express");

const app = express();
const PORT = 5000;

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