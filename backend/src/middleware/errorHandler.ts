import { type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";

// ============================================================
// An error that intentionally carries its own HTTP status code
// (e.g. thrown by application-level code that wants a specific
// response). Ordinary errors just don't have this property.
// ============================================================

export interface AppError extends Error {
  statusCode?: number;
}

function isDuplicateKeyError(
  error: unknown
): error is Error & { code: 11000 } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

// ============================================================
// CENTRALIZED ERROR HANDLER
//
// Registered once, after every route, as the last app.use() in
// server.ts. Routes hand unexpected errors to this via
// next(error) instead of building their own response — explicit
// responses a route already returns directly (400/401/403/404/
// 409 via res.status(...).json(...)) never reach this handler at
// all, since they return before anything throws.
// ============================================================

function errorHandler(
  error: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("Unhandled error:", error);

  // Mongoose: malformed ObjectId (e.g. GET /jobs/hello)
  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: "Invalid ID" });
    return;
  }

  // Mongoose: schema validation failure
  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ message: "Validation failed" });
    return;
  }

  // MongoDB: unique index violation
  if (isDuplicateKeyError(error)) {
    res.status(409).json({ message: "Duplicate resource" });
    return;
  }

  // An application error that explicitly set its own status code
  const statusCode =
    typeof error.statusCode === "number" ? error.statusCode : 500;

  const message =
    statusCode !== 500 && error.message
      ? error.message
      : "Internal Server Error";

  res.status(statusCode).json({ message });
}

export default errorHandler;
