import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button";
import { fetchApplicationsForCandidate, fetchCandidate } from "../lib/candidatesApi";
import { ApiError } from "../types/auth";
import type { Candidate, CandidateApplication } from "../types/candidate";
import type { Job } from "../types/job";
import "./CandidateDetailsPage.css";

function isPopulatedJob(job: Job | string): job is Job {
  return typeof job === "object" && job !== null;
}

export default function CandidateDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [applications, setApplications] = useState<CandidateApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    const candidateId = id;
    let cancelled = false;

    async function load() {
      setError(null);
      setNotFound(false);
      setCandidate(null);
      setApplications(null);

      try {
        const candidateRes = await fetchCandidate(candidateId);
        if (cancelled) return;
        setCandidate(candidateRes.candidate);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : "Unable to load candidate details.");
        }
        return;
      }

      // Applications are a secondary section — if this call fails, the
      // candidate itself still renders, just with an empty applications state.
      try {
        const appsRes = await fetchApplicationsForCandidate(candidateId);
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
      <div className="candidate-details-page">
        <p className="candidate-details-state">Candidate not found.</p>
        <Button variant="ghost" onClick={() => navigate("/candidates")}>
          Back to Candidates
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="candidate-details-page">
        <p className="candidate-details-state candidate-details-state-error">{error}</p>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="candidate-details-page">
        <p className="candidate-details-state">Loading candidate details...</p>
      </div>
    );
  }

  return (
    <div className="candidate-details-page">
      <Button variant="ghost" onClick={() => navigate("/candidates")}>
        ← Back to Candidates
      </Button>

      <div className="candidate-details-header">
        <div>
          <h1>{candidate.name}</h1>
          <span className="candidate-details-ref">{candidate.candidateRef}</span>
        </div>
      </div>

      <section className="candidate-details-section">
        <h2>Contact</h2>
        <div className="candidate-details-grid">
          <div>
            <span className="candidate-details-label">Email</span>
            <span>{candidate.email || "Not available"}</span>
          </div>
          <div>
            <span className="candidate-details-label">Phone</span>
            <span>{candidate.phone || "Not available"}</span>
          </div>
          <div>
            <span className="candidate-details-label">Experience</span>
            <span>
              {typeof candidate.totalExperienceYears === "number"
                ? `${candidate.totalExperienceYears} yrs`
                : "Not available"}
            </span>
          </div>
          <div>
            <span className="candidate-details-label">LinkedIn</span>
            {candidate.linkedinUrl ? (
              <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer">
                {candidate.linkedinUrl}
              </a>
            ) : (
              <span>Not available</span>
            )}
          </div>
          <div>
            <span className="candidate-details-label">GitHub</span>
            {candidate.githubUrl ? (
              <a href={candidate.githubUrl} target="_blank" rel="noreferrer">
                {candidate.githubUrl}
              </a>
            ) : (
              <span>Not available</span>
            )}
          </div>
        </div>
      </section>

      <section className="candidate-details-section">
        <h2>Applications{applications !== null ? ` (${applications.length})` : ""}</h2>

        {applications === null && (
          <p className="candidate-details-state">Loading applications...</p>
        )}

        {applications !== null && applications.length === 0 && (
          <p className="candidate-details-state">No applications found.</p>
        )}

        {applications !== null && applications.length > 0 && (
          <div className="candidate-applications-list">
            {applications.map((application) => {
              const job = isPopulatedJob(application.jobId) ? application.jobId : null;
              const analysis = application.aiAnalysis;

              return (
                <div className="candidate-application-card" key={application._id}>
                  <div className="candidate-application-top">
                    <div>
                      <strong>{job?.title ?? "Job not available"}</strong>
                      <span
                        className={`app-status-badge app-status-${application.status.toLowerCase()}`}
                      >
                        {application.status}
                      </span>
                    </div>
                    {analysis && (
                      <div className="candidate-application-score">
                        <span className="score-value">{analysis.overallMatchScore}%</span>
                        <span className="score-label">AI Match</span>
                      </div>
                    )}
                  </div>

                  {application.createdAt && (
                    <span className="candidate-application-date">
                      Applied {new Date(application.createdAt).toLocaleDateString()}
                    </span>
                  )}

                  {analysis ? (
                    <div className="candidate-application-analysis">
                      {analysis.executiveSummary && (
                        <p className="candidate-analysis-summary">{analysis.executiveSummary}</p>
                      )}

                      {analysis.hardSkillsMatch?.found?.length > 0 && (
                        <div className="candidate-skills-row">
                          <span className="candidate-details-label">Skills found</span>
                          <div className="skill-chips">
                            {analysis.hardSkillsMatch.found.map((skill) => (
                              <span className="skill-chip" key={skill}>
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {analysis.hardSkillsMatch?.missing?.length > 0 && (
                        <div className="candidate-skills-row">
                          <span className="candidate-details-label">Skills missing</span>
                          <div className="skill-chips">
                            {analysis.hardSkillsMatch.missing.map((skill) => (
                              <span className="skill-chip skill-chip-missing" key={skill}>
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {analysis.redFlags?.length > 0 && (
                        <div className="candidate-skills-row">
                          <span className="candidate-details-label">Red flags</span>
                          <ul className="candidate-red-flags">
                            {analysis.redFlags.map((flag) => (
                              <li key={flag}>{flag}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="candidate-details-state">Not analyzed</p>
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
