import { authRequest, authUpload } from "./httpClient";
import type {
  BulkApplyResponse,
  RankedPooledResume,
  UploadResumesResponse,
} from "../types/resumePool";



// GET /api/resumes?jobId=... — every resume in a job's recruiter-built
// pool, ranked by AI score, with candidateId populated.
export function fetchResumesForJob(jobId: string): Promise<{
  jobId: string;
  totalResumes: number;
  resumes: RankedPooledResume[];
}> {
  return authRequest(`/resumes?jobId=${jobId}`);
}

// POST /api/candidates/upload-resume — recruiter multi-resume upload.
// Creates/finds Candidate + Resume and runs AI analysis; never creates
// Applications (see backend/src/routes/candidateRoutes.ts).
export function uploadResumesForJob(
  jobId: string,
  files: File[]
): Promise<UploadResumesResponse> {
  const formData = new FormData();
  formData.append("jobId", jobId);
  for (const file of files) {
    formData.append("resumes", file);
  }
  return authUpload("/candidates/upload-resume", formData);
}

// POST /api/jobs/:jobId/applications/bulk — turns a subset of the job's
// resume pool into Applications. Used for both the single-candidate Apply
// button and the multi-select Apply Selected action.
export function bulkApplyToJob(
  jobId: string,
  candidateIds: string[]
): Promise<BulkApplyResponse> {
  return authRequest(`/jobs/${jobId}/applications/bulk`, {
    method: "POST",
    body: JSON.stringify({ candidateIds }),
  });
}
