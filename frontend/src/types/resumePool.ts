import type { AIAnalysis } from "./job";
import type { Candidate, Resume } from "./candidate";

// backend/src/models/Candidate.ts also stores possibleDuplicateOf, which the
// shared Candidate type (types/candidate.ts) omits — included here since the
// resume pool surfaces it as a "possible duplicate" flag.
export interface PooledCandidate extends Candidate {
  possibleDuplicateOf?: Array<{
    candidateId: string;
    confidenceScore: number;
    matchedFields: string[];
    flaggedAt: string;
  }>;
}

// GET /api/resumes?jobId=... populates candidateId with the full Candidate
// document (backend/src/services/resume.service.ts: getResumesByJob), so
// this is a Resume with candidateId resolved instead of left as an id.
export interface PooledResume extends Omit<Resume, "candidateId"> {
  candidateId: PooledCandidate;
}

export interface RankedPooledResume {
  rank: number;
  resume: PooledResume;
}

export type CandidateMatchStatus = "MATCH" | "REVIEW" | "NEW";

// One entry in the response of POST /api/candidates/upload-resume
// (backend/src/routes/candidateRoutes.ts) — one per uploaded file.
export interface UploadedResumeResult {
  fileName: string;
  candidate?: Candidate;
  resume?: Resume;
  aiAnalysis?: AIAnalysis;
  status?: "CREATED" | "DUPLICATE";
  message?: string;
  matching?: {
    status: CandidateMatchStatus;
    confidenceScore: number;
    matchedFields: string[];
  };
  rank?: number | null;
  error?: string;
}

export interface UploadResumesResponse {
  message: string;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  candidates: UploadedResumeResult[];
}

// Response of POST /api/jobs/:jobId/applications/bulk
// (backend/src/routes/jobRoutes.ts).
export interface BulkApplyResponse {
  message: string;
  jobId: string;
  totalRequested: number;
  created: Array<{ candidateId: string; resumeId: string; applicationId: string }>;
  skipped: Array<{ candidateId: string; reason: string }>;
  failed: Array<{ candidateId: string; reason: string }>;
}
