import type { AIAnalysis, ApplicationStatus, Job } from "./job";
import type { Candidate, Resume } from "./candidate";

// Shape returned by GET /api/applications/:id — the only application
// endpoint that populates candidateId, jobId AND resumeId together
// (backend/src/services/application.service.ts: getApplicationById).
export interface PopulatedApplication {
  _id: string;
  candidateId: Candidate;
  jobId: Job;
  resumeId: Resume;
  status: ApplicationStatus;
  aiAnalysis?: AIAnalysis | null;
  createdAt: string;
  updatedAt: string;
}
