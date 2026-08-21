import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Button from "../components/Button";
import { fetchApplicationsForJob, fetchJobs } from "../lib/jobsApi";
import { bulkApplyToJob, fetchResumesForJob, uploadResumesForJob } from "../lib/resumePoolApi";
import { ApiError } from "../types/auth";
import type { Job } from "../types/job";
import type { PooledResume } from "../types/resumePool";
import "./ResumeUploadPage.css";

// Everything the table + search need for one resume in the pool, resolved
// from GET /api/resumes?jobId=... (candidateId populated) and cross-checked
// against GET /api/applications?jobId=... for "already applied" state.
interface PoolRow {
  rank: number;
  resume: PooledResume;
  candidate: PooledResume["candidateId"];
  applied: boolean;
}

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
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

export default function ResumeUploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState("");

  const [resumesData, setResumesData] = useState<
    { rank: number; resume: PooledResume }[] | null
  >(null);
  const [resumesError, setResumesError] = useState<string | null>(null);

  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<Awaited<
    ReturnType<typeof uploadResumesForJob>
  > | null>(null);

  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<Awaited<
    ReturnType<typeof bulkApplyToJob>
  > | null>(null);

  const [viewResume, setViewResume] = useState<PooledResume | null>(null);

  // Load jobs once, from the real Job API — the dropdown never hardcodes titles.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setJobsError(null);
      try {
        const res = await fetchJobs();
        if (!cancelled) setJobs(res.jobs);
      } catch (err) {
        if (!cancelled) {
          setJobsError(err instanceof ApiError ? err.message : "Unable to load jobs.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Every time the selected job changes, reload that job's resume pool and
  // its existing applications, and reset anything scoped to the old job.
  useEffect(() => {
    setSelectedIds(new Set());
    setUploadResult(null);
    setUploadError(null);
    setApplyResult(null);
    setApplyError(null);

    if (!selectedJobId) {
      setResumesData(null);
      setResumesError(null);
      setAppliedIds(new Set());
      return;
    }

    let cancelled = false;
    setResumesData(null);
    setResumesError(null);

    async function load() {
      try {
        const res = await fetchResumesForJob(selectedJobId);
        if (!cancelled) setResumesData(res.resumes);
      } catch (err) {
        if (!cancelled) {
          setResumesError(
            err instanceof ApiError ? err.message : "Unable to load resumes for this job."
          );
        }
      }

      try {
        const res = await fetchApplicationsForJob(selectedJobId);
        if (cancelled) return;
        const ids = new Set(
          res.applications.map(({ application }) =>
            typeof application.candidateId === "object"
              ? application.candidateId._id
              : application.candidateId
          )
        );
        setAppliedIds(ids);
      } catch {
        if (!cancelled) setAppliedIds(new Set());
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedJobId]);

  async function refreshResumes() {
    try {
      const res = await fetchResumesForJob(selectedJobId);
      setResumesData(res.resumes);
    } catch {
      // Pool stays as-is; the upload/apply banner already surfaces the error.
    }
  }

  async function refreshApplications() {
    try {
      const res = await fetchApplicationsForJob(selectedJobId);
      const ids = new Set(
        res.applications.map(({ application }) =>
          typeof application.candidateId === "object"
            ? application.candidateId._id
            : application.candidateId
        )
      );
      setAppliedIds(ids);
    } catch {
      // Applied badges just won't refresh this round.
    }
  }

  const rows = useMemo<PoolRow[]>(() => {
    return (resumesData ?? [])
      .filter(({ resume }) => Boolean(resume.candidateId))
      .map(({ rank, resume }) => ({
        rank,
        resume,
        candidate: resume.candidateId,
        applied: appliedIds.has(resume.candidateId._id),
      }));
  }, [resumesData, appliedIds]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) => {
      const filename = fileNameFromPath(row.resume.filePath).toLowerCase();
      return (
        row.candidate.name?.toLowerCase().includes(query) ||
        row.candidate.email?.toLowerCase().includes(query) ||
        row.candidate.candidateRef?.toLowerCase().includes(query) ||
        filename.includes(query)
      );
    });
  }, [rows, search]);

  const candidateNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.candidate._id, row.candidate.name);
    return map;
  }, [rows]);

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    e.target.value = "";
    if (!files || files.length === 0 || !selectedJobId) return;
    void handleUpload(Array.from(files));
  }

  async function handleUpload(files: File[]) {
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadResumesForJob(selectedJobId, files);
      setUploadResult(result);
      await refreshResumes();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Failed to upload resumes.");
    } finally {
      setUploading(false);
    }
  }

  async function handleApplyOne(candidateId: string) {
    setApplyingIds((prev) => new Set(prev).add(candidateId));
    setApplyError(null);
    try {
      const result = await bulkApplyToJob(selectedJobId, [candidateId]);
      setApplyResult(result);
      await refreshApplications();
    } catch (err) {
      setApplyError(err instanceof ApiError ? err.message : "Failed to apply candidate.");
    } finally {
      setApplyingIds((prev) => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  }

  async function handleApplySelected() {
    if (selectedIds.size === 0) return;
    setBulkApplying(true);
    setApplyError(null);
    try {
      const result = await bulkApplyToJob(selectedJobId, Array.from(selectedIds));
      setApplyResult(result);
      setSelectedIds(new Set());
      await refreshApplications();
    } catch (err) {
      setApplyError(err instanceof ApiError ? err.message : "Failed to apply selected candidates.");
    } finally {
      setBulkApplying(false);
    }
  }

  function toggleSelect(candidateId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedIds(new Set(filteredRows.filter((row) => !row.applied).map((row) => row.candidate._id)));
  }

  function handleClearSelection() {
    setSelectedIds(new Set());
  }

  return (
    <div className="resume-upload-page">
      <div className="resume-upload-header">
        <h1>Resume Upload</h1>
        <p className="resume-upload-subtitle">Upload, review, analyze, and apply candidates to jobs.</p>
      </div>

      <div className="resume-upload-job-row">
        <div className="resume-upload-job-selector">
          <label className="field-label" htmlFor="resume-job-select">
            Job Role
          </label>
          <select
            id="resume-job-select"
            className="resume-upload-select"
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            disabled={jobs === null}
          >
            <option value="">{jobs === null ? "Loading jobs..." : "Select Job"}</option>
            {jobs?.map((job) => (
              <option key={job._id} value={job._id}>
                {job.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {jobsError && <p className="resume-upload-state resume-upload-state-error">{jobsError}</p>}

      {!selectedJobId && !jobsError && (
        <p className="resume-upload-state">Select a job to view or upload resumes.</p>
      )}

      {selectedJobId && (
        <>
          <div className="resume-upload-toolbar">
            <input
              className="resume-upload-search"
              type="text"
              placeholder="Search candidate or resume..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFilesSelected}
              className="resume-upload-file-input"
            />
            <Button onClick={() => fileInputRef.current?.click()} isLoading={uploading}>
              {uploading ? "Uploading & analyzing..." : "+ Upload Resumes"}
            </Button>
          </div>

          {uploadError && <p className="resume-upload-state resume-upload-state-error">{uploadError}</p>}

          {uploadResult && (
            <div className="resume-upload-banner">
              <div className="resume-upload-banner-header">
                <strong>{uploadResult.message}</strong>
                <button
                  type="button"
                  className="resume-upload-banner-dismiss"
                  onClick={() => setUploadResult(null)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
              <ul className="resume-upload-banner-list">
                {uploadResult.candidates.map((item, index) => (
                  <li key={`${item.fileName}-${index}`}>
                    <span className="resume-upload-banner-file">{item.fileName}</span>
                    {item.error ? (
                      <span className="resume-upload-tag tag-failed">{item.error}</span>
                    ) : (
                      <>
                        <span>{item.candidate?.name ?? "Unknown candidate"}</span>
                        <span
                          className={`resume-upload-tag ${
                            item.status === "DUPLICATE" ? "tag-duplicate" : "tag-created"
                          }`}
                        >
                          {item.status === "DUPLICATE" ? "Already in pool" : "Added to pool"}
                        </span>
                        {typeof item.aiAnalysis?.overallMatchScore === "number" && (
                          <span className="resume-upload-tag tag-score">
                            {item.aiAnalysis.overallMatchScore}% match
                          </span>
                        )}
                        {item.matching?.status === "REVIEW" && (
                          <span className="resume-upload-tag tag-duplicate">Possible duplicate</span>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {applyError && <p className="resume-upload-state resume-upload-state-error">{applyError}</p>}

          {applyResult && (
            <div className="resume-upload-banner">
              <div className="resume-upload-banner-header">
                <strong>Application result</strong>
                <button
                  type="button"
                  className="resume-upload-banner-dismiss"
                  onClick={() => setApplyResult(null)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>

              {applyResult.created.length > 0 && (
                <p className="resume-upload-banner-row">
                  <span className="resume-upload-tag tag-created">Created</span>
                  {applyResult.created
                    .map((c) => candidateNameById.get(c.candidateId) ?? c.candidateId)
                    .join(", ")}
                </p>
              )}

              {applyResult.skipped.length > 0 && (
                <p className="resume-upload-banner-row">
                  <span className="resume-upload-tag tag-duplicate">Skipped</span>
                  {applyResult.skipped
                    .map((s) => `${candidateNameById.get(s.candidateId) ?? s.candidateId} — ${s.reason}`)
                    .join("; ")}
                </p>
              )}

              {applyResult.failed.length > 0 && (
                <p className="resume-upload-banner-row">
                  <span className="resume-upload-tag tag-failed">Failed</span>
                  {applyResult.failed
                    .map((f) => `${candidateNameById.get(f.candidateId) ?? f.candidateId} — ${f.reason}`)
                    .join("; ")}
                </p>
              )}
            </div>
          )}

          {resumesData === null && !resumesError && (
            <p className="resume-upload-state">Loading candidates...</p>
          )}
          {resumesError && <p className="resume-upload-state resume-upload-state-error">{resumesError}</p>}
          {resumesData !== null && !resumesError && resumesData.length === 0 && (
            <p className="resume-upload-state">No resumes uploaded yet.</p>
          )}
          {resumesData !== null &&
            !resumesError &&
            resumesData.length > 0 &&
            filteredRows.length === 0 && <p className="resume-upload-state">No candidates found.</p>}

          {filteredRows.length > 0 && (
            <div className="resume-pool-section">
              <div className="resume-pool-bulk-actions">
                <button type="button" className="link-button" onClick={handleSelectAll}>
                  Select All
                </button>
                <button type="button" className="link-button" onClick={handleClearSelection}>
                  Clear Selection
                </button>
              </div>

              <div className="resume-pool-table-wrap">
              <table className="resume-pool-table">
                <thead>
                  <tr>
                    <th className="col-checkbox" />
                    <th>Candidate</th>
                    <th>Resume</th>
                    <th>Experience</th>
                    <th>AI Score</th>
                    <th>Status</th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.resume._id}>
                      <td data-label="" className="col-checkbox">
                        <input
                          type="checkbox"
                          disabled={row.applied}
                          checked={selectedIds.has(row.candidate._id)}
                          onChange={() => toggleSelect(row.candidate._id)}
                          aria-label={`Select ${row.candidate.name}`}
                        />
                      </td>

                      <td data-label="Candidate">
                        <div className="candidate-cell">
                          <span className="candidate-name">{row.candidate.name}</span>
                          {row.candidate.email && (
                            <span className="candidate-email">{row.candidate.email}</span>
                          )}
                          {row.candidate.candidateRef && (
                            <span className="candidate-ref">{row.candidate.candidateRef}</span>
                          )}
                          {row.candidate.possibleDuplicateOf &&
                            row.candidate.possibleDuplicateOf.length > 0 && (
                              <span className="resume-upload-tag tag-duplicate">Possible duplicate</span>
                            )}
                        </div>
                      </td>

                      <td data-label="Resume">{fileNameFromPath(row.resume.filePath)}</td>

                      <td data-label="Experience">
                        {typeof row.candidate.totalExperienceYears === "number"
                          ? `${row.candidate.totalExperienceYears} yrs`
                          : "Not available"}
                      </td>

                      <td data-label="AI Score">
                        {typeof row.resume.aiAnalysis?.overallMatchScore === "number" ? (
                          <div
                            className={`score-ring ${scoreClass(row.resume.aiAnalysis.overallMatchScore)}`}
                            style={{
                              background: `conic-gradient(currentColor ${
                                row.resume.aiAnalysis.overallMatchScore * 3.6
                              }deg, var(--color-border) 0deg)`,
                            }}
                          >
                            <span className="score-ring-value">
                              {row.resume.aiAnalysis.overallMatchScore}%
                            </span>
                          </div>
                        ) : (
                          <span className="resume-upload-muted">AI analysis not available</span>
                        )}
                      </td>

                      <td data-label="Status">
                        {row.applied ? (
                          <span className="app-status-badge app-status-applied">Applied</span>
                        ) : (
                          <span className="resume-upload-muted">Not applied</span>
                        )}
                      </td>

                      <td data-label="Actions" className="col-actions">
                        <div className="resume-pool-row-actions">
                          <Button variant="ghost" onClick={() => setViewResume(row.resume)}>
                            View Resume
                          </Button>
                          {row.applied ? (
                            <Button variant="ghost" disabled>
                              Applied
                            </Button>
                          ) : (
                            <Button
                              isLoading={applyingIds.has(row.candidate._id)}
                              onClick={() => handleApplyOne(row.candidate._id)}
                            >
                              Apply
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}

      {selectedIds.size > 0 && (
        <div className="resume-pool-sticky-bar">
          <span>
            {selectedIds.size} candidate{selectedIds.size === 1 ? "" : "s"} selected
          </span>
          <div className="resume-pool-sticky-actions">
            <button type="button" className="link-button link-button-inverse" onClick={handleClearSelection}>
              Clear Selection
            </button>
            <Button isLoading={bulkApplying} onClick={handleApplySelected}>
              Apply Selected
            </Button>
          </div>
        </div>
      )}

      {viewResume && (
        <div className="resume-modal-overlay" onClick={() => setViewResume(null)}>
          <div className="resume-modal" onClick={(e) => e.stopPropagation()}>
            <div className="resume-modal-header">
              <h2>{viewResume.candidateId.name}</h2>
              <button
                type="button"
                className="resume-upload-banner-dismiss"
                onClick={() => setViewResume(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="resume-modal-body">
              <section className="resume-modal-section">
                <h3>Candidate</h3>
                <div className="candidate-details-grid">
                  <div>
                    <span className="candidate-details-label">Reference</span>
                    <span>{viewResume.candidateId.candidateRef || "Not available"}</span>
                  </div>
                  <div>
                    <span className="candidate-details-label">Email</span>
                    <span>{viewResume.candidateId.email || "Not available"}</span>
                  </div>
                  <div>
                    <span className="candidate-details-label">Phone</span>
                    <span>{viewResume.candidateId.phone || "Not available"}</span>
                  </div>
                  <div>
                    <span className="candidate-details-label">Experience</span>
                    <span>
                      {typeof viewResume.candidateId.totalExperienceYears === "number"
                        ? `${viewResume.candidateId.totalExperienceYears} yrs`
                        : "Not available"}
                    </span>
                  </div>
                  <div>
                    <span className="candidate-details-label">LinkedIn</span>
                    {viewResume.candidateId.linkedinUrl ? (
                      <a href={viewResume.candidateId.linkedinUrl} target="_blank" rel="noreferrer">
                        {viewResume.candidateId.linkedinUrl}
                      </a>
                    ) : (
                      <span>Not available</span>
                    )}
                  </div>
                  <div>
                    <span className="candidate-details-label">GitHub</span>
                    {viewResume.candidateId.githubUrl ? (
                      <a href={viewResume.candidateId.githubUrl} target="_blank" rel="noreferrer">
                        {viewResume.candidateId.githubUrl}
                      </a>
                    ) : (
                      <span>Not available</span>
                    )}
                  </div>
                </div>
              </section>

              <section className="resume-modal-section">
                <h3>Resume File</h3>
                <div className="candidate-details-grid">
                  <div>
                    <span className="candidate-details-label">Filename</span>
                    <span>{fileNameFromPath(viewResume.filePath)}</span>
                  </div>
                  <div>
                    <span className="candidate-details-label">Uploaded</span>
                    <span>{viewResume.createdAt ? formatDate(viewResume.createdAt) : "Not available"}</span>
                  </div>
                </div>
                <p className="resume-modal-note">
                  This backend does not currently serve resume files for browser preview — showing the
                  extracted resume text below instead.
                </p>
                <pre className="resume-modal-text">{viewResume.resumeText || "Not available"}</pre>
              </section>

              <section className="resume-modal-section">
                <h3>AI Analysis</h3>
                {viewResume.aiAnalysis ? (
                  <div className="resume-modal-analysis">
                    <div className="resume-modal-score">
                      <span className="score-value">{viewResume.aiAnalysis.overallMatchScore}%</span>
                      <span className="score-label">Overall Match</span>
                    </div>

                    {viewResume.aiAnalysis.executiveSummary && (
                      <p className="candidate-analysis-summary">{viewResume.aiAnalysis.executiveSummary}</p>
                    )}

                    {viewResume.aiAnalysis.scoringRationale && (
                      <div className="candidate-skills-row">
                        <span className="candidate-details-label">Scoring rationale</span>
                        <p className="candidate-analysis-summary">{viewResume.aiAnalysis.scoringRationale}</p>
                      </div>
                    )}

                    {viewResume.aiAnalysis.mustHaveEvaluation && (
                      <div className="candidate-skills-row">
                        <span className="candidate-details-label">Must-have requirements</span>
                        <p className="candidate-analysis-summary">
                          {viewResume.aiAnalysis.mustHaveEvaluation.met ? "Met" : "Not met"} —{" "}
                          {viewResume.aiAnalysis.mustHaveEvaluation.reason}
                        </p>
                      </div>
                    )}

                    {viewResume.aiAnalysis.hardSkillsMatch?.found?.length > 0 && (
                      <div className="candidate-skills-row">
                        <span className="candidate-details-label">Skills found</span>
                        <div className="skill-chips">
                          {viewResume.aiAnalysis.hardSkillsMatch.found.map((skill) => (
                            <span className="skill-chip" key={skill}>
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {viewResume.aiAnalysis.hardSkillsMatch?.missing?.length > 0 && (
                      <div className="candidate-skills-row">
                        <span className="candidate-details-label">Skills missing</span>
                        <div className="skill-chips">
                          {viewResume.aiAnalysis.hardSkillsMatch.missing.map((skill) => (
                            <span className="skill-chip skill-chip-missing" key={skill}>
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {viewResume.aiAnalysis.redFlags?.length > 0 && (
                      <div className="candidate-skills-row">
                        <span className="candidate-details-label">Red flags</span>
                        <ul className="candidate-red-flags">
                          {viewResume.aiAnalysis.redFlags.map((flag) => (
                            <li key={flag}>{flag}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="resume-upload-state">AI analysis not available.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
