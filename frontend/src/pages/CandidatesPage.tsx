import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { fetchApplicationsForCandidate, fetchCandidates } from "../lib/candidatesApi";
import { ApiError } from "../types/auth";
import type { Candidate, CandidateApplication } from "../types/candidate";
import type { Job } from "../types/job";
import "./CandidatesPage.css";

type StatusFilter = "ALL" | CandidateApplication["status"];

// Everything the table/derived filters need for one candidate, resolved
// from that candidate's most recent application (applications are sorted
// newest-first by the backend — see application.service.ts).
interface CandidateRow {
  candidate: Candidate;
  latestApplication: CandidateApplication | null;
  applicationCount: number;
  appliedJobTitle: string | null;
  skills: string[];
  matchScore: number | null;
}

function isPopulatedJob(job: Job | string): job is Job {
  return typeof job === "object" && job !== null;
}

function buildRow(candidate: Candidate, applications: CandidateApplication[] | null): CandidateRow {
  const latestApplication = applications && applications.length > 0 ? applications[0] : null;

  const appliedJobTitle =
    latestApplication && isPopulatedJob(latestApplication.jobId)
      ? latestApplication.jobId.title
      : null;

  const skills = latestApplication?.aiAnalysis?.hardSkillsMatch?.found ?? [];

  const matchScore =
    typeof latestApplication?.aiAnalysis?.overallMatchScore === "number"
      ? latestApplication.aiAnalysis.overallMatchScore
      : null;

  return {
    candidate,
    latestApplication,
    applicationCount: applications?.length ?? 0,
    appliedJobTitle,
    skills,
    matchScore,
  };
}

function scoreClass(score: number): string {
  if (score >= 75) return "score-high";
  if (score >= 50) return "score-medium";
  return "score-low";
}

export default function CandidatesPage() {
  const navigate = useNavigate();

  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [applicationsByCandidate, setApplicationsByCandidate] = useState<
    Record<string, CandidateApplication[] | null>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [jobFilter, setJobFilter] = useState<string>("ALL");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const res = await fetchCandidates();
        if (cancelled) return;
        setCandidates(res.candidates);

        // Applied job / skills / status / match score all come from each
        // candidate's applications — enrichment only, so a failure here
        // still leaves the real candidate list rendered.
        const entries = await Promise.all(
          res.candidates.map(async (candidate) => {
            try {
              const appsRes = await fetchApplicationsForCandidate(candidate._id);
              return [candidate._id, appsRes.applications] as const;
            } catch {
              return [candidate._id, null] as const;
            }
          })
        );

        if (cancelled) return;
        setApplicationsByCandidate(Object.fromEntries(entries));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Unable to load candidates.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo<CandidateRow[]>(() => {
    if (!candidates) return [];
    return candidates.map((candidate) =>
      buildRow(candidate, applicationsByCandidate[candidate._id] ?? null)
    );
  }, [candidates, applicationsByCandidate]);

  const hasAnyStatus = rows.some((r) => r.latestApplication);
  const hasAnyJob = rows.some((r) => r.appliedJobTitle);

  const jobOptions = useMemo(() => {
    const titles = new Set<string>();
    for (const row of rows) {
      if (row.appliedJobTitle) titles.add(row.appliedJobTitle);
    }
    return Array.from(titles).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesStatus =
        statusFilter === "ALL" || row.latestApplication?.status === statusFilter;

      const matchesJob = jobFilter === "ALL" || row.appliedJobTitle === jobFilter;

      const matchesQuery =
        query.length === 0 ||
        row.candidate.name.toLowerCase().includes(query) ||
        row.candidate.email?.toLowerCase().includes(query) ||
        row.skills.some((skill) => skill.toLowerCase().includes(query));

      return matchesStatus && matchesJob && matchesQuery;
    });
  }, [rows, search, statusFilter, jobFilter]);

  return (
    <div className="candidates-page">
      <div className="candidates-header">
        <div>
          <h1>Candidates</h1>
          <p className="candidates-subtitle">
            {candidates !== null
              ? `${candidates.length} ${candidates.length === 1 ? "candidate" : "candidates"}`
              : "Loading..."}
          </p>
        </div>
      </div>

      <div className="candidates-toolbar">
        <input
          className="candidates-search"
          type="text"
          placeholder="Search by name, email, or skill..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {hasAnyStatus && (
          <select
            className="candidates-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="ALL">All statuses</option>
            <option value="APPLIED">Applied</option>
            <option value="SHORTLISTED">Shortlisted</option>
            <option value="REJECTED">Rejected</option>
          </select>
        )}

        {hasAnyJob && (
          <select
            className="candidates-filter"
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
          >
            <option value="ALL">All jobs</option>
            {jobOptions.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </select>
        )}
      </div>

      {candidates === null && !error && (
        <p className="candidates-state">Loading candidates...</p>
      )}
      {error && <p className="candidates-state candidates-state-error">{error}</p>}
      {candidates !== null && !error && filteredRows.length === 0 && (
        <p className="candidates-state">No candidates found.</p>
      )}

      {candidates !== null && !error && filteredRows.length > 0 && (
        <div className="candidates-table-wrap">
          <table className="candidates-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Applied Job</th>
                <th>Skills</th>
                <th>Experience</th>
                <th>Status</th>
                <th>Match Score</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.candidate._id}>
                  <td data-label="Candidate">
                    <div className="candidate-cell">
                      <span className="candidate-name">{row.candidate.name}</span>
                      {row.candidate.email && (
                        <span className="candidate-email">{row.candidate.email}</span>
                      )}
                    </div>
                  </td>

                  <td data-label="Applied Job">
                    {row.appliedJobTitle ? (
                      <>
                        <span>{row.appliedJobTitle}</span>
                        {row.applicationCount > 1 && (
                          <span className="candidates-muted">
                            {" "}
                            +{row.applicationCount - 1} more
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="candidates-muted">Not available</span>
                    )}
                  </td>

                  <td data-label="Skills">
                    {row.skills.length > 0 ? (
                      <div className="skill-chips">
                        {row.skills.slice(0, 4).map((skill) => (
                          <span className="skill-chip" key={skill}>
                            {skill}
                          </span>
                        ))}
                        {row.skills.length > 4 && (
                          <span className="skill-chip skill-chip-more">
                            +{row.skills.length - 4}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="candidates-muted">Not available</span>
                    )}
                  </td>

                  <td data-label="Experience">
                    {typeof row.candidate.totalExperienceYears === "number"
                      ? `${row.candidate.totalExperienceYears} yrs`
                      : "Not available"}
                  </td>

                  <td data-label="Status">
                    {row.latestApplication ? (
                      <span
                        className={`app-status-badge app-status-${row.latestApplication.status.toLowerCase()}`}
                      >
                        {row.latestApplication.status}
                      </span>
                    ) : (
                      <span className="candidates-muted">Not available</span>
                    )}
                  </td>

                  <td data-label="Match Score">
                    {row.matchScore !== null ? (
                      <div
                        className={`score-ring ${scoreClass(row.matchScore)}`}
                        style={{
                          background: `conic-gradient(currentColor ${row.matchScore * 3.6}deg, var(--color-border) 0deg)`,
                        }}
                      >
                        <span className="score-ring-value">{row.matchScore}%</span>
                      </div>
                    ) : (
                      <span className="candidates-muted">Not analyzed</span>
                    )}
                  </td>

                  <td data-label="Actions" className="col-actions">
                    <Button variant="ghost" onClick={() => navigate(`/candidates/${row.candidate._id}`)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
