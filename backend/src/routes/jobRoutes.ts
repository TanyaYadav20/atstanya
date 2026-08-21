import { Router } from "express";
import mongoose from "mongoose";
import Job from "../models/Job";
import requireAuth from "../middleware/requireAuth";
import { jobSchema } from "../validators/jobValidator";
import { bulkApplicationSchema } from "../validators/applicationValidator";
import { bulkCreateApplicationsForJob } from "../services/application.service";

const router = Router();


  // Create Job

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { error, value } = jobSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: error.details[0].message,
      });
    }

    const { title, description, status } = value;

    const job = new Job({
      title,
      description,
      status,
      createdBy: req.user?.userId,
    });

    await job.save();

    return res.status(201).json({
      message: "Job created successfully",
      job,
    });
  } catch (error) {
    next(error);
  }
});


  // Get All Jobs

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const jobs = await Job.find({});

    return res.status(200).json({
      jobs,
    });
  } catch (error) {
    next(error);
  }
});


   //Get Single Job

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
    });

    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    return res.status(200).json({
      job,
    });
  } catch (error) {
    next(error);
  }
});


  // Update Job

router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const updatedJob = await Job.findOneAndUpdate(
      {
        _id: req.params.id,
      },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedJob) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    return res.status(200).json({
      message: "Job updated successfully",
      job: updatedJob,
    });
  } catch (error) {
    next(error);
  }
});


   //Delete Job

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const deletedJob = await Job.findOneAndDelete({
      _id: req.params.id,
    });

    if (!deletedJob) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    return res.status(200).json({
      message: "Job deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// RECRUITER BULK APPLY
//
// POST /api/jobs/:jobId/applications/bulk
// Body: { candidateIds: string[] }
//
// Candidates + resumes already exist in this job's resume pool
// (created via POST /api/candidates/upload-resume, which is
// unchanged and still creates NO Applications). This route is
// the only place that turns a subset of that pool into
// Applications, reusing createOrUpdateApplication per candidate.
// ============================================================

router.post(
  "/:jobId/applications/bulk",
  requireAuth,
  async (req, res, next) => {
    try {
      const { jobId } = req.params;

      // ------------------------------------------------------
      // 1. Validate + find job
      // ------------------------------------------------------

      if (!mongoose.Types.ObjectId.isValid(jobId)) {
        return res.status(400).json({
          message: "Invalid job ID",
        });
      }

      const job = await Job.findById(jobId);

      if (!job) {
        return res.status(404).json({
          message: "Job not found",
        });
      }

      // ------------------------------------------------------
      // 2. Validate candidateIds
      // ------------------------------------------------------

      const { error, value } = bulkApplicationSchema.validate(req.body);

      if (error) {
        return res.status(400).json({
          message: error.details[0].message,
        });
      }

      const { candidateIds } = value;

      // ------------------------------------------------------
      // 3. Apply each selected candidate — created/skipped/failed
      //    per candidate, never failing the whole batch.
      // ------------------------------------------------------

      const result = await bulkCreateApplicationsForJob(
        new mongoose.Types.ObjectId(jobId),
        candidateIds
      );

      return res.status(200).json({
        message: "Bulk application processed",
        jobId,
        totalRequested: candidateIds.length,
        created: result.created,
        skipped: result.skipped,
        failed: result.failed,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;