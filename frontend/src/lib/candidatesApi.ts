import { authRequest } from "./httpClient";
import type { Candidate, CandidateApplication } from "../types/candidate";

// These map 1:1 to the existing, unmodified backend endpoints in
// backend/src/routes/candidateRoutes.ts and applicationRoutes.ts.

// GET /api/candidates — every candidate in MongoDB.
export function fetchCandidates(): Promise<{ candidates: Candidate[] }> {
  return authRequest("/candidates");
}

// GET /api/candidates/:id — a single candidate by id.
export function fetchCandidate(id: string): Promise<{ candidate: Candidate }> {
  return authRequest(`/candidates/${id}`);
}

// GET /api/applications?candidateId=... — every application for a
// candidate, with jobId and resumeId populated (job title, AI analysis).
export function fetchApplicationsForCandidate(candidateId: string): Promise<{
  candidateId: string;
  totalApplications: number;
  applications: CandidateApplication[];
}> {
  return authRequest(`/applications?candidateId=${candidateId}`);
}
