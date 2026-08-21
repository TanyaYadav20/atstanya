import type { AIAnalysis, ApplicationStatus, Candidate, Job } from "./job";

// Resume, as returned (populated) by GET /api/applications?candidateId=...
// and GET /api/resumes/:id — see backend/src/models/Resume.ts.
export interface Resume {
  _id: string;
  candidateId: string;
  jobId: string;
  resumeHash: string;
  filePath: string;
  resumeText: string;
  aiAnalysis?: AIAnalysis | null;
  createdAt: string;
  updatedAt: string;
}

// GET /api/applications?candidateId=... populates jobId and resumeId
// (backend/src/services/application.service.ts: getApplicationsByCandidate),
// unlike the base Application type in types/job.ts which leaves them as ids.
export interface CandidateApplication {
  _id: string;
  candidateId: string;
  jobId: Job | string;
  resumeId: Resume | string;
  status: ApplicationStatus;
  aiAnalysis?: AIAnalysis | null;
  createdAt: string;
  updatedAt: string;
}

export type { Candidate };
