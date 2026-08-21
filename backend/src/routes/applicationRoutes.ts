import { Router } from "express";
import mongoose from "mongoose";

import requireAuth from "../middleware/requireAuth";
import {
  getApplicationsByJob,
  getApplicationsByCandidate,
  getApplicationById,
} from "../services/application.service";

const router = Router();


// GET /api/applications?jobId=... | ?candidateId=...



router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { jobId, candidateId } = req.query;

    if (jobId && candidateId) {
      return res.status(400).json({
        message: "Provide either jobId or candidateId, not both",
      });
    }

    if (!jobId && !candidateId) {
      return res.status(400).json({
        message: "jobId or candidateId is required",
      });
    }

   
    // Applications for a job — ranked by AI score
    

    if (jobId) {
      if (typeof jobId !== "string" || !mongoose.Types.ObjectId.isValid(jobId)) {
        return res.status(400).json({
          message: "Invalid job ID",
        });
      }

      const applications = await getApplicationsByJob(
        new mongoose.Types.ObjectId(jobId)
      );

      const ranked = [...applications]
        .sort((a, b) => {
          const scoreA = a.aiAnalysis?.overallMatchScore ?? -1;
          const scoreB = b.aiAnalysis?.overallMatchScore ?? -1;

          if (scoreB !== scoreA) {
            return scoreB - scoreA;
          }

          // Deterministic tie-break: earlier application first.
          const createdA = a.createdAt ? a.createdAt.getTime() : 0;
          const createdB = b.createdAt ? b.createdAt.getTime() : 0;

          return createdA - createdB;
        })
        .map((application, index) => ({
          rank: index + 1,
          application,
        }));

      return res.status(200).json({
        jobId,
        totalApplications: ranked.length,
        applications: ranked,
      });
    }

    
    // Applications for a candidate — not cross-job ranked
  

    if (
      typeof candidateId !== "string" ||
      !mongoose.Types.ObjectId.isValid(candidateId)
    ) {
      return res.status(400).json({
        message: "Invalid candidate ID",
      });
    }

    const applications = await getApplicationsByCandidate(
      new mongoose.Types.ObjectId(candidateId)
    );

    return res.status(200).json({
      candidateId,
      totalApplications: applications.length,
      applications,
    });
  } catch (error) {
    next(error);
  }
});


// GET /api/applications/:id


router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid application ID",
      });
    }

    const application = await getApplicationById(id);

    return res.status(200).json({
      application,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
