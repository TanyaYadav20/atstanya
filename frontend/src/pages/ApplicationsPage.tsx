import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { fetchAllApplications, type ApplicationWithJob } from "../lib/applicationsApi";
import { ApiError } from "../types/auth";
import type { Application, ApplicationStatus, Candidate } from "../types/job";
import "./ApplicationsPage.css";

type StatusFilter = "ALL" | ApplicationStatus;

interface ApplicationRow {
  application: Application;
  job: ApplicationWithJob["job"];
  candidate: Candidate | null;
  matchScore: number | null;
}

function isPopulatedCandidate(candidateId: Candidate | string): candidateId is Candidate {
  return typeof candidateId === "object" && candidateId !== null;
}

function buildRow({ application, job }: ApplicationWithJob): ApplicationRow {
  return {
    application,
    job,
    candidate: isPopulatedCandidate(application.candidateId) ? application.candidateId : null,
    matchScore:
      typeof application.aiAnalysis?.overallMatchScore === "number"
        ? application.aiAnalysis.overallMatchScore
        : null,
  };
}

function scoreClass(score: number): string {
  if (score >= 75) return "score-high";
  if (score >= 50) return "score-medium";
  return "score-low";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export default function ApplicationsPage() {
  const navigate = useNavigate();

  const [applications, setApplications] = useState<ApplicationWithJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const results = await fetchAllApplications();
        if (cancelled) return;
        setApplications(results);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Unable to load applications.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo<ApplicationRow[]>(() => {
    if (!applications) return [];
    return applications
      .map(buildRow)
      .sort(
        (a, b) =>
          new Date(b.application.createdAt).getTime() -
          new Date(a.application.createdAt).getTime()
      );
  }, [applications]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesStatus =
        statusFilter === "ALL" || row.application.status === statusFilter;

      const matchesQuery =
        query.length === 0 ||
        row.candidate?.name.toLowerCase().includes(query) ||
        row.candidate?.email?.toLowerCase().includes(query) ||
        row.job.title.toLowerCase().includes(query);

      return matchesStatus && matchesQuery;
    });
  }, [rows, search, statusFilter]);

  return (
    <div className="applications-page">
      <div className="applications-header">
        <div>
          <h1>Applications</h1>
          <p className="applications-subtitle">
            {applications !== null
              ? `${rows.length} application${rows.length === 1 ? "" : "s"} across all jobs`
              : "Loading..."}
          </p>
        </div>
      </div>

      <div className="applications-toolbar">
        <input
          className="applications-search"
          type="text"
          placeholder="Search by candidate or job..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="applications-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="ALL">All</option>
          <option value="APPLIED">Applied</option>
          <option value="SHORTLISTED">Shortlisted</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {applications === null && !error && (
        <p className="applications-state">Loading applications...</p>
      )}
      {error && <p className="applications-state applications-state-error">{error}</p>}
      {applications !== null && !error && filteredRows.length === 0 && (
        <p className="applications-state">No applications found.</p>
      )}

      {applications !== null && !error && filteredRows.length > 0 && (
        <div className="applications-table-wrap">
          <table className="applications-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Job</th>
                <th>Applied On</th>
                <th>AI Analysis</th>
                <th>Match Score</th>
                <th>Status</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
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

                  <td data-label="Job">{row.job.title}</td>

                  <td data-label="Applied On">
                    {row.application.createdAt ? formatDate(row.application.createdAt) : "Not available"}
                  </td>

                  <td data-label="AI Analysis">
                    {row.application.aiAnalysis ? (
                      <span className="ai-status ai-status-completed">Completed</span>
                    ) : (
                      <span className="ai-status ai-status-none">Not analyzed</span>
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
                      <span className="applications-muted">Not available</span>
                    )}
                  </td>

                  <td data-label="Status">
                    <span
                      className={`app-status-badge app-status-${row.application.status.toLowerCase()}`}
                    >
                      {row.application.status}
                    </span>
                  </td>

                  <td data-label="Actions" className="col-actions">
                    <Button
                      variant="ghost"
                      onClick={() => navigate(`/applications/${row.application._id}`)}
                    >
                      Details
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
