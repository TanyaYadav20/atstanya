import Application from "../models/Application";
import Candidate from "../models/Candidate";
import mongoose from "mongoose";
import { findResumeForCandidateInJob } from "./resume.service";

// TYPES

interface ApplicationData {
  candidateId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  resumeId: mongoose.Types.ObjectId;
  aiAnalysis: unknown;
}

export interface BulkApplyResult {
  created: Array<{
    candidateId: string;
    resumeId: string;
    applicationId: string;
  }>;
  skipped: Array<{ candidateId: string; reason: string }>;
  failed: Array<{ candidateId: string; reason: string }>;
}

type ApplicationStatus =
  | "APPLIED"
  | "SHORTLISTED"
  | "REJECTED";


// CREATE OR UPDATE APPLICATION


export async function createOrUpdateApplication(
  data: ApplicationData
) {
  const {
    candidateId,
    jobId,
    resumeId,
    aiAnalysis,
  } = data;

  
  // Find application for this candidate + job
  

  const existingApplication =
    await Application.findOne({
      candidateId,
      jobId,
    });

  
  // APPLICATION ALREADY EXISTS
  
  if (existingApplication) {
    console.log(
      "Existing application found. Updating application."
    );

    // Use the new resume
    existingApplication.resumeId =
      resumeId;

    // Replace AI analysis with analysis
    // generated from the new resume
    existingApplication.aiAnalysis =
      aiAnalysis as any;

    // Keep it as applied
    existingApplication.status =
      "APPLIED";

    await existingApplication.save();

    return {
      application: existingApplication,
      created: false,
      updated: true,
    };
  }

 
  // CREATE NEW APPLICATION
  

  console.log(
    "No existing application found. Creating application."
  );

  const application =
    await Application.create({
      candidateId,
      jobId,
      resumeId,
      status: "APPLIED",
      aiAnalysis,
    });

  return {
    application,
    created: true,
    updated: false,
  };
}


// ============================================================
// BULK APPLY — recruiter selects candidates from a job's resume
// pool (already created via /api/candidates/upload-resume) and
// applies them to the job.
//
// Each candidate is processed independently so one bad ID can't
// fail the whole batch. Application creation itself is NOT
// duplicated here — it delegates to createOrUpdateApplication,
// the same function /api/candidates/apply uses. The only
// bulk-specific rule is: if the candidate already has an
// Application for this job, skip instead of overwriting it —
// unlike a resubmission through /apply, a recruiter selecting an
// already-applied candidate again isn't providing a new resume.
// ============================================================

export async function bulkCreateApplicationsForJob(
  jobId: mongoose.Types.ObjectId,
  candidateIds: string[]
): Promise<BulkApplyResult> {
  const created: BulkApplyResult["created"] = [];
  const skipped: BulkApplyResult["skipped"] = [];
  const failed: BulkApplyResult["failed"] = [];

  for (const candidateId of candidateIds) {
    try {
      if (!mongoose.Types.ObjectId.isValid(candidateId)) {
        failed.push({ candidateId, reason: "Invalid candidate ID" });
        continue;
      }

      const candidateObjectId = new mongoose.Types.ObjectId(candidateId);

      const candidate = await Candidate.findById(candidateObjectId);

      if (!candidate) {
        failed.push({ candidateId, reason: "Candidate not found" });
        continue;
      }

      const existingApplication = await getApplicationByCandidateAndJob(
        candidateObjectId,
        jobId
      );

      if (existingApplication) {
        skipped.push({
          candidateId,
          reason: "Candidate has already applied to this job",
        });
        continue;
      }

      const resume = await findResumeForCandidateInJob(
        candidateObjectId,
        jobId
      );

      if (!resume) {
        failed.push({
          candidateId,
          reason: "No resume found for this candidate in this job's resume pool",
        });
        continue;
      }

      const result = await createOrUpdateApplication({
        candidateId: candidateObjectId,
        jobId,
        resumeId: resume._id,
        aiAnalysis: resume.aiAnalysis ?? null,
      });

      created.push({
        candidateId,
        resumeId: resume._id.toString(),
        applicationId: result.application._id.toString(),
      });
    } catch (err) {
      failed.push({
        candidateId,
        reason:
          err instanceof Error ? err.message : "Failed to create application",
      });
    }
  }

  return { created, skipped, failed };
}


// GET APPLICATION BY CANDIDATE + JOB


export async function getApplicationByCandidateAndJob(
  candidateId: mongoose.Types.ObjectId,
  jobId: mongoose.Types.ObjectId
) {
  const application =
    await Application.findOne({
      candidateId,
      jobId,
    })
      .populate("candidateId")
      .populate("jobId")
      .populate("resumeId");

  return application;
}


// GET ALL APPLICATIONS FOR A CANDIDATE

export async function getApplicationsByCandidate(
  candidateId: mongoose.Types.ObjectId
) {
  const applications =
    await Application.find({
      candidateId,
    })
      .populate("jobId")
      .populate("resumeId")
      .sort({
        createdAt: -1,
      });

  return applications;
}


// GET ALL APPLICATIONS FOR A JOB


export async function getApplicationsByJob(
  jobId: mongoose.Types.ObjectId
) {
  const applications =
    await Application.find({
      jobId,
    })
      .populate("candidateId")
      .populate("resumeId")
      .sort({
        createdAt: -1,
      });

  return applications;
}


// GET SINGLE APPLICATION


export async function getApplicationById(
  applicationId: string
) {
  if (
    !mongoose.Types.ObjectId.isValid(
      applicationId
    )
  ) {
    const error: Error & { statusCode?: number } = new Error(
      "Invalid application ID"
    );
    error.statusCode = 400;
    throw error;
  }

  const application =
    await Application.findById(
      applicationId
    )
      .populate("candidateId")
      .populate("jobId")
      .populate("resumeId");

  if (!application) {
    const error: Error & { statusCode?: number } = new Error(
      "Application not found"
    );
    error.statusCode = 404;
    throw error;
  }

  return application;
}


// UPDATE APPLICATION STATUS

export async function updateApplicationStatus(
  applicationId: string,
  status: ApplicationStatus
) {
  if (
    !mongoose.Types.ObjectId.isValid(
      applicationId
    )
  ) {
    throw new Error(
      "Invalid application ID"
    );
  }

  const application =
    await Application.findById(
      applicationId
    );

  if (!application) {
    throw new Error(
      "Application not found"
    );
  }

  application.status =
    status;

  await application.save();

  return application;
}


// DELETE APPLICATION

export async function deleteApplication(
  applicationId: string
) {
  if (
    !mongoose.Types.ObjectId.isValid(
      applicationId
    )
  ) {
    throw new Error(
      "Invalid application ID"
    );
  }

  const application =
    await Application.findByIdAndDelete(
      applicationId
    );

  if (!application) {
    throw new Error(
      "Application not found"
    );
  }

  return application;
}