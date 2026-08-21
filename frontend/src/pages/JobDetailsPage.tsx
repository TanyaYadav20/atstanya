import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button";
import { fetchApplicationsForJob, fetchJob } from "../lib/jobsApi";
import { ApiError } from "../types/auth";
import type { Job, RankedApplication } from "../types/job";
import "./JobDetailsPage.css";

export default function JobDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [applications, setApplications] = useState<RankedApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    const jobId = id;
    let cancelled = false;

    async function load() {
      setError(null);
      setNotFound(false);
      setJob(null);
      setApplications(null);

      try {
        const jobRes = await fetchJob(jobId);
        if (cancelled) return;
        setJob(jobRes.job);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : "Unable to load job details.");
        }
        return;
      }

      // Applications are a secondary section — if this call fails, the
      // job itself still renders, just with an empty applications state.
      try {
        const appsRes = await fetchApplicationsForJob(jobId);
        if (!cancelled) setApplications(appsRes.applications);
      } catch {
        if (!cancelled) setApplications([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (notFound) {
    return (
      <div className="job-details-page">
        <p className="job-details-state">Job not found.</p>
        <Button variant="ghost" onClick={() => navigate("/jobs")}>
          Back to Jobs
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="job-details-page">
        <p className="job-details-state job-details-state-error">{error}</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="job-details-page">
        <p className="job-details-state">Loading job details...</p>
      </div>
    );
  }

  return (
    <div className="job-details-page">
      <Button variant="ghost" onClick={() => navigate("/jobs")}>
        ← Back to Jobs
      </Button>

      <div className="job-details-header">
        <div className="job-details-title-row">
          <h1>{job.title}</h1>
          <span className={`status-badge status-${job.status.toLowerCase()}`}>
            {job.status}
          </span>
        </div>
        {job.createdAt && (
          <span className="job-details-date">
            Posted {new Date(job.createdAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <section className="job-details-section">
        <h2>Description</h2>
        <p className="job-details-description">{job.description}</p>
      </section>

      <section className="job-details-section">
        <h2>Applications{applications !== null ? ` (${applications.length})` : ""}</h2>

        {applications === null && (
          <p className="job-details-state">Loading applications...</p>
        )}

        {applications !== null && applications.length === 0 && (
          <p className="job-details-state">No candidate data available.</p>
        )}

        {applications !== null && applications.length > 0 && (
          <div className="applications-list">
            {applications.map(({ rank, application }) => {
              const candidate =
                typeof application.candidateId === "object"
                  ? application.candidateId
                  : null;

              return (
                <div className="application-card" key={application._id}>
                  <div className="application-rank">#{rank}</div>
                  <div className="application-main">
                    <div className="application-name-row">
                      <strong>{candidate?.name ?? "Unknown candidate"}</strong>
                      <span
                        className={`app-status-badge app-status-${application.status.toLowerCase()}`}
                      >
                        {application.status}
                      </span>
                    </div>
                    {candidate?.email && (
                      <span className="application-detail">{candidate.email}</span>
                    )}
                    {candidate && (
                      <span className="application-detail">
                        {candidate.totalExperienceYears} yrs experience
                      </span>
                    )}
                  </div>
                  {application.aiAnalysis && (
                    <div className="application-score">
                      <span className="score-value">
                        {application.aiAnalysis.overallMatchScore}
                      </span>
                      <span className="score-label">AI Match</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
