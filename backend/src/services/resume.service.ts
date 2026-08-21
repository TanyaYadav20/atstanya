import mongoose, { type HydratedDocument } from "mongoose";
import Resume, { type IResume } from "../models/Resume";
import type { IAIAnalysis } from "../models/AIAnalysis";

export type ResumeDoc = HydratedDocument<IResume>;


// GET RESUMES FOR A JOB — ranked by AI score


export async function getResumesByJob(
  jobId: mongoose.Types.ObjectId
): Promise<ResumeDoc[]> {
  return Resume.find({ jobId })
    .populate("candidateId")
    .sort({
      "aiAnalysis.overallMatchScore": -1,
      // Deterministic tie-break for equal scores.
      createdAt: 1,
    });
}


// GET A SINGLE RESUME — with candidate and job populated


export async function getResumeById(resumeId: string): Promise<ResumeDoc> {
  if (!mongoose.Types.ObjectId.isValid(resumeId)) {
    const error: Error & { statusCode?: number } = new Error(
      "Invalid resume ID"
    );
    error.statusCode = 400;
    throw error;
  }

  const resume = await Resume.findById(resumeId)
    .populate("candidateId")
    .populate("jobId");

  if (!resume) {
    const error: Error & { statusCode?: number } = new Error(
      "Resume not found"
    );
    error.statusCode = 404;
    throw error;
  }

  return resume;
}

// ============================================================
// FIND OR CREATE A RESUME — scoped to (jobId, resumeHash)
//
// resumeHash identifies an exact duplicate FILE for this job
// only. It is never used to resolve candidate identity — the
// candidateId passed in must already have been resolved by
// candidateMatching.service.ts before calling this.
// ============================================================

interface FindOrCreateResumeInput {
  candidateId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  resumeHash: string;
  filePath: string;
  resumeText: string;
  aiAnalysis?: IAIAnalysis | null;
}

// ============================================================
// FIND THE RESUME TO APPLY WITH — scoped to (candidateId, jobId)
//
// Used by the recruiter bulk-apply flow: a candidate's resume
// already lives in this job's pool (created by /upload-resume),
// so this never creates a Resume — it just picks the one to
// attach to the Application. If more than one resume exists for
// this candidate in this job (re-uploads), prefer the
// highest-scored one, same tie-break as getResumesByJob.
// ============================================================

export async function findResumeForCandidateInJob(
  candidateId: mongoose.Types.ObjectId,
  jobId: mongoose.Types.ObjectId
): Promise<ResumeDoc | null> {
  return Resume.findOne({ candidateId, jobId }).sort({
    "aiAnalysis.overallMatchScore": -1,
    createdAt: 1,
  });
}

export async function findOrCreateResume(data: FindOrCreateResumeInput) {
  const existingResume = await Resume.findOne({
    jobId: data.jobId,
    resumeHash: data.resumeHash,
  });

  if (existingResume) {
    return { resume: existingResume, isDuplicate: true as const };
  }

  const resume = await Resume.create({
    candidateId: data.candidateId,
    jobId: data.jobId,
    resumeHash: data.resumeHash,
    filePath: data.filePath,
    resumeText: data.resumeText,
    aiAnalysis: data.aiAnalysis ?? null,
  });

  return { resume, isDuplicate: false as const };
}
