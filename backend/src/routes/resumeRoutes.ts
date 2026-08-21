import { Router } from "express";
import mongoose from "mongoose";

import Job from "../models/Job";
import Resume from "../models/Resume";
import requireAuth from "../middleware/requireAuth";
import { getResumesByJob, getResumeById } from "../services/resume.service";

const router = Router();

// ============================================================
// GET /api/resumes/jobs
//
// Every job, with how many recruiter-uploaded resumes exist in
// its pool. Uses an aggregation for the counts rather than
// loading every Resume document into memory.
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
//
// All resumes in a job's pool, ranked by AI score. Rank is
// computed here for the response only — never written to
// MongoDB.
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

export default router;
