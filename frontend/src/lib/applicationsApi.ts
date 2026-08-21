import { authRequest } from "./httpClient";
import { fetchApplicationsForJob, fetchJobs } from "./jobsApi";
import type { Application, Job } from "../types/job";
import type { PopulatedApplication } from "../types/application";

export interface ApplicationWithJob {
  application: Application;
  job: Job;
}

// The backend only exposes GET /api/applications?jobId=... and
// ?candidateId=... (backend/src/routes/applicationRoutes.ts) — there is
// no all-applications endpoint, and none is added here. This composes
// the existing, unmodified jobId-scoped endpoint across every job, the
// same N+1-over-an-existing-endpoint approach CandidatesPage.tsx already
// uses for per-candidate applications.
export async function fetchAllApplications(): Promise<ApplicationWithJob[]> {
  const { jobs } = await fetchJobs();

  const perJob = await Promise.all(
    jobs.map(async (job) => {
      try {
        const res = await fetchApplicationsForJob(job._id);
        return res.applications.map((ranked) => ({
          application: ranked.application,
          job,
        }));
      } catch {
        // One job's applications failing to load shouldn't blank out
        // every other job's real data.
        return [];
      }
    })
  );

  return perJob.flat();
}

// GET /api/applications/:id — the only application endpoint that
// populates candidateId, jobId and resumeId together.
export function fetchApplicationById(
  id: string
): Promise<{ application: PopulatedApplication }> {
  return authRequest(`/applications/${id}`);
}
