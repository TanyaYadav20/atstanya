import { authRequest } from "./httpClient";
import type { Job, JobStatus, RankedApplication, ResumePoolCount } from "../types/job";

// These map 1:1 to the existing, unmodified backend endpoints in
// backend/src/routes/jobRoutes.ts, resumeRoutes.ts and applicationRoutes.ts.

export function fetchJobs(): Promise<{ jobs: Job[] }> {
  return authRequest("/jobs");
}

export function fetchJob(id: string): Promise<{ job: Job }> {
  return authRequest(`/jobs/${id}`);
}

export interface CreateJobPayload {
  title: string;
  description: string;
  status?: JobStatus;
}

export function createJob(
  payload: CreateJobPayload
): Promise<{ message: string; job: Job }> {
  return authRequest("/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// GET /api/resumes/jobs — bulk resume-pool counts for every job,
// used to enrich the Jobs list without an N+1 request per job.
export function fetchResumePoolCounts(): Promise<{ jobs: ResumePoolCount[] }> {
  return authRequest("/resumes/jobs");
}

// GET /api/applications?jobId=... — real applications for one job,
// ranked by AI match score.
export function fetchApplicationsForJob(jobId: string): Promise<{
  jobId: string;
  totalApplications: number;
  applications: RankedApplication[];
}> {
  return authRequest(`/applications?jobId=${jobId}`);
}
