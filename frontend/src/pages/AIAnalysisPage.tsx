import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { fetchApplicationsForJob, fetchJobs } from "../lib/jobsApi";
import { ApiError } from "../types/auth";
import type { AIAnalysis, Application, Candidate, Job } from "../types/job";
import "./AIAnalysisPage.css";

interface AnalysisRow {
  rank: number;
  application: Application;
  candidate: Candidate | null;
  aiAnalysis: AIAnalysis | null;
}

function isPopulatedCandidate(candidateId: Candidate | string): candidateId is Candidate {
  return typeof candidateId === "object" && candidateId !== null;
}

function scoreClass(score: number): string {
  if (score >= 75) return "score-high";
  if (score >= 50) return "score-medium";
  return "score-low";
}

function skillsMatchPercent(aiAnalysis: AIAnalysis): number | null {
  const total = aiAnalysis.hardSkillsMatch.found.length + aiAnalysis.hardSkillsMatch.missing.length;
  if (total === 0) return null;
  return Math.round((aiAnalysis.hardSkillsMatch.found.length / total) * 100);
}

function topSkillFrequency(rows: AnalysisRow[], key: "found" | "missing"): { skill: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.aiAnalysis) continue;
    for (const skill of row.aiAnalysis.hardSkillsMatch[key]) {
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

export default function AIAnalysisPage() {
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState("");

  const [applications, setApplications] = useState<AnalysisRow[] | null>(null);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [search, setSearch] = useState("");

  // Jobs power the "Select Job" dropdown — never hardcoded.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setJobsError(null);
      try {
        const res = await fetchJobs();
        if (cancelled) return;
        setJobs(res.jobs);
        if (res.jobs.length > 0) {
          const defaultJob = res.jobs.find((job) => job.status === "OPEN") ?? res.jobs[0];
          setSelectedJobId(defaultJob._id);
        }
      } catch (err) {
        if (cancelled) return;
        setJobsError(err instanceof ApiError ? err.message : "Unable to load jobs.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Every time the selected job (or a retry) fires, reload that job's
  // AI-ranked applications from GET /api/applications?jobId=...
  useEffect(() => {
    if (!selectedJobId) {
      setApplications(null);
      setApplicationsError(null);
      return;
    }

    let cancelled = false;
    setApplications(null);
    setApplicationsError(null);

    async function load() {
      try {
        const res = await fetchApplicationsForJob(selectedJobId);
        if (cancelled) return;
        const rows: AnalysisRow[] = res.applications.map(({ rank, application }) => ({
          rank,
          application,
          candidate: isPopulatedCandidate(application.candidateId) ? application.candidateId : null,
          aiAnalysis: application.aiAnalysis ?? null,
        }));
        setApplications(rows);
      } catch (err) {
        if (cancelled) return;
        setApplicationsError(
          err instanceof ApiError ? err.message : "Unable to load AI analysis for this job."
        );
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedJobId, reloadToken]);

  const filteredRows = useMemo(() => {
    if (!applications) return [];
    const query = search.trim().toLowerCase();
    if (query.length === 0) return applications;
    return applications.filter(
      (row) =>
        row.candidate?.name.toLowerCase().includes(query) ||
        row.candidate?.email?.toLowerCase().includes(query)
    );
  }, [applications, search]);

  const analyzedRows = useMemo(
    () => (applications ?? []).filter((row) => row.aiAnalysis !== null),
    [applications]
  );

  const summary = useMemo(() => {
    if (analyzedRows.length === 0) {
      return { candidatesAnalyzed: 0, averageScore: null, topScore: null, recommended: 0 };
    }
    const scores = analyzedRows.map((row) => row.aiAnalysis!.overallMatchScore);
    const recommended = analyzedRows.filter((row) => row.aiAnalysis!.mustHaveEvaluation.met).length;
    return {
      candidatesAnalyzed: analyzedRows.length,
      averageScore: Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length),
      topScore: Math.max(...scores),
      recommended,
    };
  }, [analyzedRows]);

  const topSkills = useMemo(() => topSkillFrequency(analyzedRows, "found"), [analyzedRows]);
  const missingSkills = useMemo(() => topSkillFrequency(analyzedRows, "missing"), [analyzedRows]);
  const topCandidateRow = useMemo(
    () => analyzedRows.find((row) => row.rank === 1) ?? null,
    [analyzedRows]
  );

  const selectedJob = jobs?.find((job) => job._id === selectedJobId) ?? null;

  return (
    <div className="ai-analysis-page">
      <div className="ai-analysis-header">
        <div>
          <h1>AI Analysis</h1>
          <p className="ai-analysis-subtitle">AI-powered insights and candidate evaluation</p>
        </div>
      </div>

      {jobs === null && !jobsError && (
        <div className="ai-analysis-summary-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="ai-analysis-card skeleton-card" key={i} />
          ))}
        </div>
      )}

      {jobsError && (
        <div className="ai-analysis-state ai-analysis-state-error">
          <p>{jobsError}</p>
          <Button variant="ghost" onClick={() => setReloadToken((t) => t + 1)}>
            Retry
          </Button>
        </div>
      )}

      {jobs !== null && jobs.length === 0 && (
        <div className="ai-analysis-empty">
          <p>No jobs available yet. Create a job to see AI analysis.</p>
          <Button variant="ghost" onClick={() => navigate("/jobs/create")}>
            Create a Job
          </Button>
        </div>
      )}

      {jobs !== null && jobs.length > 0 && (
        <>
          <div className="ai-analysis-toolbar">
            <div className="ai-analysis-job-select-wrap">
              <label htmlFor="ai-analysis-job-select" className="ai-analysis-select-label">
                Select Job
              </label>
              <select
                id="ai-analysis-job-select"
                className="ai-analysis-job-select"
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
              >
                {jobs.map((job) => (
                  <option key={job._id} value={job._id}>
                    {job.title}
                  </option>
                ))}
              </select>
            </div>

            <input
              className="ai-analysis-search"
              type="text"
              placeholder="Search candidates by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="ai-analysis-summary-grid">
            <div className="ai-analysis-card">
              <span className="ai-analysis-card-label">Candidates Analyzed</span>
              <span className="ai-analysis-card-value">{summary.candidatesAnalyzed}</span>
            </div>
            <div className="ai-analysis-card">
              <span className="ai-analysis-card-label">Average Match Score</span>
              <span className="ai-analysis-card-value">
                {summary.averageScore !== null ? `${summary.averageScore}%` : "—"}
              </span>
            </div>
            <div className="ai-analysis-card ai-analysis-card-accent-success">
              <span className="ai-analysis-card-label">Top Candidate Score</span>
              <span className="ai-analysis-card-value">
                {summary.topScore !== null ? `${summary.topScore}%` : "—"}
              </span>
            </div>
            <div className="ai-analysis-card ai-analysis-card-accent-success">
              <span className="ai-analysis-card-label">Candidates Recommended</span>
              <span className="ai-analysis-card-value">{summary.recommended}</span>
            </div>
          </div>

          {applications === null && !applicationsError && (
            <div className="ai-analysis-table-wrap">
              {[0, 1, 2, 3, 4].map((i) => (
                <div className="skeleton-row" key={i} />
              ))}
            </div>
          )}

          {applicationsError && (
            <div className="ai-analysis-state ai-analysis-state-error">
              <p>{applicationsError}</p>
              <Button variant="ghost" onClick={() => setReloadToken((t) => t + 1)}>
                Retry
              </Button>
            </div>
          )}

          {applications !== null && !applicationsError && applications.length === 0 && (
            <div className="ai-analysis-empty">
              <p>No AI analysis available for {selectedJob?.title ?? "this job"} yet.</p>
            </div>
          )}

          {applications !== null && !applicationsError && applications.length > 0 && (
            <>
              {filteredRows.length === 0 ? (
                <div className="ai-analysis-empty">
                  <p>No candidates match your search.</p>
                </div>
              ) : (
                <div className="ai-analysis-table-wrap">
                  <table className="ai-analysis-table">
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Skills</th>
                        <th>Experience</th>
                        <th>Requirements</th>
                        <th>AI Score</th>
                        <th>Status</th>
                        <th className="col-actions">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => {
                        const skillsPercent = row.aiAnalysis ? skillsMatchPercent(row.aiAnalysis) : null;
                        return (
                          <tr key={row.application._id}>
                            <td data-label="Candidate">
                              <div className="candidate-cell">
                                <span className="candidate-name">
                                  {row.candidate?.name ?? "Unknown candidate"}
                                </span>
                                {row.candidate?.email && (
                                  <span className="candidate-email">{row.candidate.email}</span>
                                )}
                              </div>
                            </td>

                            <td data-label="Skills">
                              {skillsPercent !== null ? (
                                <div className="ai-analysis-bar-cell">
                                  <div className="ai-analysis-bar-track">
                                    <div
                                      className="ai-analysis-bar-fill"
                                      style={{ width: `${skillsPercent}%` }}
                                    />
                                  </div>
                                  <span className="ai-analysis-bar-label">
                                    {row.aiAnalysis!.hardSkillsMatch.found.length}/
                                    {row.aiAnalysis!.hardSkillsMatch.found.length +
                                      row.aiAnalysis!.hardSkillsMatch.missing.length}{" "}
                                    matched
                                  </span>
                                </div>
                              ) : (
                                <span className="ai-analysis-muted">Not available</span>
                              )}
                            </td>

                            <td data-label="Experience">
                              {typeof row.candidate?.totalExperienceYears === "number"
                                ? `${row.candidate.totalExperienceYears} yrs`
                                : "Not available"}
                            </td>

                            <td data-label="Requirements">
                              {row.aiAnalysis ? (
                                <span
                                  className={`requirements-badge ${
                                    row.aiAnalysis.mustHaveEvaluation.met
                                      ? "requirements-met"
                                      : "requirements-unmet"
                                  }`}
                                >
                                  {row.aiAnalysis.mustHaveEvaluation.met ? "Met" : "Not met"}
                                </span>
                              ) : (
                                <span className="ai-analysis-muted">Not available</span>
                              )}
                            </td>

                            <td data-label="AI Score">
                              {row.aiAnalysis ? (
                                <div
                                  className={`score-ring ${scoreClass(row.aiAnalysis.overallMatchScore)}`}
                                  style={{
                                    background: `conic-gradient(currentColor ${
                                      row.aiAnalysis.overallMatchScore * 3.6
                                    }deg, var(--color-border) 0deg)`,
                                  }}
                                >
                                  <span className="score-ring-value">
                                    {row.aiAnalysis.overallMatchScore}%
                                  </span>
                                </div>
                              ) : (
                                <span className="ai-analysis-muted">Not analyzed</span>
                              )}
                            </td>

                            <td data-label="Status">
                              <span
                                className={`app-status-badge app-status-${row.application.status.toLowerCase()}`}
                              >
                                {row.application.status}
                              </span>
                            </td>

                            <td data-label="Action" className="col-actions">
                              <Button
                                variant="ghost"
                                onClick={() => navigate(`/applications/${row.application._id}`)}
                              >
                                View Details
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <section className="ai-analysis-insights">
                <h2>AI Insights</h2>

                {analyzedRows.length === 0 ? (
                  <p className="ai-analysis-state">No AI analysis available for this job yet.</p>
                ) : (
                  <div className="ai-analysis-insights-grid">
                    <div className="ai-analysis-insight-card">
                      <span className="ai-analysis-details-label">Strongest Candidate Skills</span>
                      {topSkills.length > 0 ? (
                        <div className="skill-chips">
                          {topSkills.map(({ skill, count }) => (
                            <span className="skill-chip" key={skill}>
                              {skill} · {count}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="ai-analysis-state">Not available</p>
                      )}
                    </div>

                    <div className="ai-analysis-insight-card">
                      <span className="ai-analysis-details-label">Most Common Missing Skills</span>
                      {missingSkills.length > 0 ? (
                        <div className="skill-chips">
                          {missingSkills.map(({ skill, count }) => (
                            <span className="skill-chip skill-chip-missing" key={skill}>
                              {skill} · {count}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="ai-analysis-state">Not available</p>
                      )}
                    </div>

                    <div className="ai-analysis-insight-card">
                      <span className="ai-analysis-details-label">Requirement Match</span>
                      <p>
                        {summary.recommended} of {analyzedRows.length} candidates met all must-have
                        requirements (
                        {Math.round((summary.recommended / analyzedRows.length) * 100)}%).
                      </p>
                    </div>

                    <div className="ai-analysis-insight-card">
                      <span className="ai-analysis-details-label">Overall Recommendation</span>
                      {topCandidateRow?.aiAnalysis ? (
                        <p>
                          <strong>{topCandidateRow.candidate?.name ?? "Top candidate"}</strong> leads
                          with a {topCandidateRow.aiAnalysis.overallMatchScore}% match.{" "}
                          {topCandidateRow.aiAnalysis.executiveSummary}
                        </p>
                      ) : (
                        <p className="ai-analysis-state">Not available</p>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
