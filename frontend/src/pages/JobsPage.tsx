import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Input from "../components/Input";
import { deleteJob, fetchJobs, fetchResumePoolCounts, updateJob } from "../lib/jobsApi";
import { ApiError } from "../types/auth";
import type { Job, JobStatus } from "../types/job";
import "./JobsPage.css";

type StatusFilter = "ALL" | JobStatus;

// Mirrors backend/src/validators/jobValidator.ts, same as CreateJobPage.
const TITLE_MIN = 5;
const TITLE_MAX = 100;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 1000;

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

  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<JobStatus>("OPEN");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  function openEditModal(job: Job) {
    setActionError(null);
    setEditError(null);
    setEditingJob(job);
    setEditTitle(job.title);
    setEditDescription(job.description);
    setEditStatus(job.status);
  }

  function closeEditModal() {
    setEditingJob(null);
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editingJob) return;
    setEditError(null);

    const trimmedTitle = editTitle.trim();
    const trimmedDescription = editDescription.trim();

    if (trimmedTitle.length < TITLE_MIN || trimmedTitle.length > TITLE_MAX) {
      setEditError(`Title must be between ${TITLE_MIN} and ${TITLE_MAX} characters.`);
      return;
    }

    if (
      trimmedDescription.length < DESCRIPTION_MIN ||
      trimmedDescription.length > DESCRIPTION_MAX
    ) {
      setEditError(
        `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateJob(editingJob._id, {
        title: trimmedTitle,
        description: trimmedDescription,
        status: editStatus,
      });
      setJobs((prev) => prev?.map((j) => (j._id === res.job._id ? res.job : j)) ?? prev);
      setEditingJob(null);
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.message : "Unable to update job. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(job: Job) {
    if (!window.confirm(`Delete "${job.title}"? This cannot be undone.`)) return;
    setActionError(null);
    setDeletingId(job._id);
    try {
      await deleteJob(job._id);
      setJobs((prev) => prev?.filter((j) => j._id !== job._id) ?? prev);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unable to delete job.");
    } finally {
      setDeletingId(null);
    }
  }

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
      {actionError && <p className="jobs-state jobs-state-error">{actionError}</p>}
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
            <div className="job-card-actions">
              <Button variant="ghost" onClick={() => navigate(`/jobs/${job._id}`)}>
                View
              </Button>
              <Button variant="ghost" onClick={() => openEditModal(job)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                className="job-card-delete"
                isLoading={deletingId === job._id}
                onClick={() => handleDelete(job)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {editingJob && (
        <div className="job-edit-overlay" onClick={closeEditModal}>
          <div className="job-edit-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Job</h2>
            <form className="job-edit-form" onSubmit={handleEditSubmit}>
              <Input
                label="Job Title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
              />

              <div className="field">
                <label className="field-label" htmlFor="job-edit-description">
                  Description
                </label>
                <textarea
                  id="job-edit-description"
                  className="field-input job-edit-description-input"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={6}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="job-edit-status">
                  Status
                </label>
                <select
                  id="job-edit-status"
                  className="field-input"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as JobStatus)}
                >
                  <option value="OPEN">Open</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>

              {editError && (
                <p className="job-edit-error" role="alert">
                  {editError}
                </p>
              )}

              <div className="job-edit-actions">
                <Button type="button" variant="ghost" onClick={closeEditModal}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSaving}>
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
