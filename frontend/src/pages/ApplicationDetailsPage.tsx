import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button";
import { fetchApplicationById } from "../lib/applicationsApi";
import { ApiError } from "../types/auth";
import type { PopulatedApplication } from "../types/application";
import "./ApplicationDetailsPage.css";

function scoreClass(score: number): string {
  if (score >= 75) return "score-high";
  if (score >= 50) return "score-medium";
  return "score-low";
}

export default function ApplicationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [application, setApplication] = useState<PopulatedApplication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    const applicationId = id;
    let cancelled = false;

    async function load() {
      setError(null);
      setNotFound(false);
      setApplication(null);

      try {
        const res = await fetchApplicationById(applicationId);
        if (cancelled) return;
        setApplication(res.application);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(
            err instanceof ApiError ? err.message : "Unable to load application details."
          );
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (notFound) {
    return (
      <div className="application-details-page">
        <p className="application-details-state">Application not found.</p>
        <Button variant="ghost" onClick={() => navigate("/applications")}>
          Back to Applications
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="application-details-page">
        <p className="application-details-state application-details-state-error">{error}</p>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="application-details-page">
        <p className="application-details-state">Loading application details...</p>
      </div>
    );
  }

  const { candidateId: candidate, jobId: job, resumeId: resume, aiAnalysis } = application;

  return (
    <div className="application-details-page">
      <Button variant="ghost" onClick={() => navigate("/applications")}>
        ← Back to Applications
      </Button>

      <div className="application-details-header">
        <div>
          <h1>{candidate?.name ?? "Unknown candidate"}</h1>
          <span className="application-details-subtitle">
            Applied for {job?.title ?? "Not available"}
          </span>
        </div>
        <span className={`app-status-badge app-status-${application.status.toLowerCase()}`}>
          {application.status}
        </span>
      </div>

      <section className="application-details-section">
        <h2>Candidate</h2>
        <div className="application-details-grid">
          <div>
            <span className="application-details-label">Name</span>
            <span>{candidate?.name || "Not available"}</span>
          </div>
          <div>
            <span className="application-details-label">Email</span>
            <span>{candidate?.email || "Not available"}</span>
          </div>
          <div>
            <span className="application-details-label">Phone</span>
            <span>{candidate?.phone || "Not available"}</span>
          </div>
          <div>
            <span className="application-details-label">Experience</span>
            <span>
              {typeof candidate?.totalExperienceYears === "number"
                ? `${candidate.totalExperienceYears} yrs`
                : "Not available"}
            </span>
          </div>
        </div>
        {candidate?._id && (
          <Button variant="ghost" onClick={() => navigate(`/candidates/${candidate._id}`)}>
            View Candidate Profile
          </Button>
        )}
      </section>

      <section className="application-details-section">
        <h2>Job</h2>
        <div className="application-details-grid">
          <div>
            <span className="application-details-label">Title</span>
            <span>{job?.title || "Not available"}</span>
          </div>
          <div>
            <span className="application-details-label">Status</span>
            <span>{job?.status || "Not available"}</span>
          </div>
          <div>
            <span className="application-details-label">Applied On</span>
            <span>
              {application.createdAt
                ? new Date(application.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "2-digit",
                    year: "numeric",
                  })
                : "Not available"}
            </span>
          </div>
        </div>
        {job?._id && (
          <Button variant="ghost" onClick={() => navigate(`/jobs/${job._id}`)}>
            View Job
          </Button>
        )}
      </section>

      <section className="application-details-section">
        <h2>Resume</h2>
        {resume ? (
          <p className="application-details-state">
            Resume on file (submitted{" "}
            {resume.createdAt
              ? new Date(resume.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                })
              : "date not available"}
            ).
          </p>
        ) : (
          <p className="application-details-state">Not available</p>
        )}
      </section>

      <section className="application-details-section">
        <h2>AI Analysis</h2>

        {!aiAnalysis && <p className="application-details-state">Not analyzed</p>}

        {aiAnalysis && (
          <div className="application-analysis">
            <div className="application-analysis-top">
              <div
                className={`score-ring score-ring-lg ${scoreClass(aiAnalysis.overallMatchScore)}`}
                style={{
                  background: `conic-gradient(currentColor ${aiAnalysis.overallMatchScore * 3.6}deg, var(--color-border) 0deg)`,
                }}
              >
                <span className="score-ring-value">{aiAnalysis.overallMatchScore}%</span>
              </div>
              <div className="application-analysis-summary-block">
                <span className="application-details-label">Overall Match Score</span>
                {aiAnalysis.executiveSummary && <p>{aiAnalysis.executiveSummary}</p>}
              </div>
            </div>

            {aiAnalysis.scoringRationale && (
              <div className="application-analysis-row">
                <span className="application-details-label">Scoring Rationale</span>
                <p>{aiAnalysis.scoringRationale}</p>
              </div>
            )}

            <div className="application-analysis-row">
              <span className="application-details-label">Must-Have Requirements</span>
              <p>
                {aiAnalysis.mustHaveEvaluation.met ? "Met" : "Not met"} —{" "}
                {aiAnalysis.mustHaveEvaluation.reason}
              </p>
            </div>

            {aiAnalysis.hardSkillsMatch?.found?.length > 0 && (
              <div className="application-analysis-row">
                <span className="application-details-label">Skills found</span>
                <div className="skill-chips">
                  {aiAnalysis.hardSkillsMatch.found.map((skill) => (
                    <span className="skill-chip" key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {aiAnalysis.hardSkillsMatch?.missing?.length > 0 && (
              <div className="application-analysis-row">
                <span className="application-details-label">Skills missing</span>
                <div className="skill-chips">
                  {aiAnalysis.hardSkillsMatch.missing.map((skill) => (
                    <span className="skill-chip skill-chip-missing" key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {aiAnalysis.redFlags?.length > 0 && (
              <div className="application-analysis-row">
                <span className="application-details-label">Red flags</span>
                <ul className="application-red-flags">
                  {aiAnalysis.redFlags.map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
