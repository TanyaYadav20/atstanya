import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { fetchJobs, fetchResumePoolCounts } from "../lib/jobsApi";
import { ApiError } from "../types/auth";
import type { Job, JobStatus } from "../types/job";
import "./JobsPage.css";

type StatusFilter = "ALL" | JobStatus;

export default function JobsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [resumeCounts, setResumeCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [successMessage] = useState<string | null>(
    (location.state as { jobCreated?: boolean } | null)?.jobCreated
      ? "Job created successfully."
      : null
  );

  useEffect(() => {
    if (successMessage) {
      // Clear the navigation state so refreshing/back doesn't re-show it.
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const jobsRes = await fetchJobs();
        if (cancelled) return;
        setJobs(jobsRes.jobs);

        // Resume-pool counts are enrichment only — if this call fails,
        // the Jobs list should still render using real job data.
        try {
          const countsRes = await fetchResumePoolCounts();
          if (cancelled) return;
          const map: Record<string, number> = {};
          for (const row of countsRes.jobs) {
            map[row.jobId] = row.totalResumes;
          }
          setResumeCounts(map);
        } catch {
          // ignore — counts are optional
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Unable to load jobs.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    const query = search.trim().toLowerCase();

    return jobs.filter((job) => {
      const matchesStatus = statusFilter === "ALL" || job.status === statusFilter;
      const matchesQuery =
        query.length === 0 ||
        job.title.toLowerCase().includes(query) ||
        job.description.toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [jobs, search, statusFilter]);

  return (
    <div className="jobs-page">
      <div className="jobs-header">
        <div>
          <h1>Jobs</h1>
          <p className="jobs-subtitle">
            Manage open positions and review candidate pipelines.
          </p>
        </div>
        <Button onClick={() => navigate("/jobs/create")}>+ Create Job</Button>
      </div>

      {successMessage && (
        <p className="jobs-success-banner">{successMessage}</p>
      )}

      <div className="jobs-toolbar">
        <input
          className="jobs-search"
          type="text"
          placeholder="Search jobs by title or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="jobs-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="ALL">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {jobs === null && !error && <p className="jobs-state">Loading jobs...</p>}
      {error && <p className="jobs-state jobs-state-error">{error}</p>}
      {jobs !== null && !error && filteredJobs.length === 0 && (
        <p className="jobs-state">No jobs found.</p>
      )}

      <div className="jobs-grid">
        {filteredJobs.map((job) => (
          <div className="job-card" key={job._id}>
            <div className="job-card-top">
              <h2>{job.title}</h2>
              <span className={`status-badge status-${job.status.toLowerCase()}`}>
                {job.status}
              </span>
            </div>
            <p className="job-card-description">{job.description}</p>
            <div className="job-card-meta">
              <span>
                {job.createdAt
                  ? `Posted ${new Date(job.createdAt).toLocaleDateString()}`
                  : ""}
              </span>
              {resumeCounts[job._id] !== undefined && (
                <span>
                  {resumeCounts[job._id]}{" "}
                  {resumeCounts[job._id] === 1 ? "resume" : "resumes"} in pool
                </span>
              )}
            </div>
            <Button variant="ghost" onClick={() => navigate(`/jobs/${job._id}`)}>
              View
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
