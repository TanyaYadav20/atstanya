import { Router } from "express";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";

import Job from "../models/Job";
import Resume from "../models/Resume";
import requireAuth from "../middleware/requireAuth";
import { getResumesByJob, getResumeById } from "../services/resume.service";

const router = Router();

// Resumes are always saved under this directory (see
// backend/src/middleware/upload.ts) — resolved once so every request
// checks the file it resolves against the same absolute base path.
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

// ============================================================
// GET /api/resumes/jobs
// ============================================================

router.get("/jobs", requireAuth, async (_req, res, next) => {
  try {
    interface ResumeCountRow {
      _id: mongoose.Types.ObjectId | null;
      totalResumes: number;
    }

    const [jobs, counts] = await Promise.all([
      Job.find(),
      Resume.aggregate<ResumeCountRow>([
        {
          $group: {
            _id: "$jobId",
            totalResumes: { $sum: 1 },
          },
        },
      ]),
    ]);

    const countByJobId = new Map<string, number>(
      counts.map((row: ResumeCountRow) => [String(row._id), row.totalResumes])
    );

    const jobsWithCounts = jobs.map(
      (job: { _id: mongoose.Types.ObjectId; title: string }) => ({
        jobId: job._id.toString(),
        jobTitle: job.title,
        totalResumes: countByJobId.get(job._id.toString()) ?? 0,
      })
    );

    return res.status(200).json({
      jobs: jobsWithCounts,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /api/resumes?jobId=...
// ============================================================

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { jobId } = req.query;

    if (typeof jobId !== "string" || !jobId) {
      return res.status(400).json({
        message: "jobId is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({
        message: "Invalid job ID",
      });
    }

    const resumes = await getResumesByJob(new mongoose.Types.ObjectId(jobId));

    const ranked = resumes.map((resume: unknown, index: number) => ({
      rank: index + 1,
      resume,
    }));

    return res.status(200).json({
      jobId,
      totalResumes: ranked.length,
      resumes: ranked,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /api/resumes/:id
// ============================================================

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid resume ID",
      });
    }

    const resume = await getResumeById(id);

    return res.status(200).json({
      resume,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /api/resumes/:id/file — streams the original resume file
// ============================================================

router.get("/:id/file", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid resume ID",
      });
    }

    const resume = await Resume.findById(id);

    if (!resume) {
      return res.status(404).json({
        message: "Resume not found",
      });
    }

    // Only the stored filename is trusted; any directory components are
    // dropped and the result re-resolved under UPLOADS_DIR so a crafted
    // filePath can't be used to escape the uploads directory.
    const resolvedPath = path.resolve(UPLOADS_DIR, path.basename(resume.filePath));

    if (
      resolvedPath !== UPLOADS_DIR &&
      !resolvedPath.startsWith(UPLOADS_DIR + path.sep)
    ) {
      return res.status(400).json({
        message: "Invalid resume file path",
      });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        message: "Resume file not found",
      });
    }

    return res.sendFile(resolvedPath, {
      headers: { "Content-Disposition": "inline" },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
