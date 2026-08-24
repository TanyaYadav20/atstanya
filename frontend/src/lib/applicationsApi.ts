import { authRequest } from "./httpClient";
import { fetchApplicationsForJob, fetchJobs } from "./jobsApi";
import type { Application, Job } from "../types/job";
import type { PopulatedApplication } from "../types/application";

export interface ApplicationWithJob {
  application: Application;
  job: Job;
}


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
