import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { fetchCandidates } from "../lib/candidatesApi";
import { fetchApplicationsForJob, fetchJobs, fetchResumePoolCounts } from "../lib/jobsApi";
import { ApiError } from "../types/auth";
import type { ApplicationWithJob } from "../lib/applicationsApi";
import type {
  Application,
  ApplicationStatus,
  Candidate,
  Job,
  ResumePoolCount,
} from "../types/job";
import "./DashboardPage.css";

interface DashboardData {
  jobs: Job[];
  candidates: Candidate[];
  resumeCounts: ResumePoolCount[];
  appsWithJob: ApplicationWithJob[];
}

interface ActivityItem {
  id: string;
  timestamp: string;
  text: string;
  tone: "accent" | "success" | "danger";
}

interface DayBucket {
  key: string;
  label: string;
  count: number;
  isToday: boolean;
}

const PIPELINE_STATUSES: ApplicationStatus[] = ["APPLIED", "SHORTLISTED", "REJECTED"];

function isPopulatedCandidate(candidateId: Candidate | string): candidateId is Candidate {
  return typeof candidateId === "object" && candidateId !== null;
}

function scoreClass(score: number): string {
  if (score >= 75) return "score-high";
  if (score >= 45) return "score-medium";
  return "score-low";
}

// A handful of legacy job records in the real database predate this
// field being written consistently, so createdAt/updatedAt can't be
// trusted to always be a valid date — guard instead of assuming.
function safeTime(value: string | undefined | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

// No date-formatting library exists in this project (see package.json) —
// every other page hand-rolls its own small date helper, so this follows
// the same convention rather than adding a dependency.
function formatRelativeTime(value: string | undefined | null): string {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

// Buckets by the viewer's local calendar date, not UTC — using
// toISOString() here would shift anything after ~6:30pm IST (UTC+5:30)
// onto the next UTC day, so an application made today in India could
// silently land in "tomorrow"'s bucket once the days rolled over.
function toLocalDateKey(value: string | Date): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Re-applying to the same job updates the existing Application document
// instead of creating a new one (see backend/src/services/application.service.ts
// createOrUpdateApplication) — createdAt stays put and updatedAt moves to
// today. A createdAt-only chart would miss that resubmission entirely, so
// bucket by whichever timestamp reflects the most recent activity. On
// creation both fields start out equal, so this still falls back to
// createdAt for brand-new applications.
function latestActivityTimestamp(application: Application): string {
  return safeTime(application.updatedAt) > safeTime(application.createdAt)
    ? application.updatedAt
    : application.createdAt;
}

// Builds a real, from-data daily series for the last N days from each
// application's actual activity — no synthetic/fabricated values.
function buildDailySeries(appsWithJob: ApplicationWithJob[], days: number): DayBucket[] {
  const buckets: DayBucket[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    buckets.push({
      key: toLocalDateKey(d),
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      count: 0,
      isToday: i === 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const { application } of appsWithJob) {
    const bucket = byKey.get(toLocalDateKey(latestActivityTimestamp(application)));
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

// Derives real recent-activity events from existing timestamped fields —
// job creation, application creation, and application status changes
// (inferred from updatedAt moving meaningfully past createdAt). Nothing
// here is fabricated; it's all read from data the backend already returns.
function buildActivity(jobs: Job[], appsWithJob: ApplicationWithJob[]): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const job of jobs) {
    items.push({
      id: `job-${job._id}`,
      timestamp: job.createdAt,
      text: `New job posted: ${job.title}`,
      tone: "accent",
    });
  }

  for (const { application, job } of appsWithJob) {
    const candidate = isPopulatedCandidate(application.candidateId)
      ? application.candidateId
      : null;
    const name = candidate?.name ?? "A candidate";

    items.push({
      id: `app-${application._id}`,
      timestamp: application.createdAt,
      text: `${name} applied for ${job.title}`,
      tone: "accent",
    });

    const createdMs = safeTime(application.createdAt);
    const updatedMs = safeTime(application.updatedAt);
    if (application.status !== "APPLIED" && updatedMs - createdMs > 60_000) {
      items.push({
        id: `app-status-${application._id}`,
        timestamp: application.updatedAt,
        text: `${name} ${application.status === "SHORTLISTED" ? "was shortlisted for" : "was rejected for"} ${job.title}`,
        tone: application.status === "SHORTLISTED" ? "success" : "danger",
      });
    }
  }

  return items.sort((a, b) => safeTime(b.timestamp) - safeTime(a.timestamp)).slice(0, 8);
}

function ActivityChart({ data }: { data: DayBucket[] }) {
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="activity-chart">
      <div className="activity-chart-bars">
        {data.map((bucket) => {
          const heightPct = (bucket.count / maxCount) * 100;
          const showLabel = bucket.count > 0 && bucket.count === maxCount;
          return (
            <div className="activity-chart-col" key={bucket.key}>
              <span className="activity-chart-value">{showLabel ? bucket.count : " "}</span>
              <div
                className="activity-chart-bar"
                style={{ height: `${bucket.count > 0 ? Math.max(heightPct, 4) : 2}%` }}
                title={`${bucket.count} application${bucket.count === 1 ? "" : "s"} on ${bucket.key}`}
              />
              <span
                className={`activity-chart-label${bucket.isToday ? " activity-chart-label-today" : ""}`}
              >
                {bucket.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      setErrorMessage(null);
      try {
        // Jobs and candidates are the two collections every other section
        // is built from, so a failure here is a page-level error.
        const [jobsRes, candidatesRes] = await Promise.all([fetchJobs(), fetchCandidates()]);
        if (cancelled) return;
        const jobs = jobsRes.jobs;

        // Resume-pool counts are enrichment only, same as JobsPage — a
        // failure here shouldn't blank out the rest of the dashboard.
        let resumeCounts: ResumePoolCount[] = [];
        try {
          const countsRes = await fetchResumePoolCounts();
          resumeCounts = countsRes.jobs;
        } catch {
          // ignore — counts are optional
        }

        // Backend has no "all applications" endpoint (see
        // backend/src/routes/applicationRoutes.ts) — compose the existing
        // per-job endpoint across every job already fetched above, the
        // same approach lib/applicationsApi.ts uses, just reusing the
        // jobs list we already have instead of re-fetching it.
        const perJob = await Promise.all(
          jobs.map((job) =>
            fetchApplicationsForJob(job._id)
              .then((res) =>
                res.applications.map(
                  (ranked): ApplicationWithJob => ({ application: ranked.application, job })
                )
              )
              .catch(() => [] as ApplicationWithJob[])
          )
        );

        if (cancelled) return;
        setData({
          jobs,
          candidates: candidatesRes.candidates,
          resumeCounts,
          appsWithJob: perJob.flat(),
        });
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof ApiError ? err.message : "Unable to load dashboard data.");
        setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  // Applications can be submitted from another tab/page (resume upload,
  // bulk apply) while the Dashboard stays mounted in the background.
  // Re-fetch whenever the user comes back to this tab/page instead of
  // relying solely on the mount-time fetch above, so the activity chart
  // doesn't show stale counts. Event-driven, not polling.
  useEffect(() => {
    function refetchOnReturn() {
      if (document.visibilityState === "visible") {
        setReloadToken((t) => t + 1);
      }
    }
    document.addEventListener("visibilitychange", refetchOnReturn);
    window.addEventListener("focus", refetchOnReturn);
    return () => {
      document.removeEventListener("visibilitychange", refetchOnReturn);
      window.removeEventListener("focus", refetchOnReturn);
    };
  }, []);

  const jobs = useMemo(() => data?.jobs ?? [], [data]);
  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  const appsWithJob = useMemo(() => data?.appsWithJob ?? [], [data]);

  const resumeCountByJob = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of data?.resumeCounts ?? []) map.set(row.jobId, row.totalResumes);
    return map;
  }, [data]);

  const appCountByJob = useMemo(() => {
    const map = new Map<string, number>();
    for (const { job } of appsWithJob) map.set(job._id, (map.get(job._id) ?? 0) + 1);
    return map;
  }, [appsWithJob]);

  const pipelineCounts = useMemo(() => {
    const counts: Record<ApplicationStatus, number> = { APPLIED: 0, SHORTLISTED: 0, REJECTED: 0 };
    for (const { application } of appsWithJob) counts[application.status] += 1;
    return counts;
  }, [appsWithJob]);

  const openJobsCount = useMemo(() => jobs.filter((j) => j.status === "OPEN").length, [jobs]);

  const analyzedApps = useMemo(
    () => appsWithJob.filter((a) => a.application.aiAnalysis),
    [appsWithJob]
  );

  const aiInsights = useMemo(() => {
    if (analyzedApps.length === 0) {
      return { analyzedCount: 0, averageScore: null as number | null, needsReview: 0, top: null };
    }
    const scores = analyzedApps.map((a) => a.application.aiAnalysis!.overallMatchScore);
    const needsReview = analyzedApps.filter(
      (a) => !a.application.aiAnalysis!.mustHaveEvaluation.met || a.application.aiAnalysis!.redFlags.length > 0
    ).length;
    const top = analyzedApps.reduce<{ application: Application; job: Job } | null>((best, a) => {
      if (!best || a.application.aiAnalysis!.overallMatchScore > best.application.aiAnalysis!.overallMatchScore) {
        return a;
      }
      return best;
    }, null);
    return {
      analyzedCount: analyzedApps.length,
      averageScore: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
      needsReview,
      top,
    };
  }, [analyzedApps]);

  const dailySeries = useMemo(() => buildDailySeries(appsWithJob, 14), [appsWithJob]);
  const activity = useMemo(() => buildActivity(jobs, appsWithJob), [jobs, appsWithJob]);

  const recentJobs = useMemo(
    () => [...jobs].sort((a, b) => safeTime(b.createdAt) - safeTime(a.createdAt)).slice(0, 5),
    [jobs]
  );

  const recentApplications = useMemo(
    () =>
      [...appsWithJob]
        .sort((a, b) => safeTime(b.application.createdAt) - safeTime(a.application.createdAt))
        .slice(0, 6),
    [appsWithJob]
  );

  const isEmpty = jobs.length === 0 && candidates.length === 0 && appsWithJob.length === 0;

  const topCandidateName = aiInsights.top
    ? isPopulatedCandidate(aiInsights.top.application.candidateId)
      ? aiInsights.top.application.candidateId.name
      : "Top candidate"
    : null;

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-subtitle">
            Here&apos;s what&apos;s happening across your recruitment pipeline.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Button variant="ghost" onClick={() => navigate("/resume-upload")}>
            Upload Resumes
          </Button>
          <Button onClick={() => navigate("/jobs/create")}>+ Create Job</Button>
        </div>
      </div>

      {status === "loading" && (
        <div className="dashboard-stats-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="dashboard-card skeleton-card" key={i} />
          ))}
        </div>
      )}

      {status === "error" && (
        <div className="dashboard-state dashboard-state-error">
          <p>{errorMessage}</p>
          <Button variant="ghost" onClick={() => setReloadToken((t) => t + 1)}>
            Retry
          </Button>
        </div>
      )}

      {status === "ready" && isEmpty && (
        <div className="dashboard-empty">
          <p>No data available yet.</p>
          <Button onClick={() => navigate("/jobs/create")}>Create your first job</Button>
        </div>
      )}

      {status === "ready" && !isEmpty && (
        <>
          <div className="dashboard-stats-grid">
            <div className="dashboard-card dashboard-stat">
              <span className="dashboard-label">Total Jobs</span>
              <span className="dashboard-value">{jobs.length}</span>
              <span className="dashboard-hint">
                {openJobsCount} open · {jobs.length - openJobsCount} closed
              </span>
            </div>
            <div className="dashboard-card dashboard-stat">
              <span className="dashboard-label">Total Candidates</span>
              <span className="dashboard-value">{candidates.length}</span>
            </div>
            <div className="dashboard-card dashboard-stat">
              <span className="dashboard-label">Total Applications</span>
              <span className="dashboard-value">{appsWithJob.length}</span>
              <span className="dashboard-hint">{pipelineCounts.APPLIED} awaiting review</span>
            </div>
            <div className="dashboard-card dashboard-stat dashboard-stat-accent-success">
              <span className="dashboard-label">Shortlisted</span>
              <span className="dashboard-value">{pipelineCounts.SHORTLISTED}</span>
              <span className="dashboard-hint">
                {appsWithJob.length > 0
                  ? `${Math.round((pipelineCounts.SHORTLISTED / appsWithJob.length) * 100)}% of applications`
                  : "—"}
              </span>
            </div>
          </div>

          <div className="dashboard-columns">
            <section className="dashboard-card dashboard-panel">
              <h2>Recruitment Activity</h2>
              <p className="dashboard-panel-subtitle">Applications received in the last 14 days</p>
              {appsWithJob.length === 0 ? (
                <p className="dashboard-empty-note">Not enough historical data available.</p>
              ) : (
                <ActivityChart data={dailySeries} />
              )}
            </section>

            <section className="dashboard-card dashboard-panel">
              <h2>Recruitment Pipeline</h2>
              <p className="dashboard-panel-subtitle">Applications by status</p>
              {appsWithJob.length === 0 ? (
                <p className="dashboard-empty-note">No applications yet.</p>
              ) : (
                <div className="pipeline-list">
                  {PIPELINE_STATUSES.map((s) => {
                    const count = pipelineCounts[s];
                    const pct = appsWithJob.length > 0 ? Math.round((count / appsWithJob.length) * 100) : 0;
                    return (
                      <div className="pipeline-row" key={s}>
                        <div className="pipeline-row-top">
                          <span className={`app-status-badge app-status-${s.toLowerCase()}`}>{s}</span>
                          <span className="pipeline-count">{count}</span>
                        </div>
                        <div className="pipeline-bar-track">
                          <div
                            className={`pipeline-bar-fill pipeline-bar-${s.toLowerCase()}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="dashboard-columns">
            <section className="dashboard-card dashboard-panel">
              <div className="dashboard-card-header">
                <h2>Recent Jobs</h2>
                <Button variant="ghost" onClick={() => navigate("/jobs")}>
                  View all
                </Button>
              </div>
              {recentJobs.length === 0 ? (
                <p className="dashboard-empty-note">No jobs yet.</p>
              ) : (
                <ul className="dashboard-list">
                  {recentJobs.map((job) => {
                    const appCount = appCountByJob.get(job._id) ?? 0;
                    const resumeCount = resumeCountByJob.get(job._id) ?? 0;
                    return (
                      <li className="dashboard-list-row" key={job._id}>
                        <div className="dashboard-list-main">
                          <span className="dashboard-list-title">{job.title}</span>
                          <span className="dashboard-list-meta">
                            {appCount} applicant{appCount === 1 ? "" : "s"} · {resumeCount} in pool ·{" "}
                            {formatRelativeTime(job.createdAt)}
                          </span>
                        </div>
                        <span className={`status-badge status-${job.status.toLowerCase()}`}>
                          {job.status}
                        </span>
                        <Button variant="ghost" onClick={() => navigate(`/jobs/${job._id}`)}>
                          View
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="dashboard-card dashboard-panel">
              <h2>Recent Activity</h2>
              {activity.length === 0 ? (
                <p className="dashboard-empty-note">No recent activity yet.</p>
              ) : (
                <ul className="activity-list">
                  {activity.map((item) => (
                    <li className="activity-row" key={item.id}>
                      <span className={`activity-dot activity-dot-${item.tone}`} />
                      <div className="activity-body">
                        <span className="activity-text">{item.text}</span>
                        <span className="activity-time">{formatRelativeTime(item.timestamp)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="dashboard-card dashboard-panel">
            <div className="dashboard-card-header">
              <h2>Recent Applications</h2>
              <Button variant="ghost" onClick={() => navigate("/applications")}>
                View all
              </Button>
            </div>
            {recentApplications.length === 0 ? (
              <p className="dashboard-empty-note">No applications yet.</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Job</th>
                      <th>AI Score</th>
                      <th>Status</th>
                      <th>Applied</th>
                      <th className="col-actions">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentApplications.map(({ application, job }) => {
                      const candidate = isPopulatedCandidate(application.candidateId)
                        ? application.candidateId
                        : null;
                      const score = application.aiAnalysis?.overallMatchScore ?? null;
                      return (
                        <tr key={application._id}>
                          <td data-label="Candidate">
                            <div className="candidate-cell">
                              <span className="candidate-name">
                                {candidate?.name ?? "Unknown candidate"}
                              </span>
                              {candidate?.email && (
                                <span className="candidate-email">{candidate.email}</span>
                              )}
                            </div>
                          </td>
                          <td data-label="Job">{job.title}</td>
                          <td data-label="AI Score">
                            {score !== null ? (
                              <div
                                className={`score-ring ${scoreClass(score)}`}
                                style={{
                                  background: `conic-gradient(currentColor ${score * 3.6}deg, var(--color-border) 0deg)`,
                                }}
                              >
                                <span className="score-ring-value">{score}%</span>
                              </div>
                            ) : (
                              <span className="dashboard-muted">Not analyzed</span>
                            )}
                          </td>
                          <td data-label="Status">
                            <span
                              className={`app-status-badge app-status-${application.status.toLowerCase()}`}
                            >
                              {application.status}
                            </span>
                          </td>
                          <td data-label="Applied">{formatRelativeTime(application.createdAt)}</td>
                          <td data-label="Action" className="col-actions">
                            <Button
                              variant="ghost"
                              onClick={() => navigate(`/applications/${application._id}`)}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="dashboard-card dashboard-panel">
            <h2>AI Insights</h2>
            {aiInsights.analyzedCount === 0 ? (
              <p className="dashboard-empty-note">No AI analysis available yet.</p>
            ) : (
              <div className="ai-insights-grid">
                <div className="ai-insight-tile">
                  <span className="dashboard-label">Candidates Analyzed</span>
                  <span className="dashboard-value">{aiInsights.analyzedCount}</span>
                </div>
                <div className="ai-insight-tile">
                  <span className="dashboard-label">Average Match Score</span>
                  <span className="dashboard-value">
                    {aiInsights.averageScore !== null ? `${aiInsights.averageScore}%` : "—"}
                  </span>
                </div>
                <div className="ai-insight-tile">
                  <span className="dashboard-label">Needs Review</span>
                  <span className="dashboard-value">{aiInsights.needsReview}</span>
                </div>
                <div className="ai-insight-tile ai-insight-tile-wide">
                  <span className="dashboard-label">Top Candidate</span>
                  {aiInsights.top ? (
                    <p className="ai-insight-text">
                      <strong>{topCandidateName}</strong> leads with a{" "}
                      {aiInsights.top.application.aiAnalysis!.overallMatchScore}% match for{" "}
                      {aiInsights.top.job.title}.
                    </p>
                  ) : (
                    <p className="ai-insight-text">Not available</p>
                  )}
                </div>
              </div>
            )}
          </section>
        </>
      )}

      <section className="dashboard-quick-actions">
        <h2>Quick Actions</h2>
        <div className="quick-actions-grid">
          <button className="quick-action-card" onClick={() => navigate("/jobs/create")}>
            <span className="quick-action-title">Create Job</span>
            <span className="quick-action-desc">Post a new open position</span>
          </button>
          <button className="quick-action-card" onClick={() => navigate("/resume-upload")}>
            <span className="quick-action-title">Upload Resumes</span>
            <span className="quick-action-desc">Add resumes to a job&apos;s pool</span>
          </button>
          <button className="quick-action-card" onClick={() => navigate("/candidates")}>
            <span className="quick-action-title">View Candidates</span>
            <span className="quick-action-desc">Browse every candidate</span>
          </button>
          <button className="quick-action-card" onClick={() => navigate("/applications")}>
            <span className="quick-action-title">View Applications</span>
            <span className="quick-action-desc">Track applications by status</span>
          </button>
          <button className="quick-action-card" onClick={() => navigate("/ai-analysis")}>
            <span className="quick-action-title">AI Matching</span>
            <span className="quick-action-desc">Review AI-ranked candidates per job</span>
          </button>
        </div>
      </section>
    </div>
  );
}
