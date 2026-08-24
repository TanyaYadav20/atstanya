import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import Button from "../components/Button";
import { fetchApplicationsForJob, fetchJobs } from "../lib/jobsApi";
import { bulkApplyToJob, fetchResumesForJob, uploadResumesForJob } from "../lib/resumePoolApi";
import { ApiError } from "../types/auth";
import type { Job } from "../types/job";
import type { PooledResume, UploadResumesResponse } from "../types/resumePool";
import "./ResumeUploadPage.css";

type ViewMode = "JOB" | "ALL";

// Enterprise-style alert shown for file-selection/validation failures and
// upload/API failures — a short title, a human-readable explanation, and
// optionally a list of the specific files/reasons involved.
interface UploadAlert {
  title: string;
  description: string;
  details?: string[];
}

// Mirrors backend/src/middleware/upload.ts (fileFilter + limits.fileSize)
// and the upload.array("resumes", 20) cap in
// backend/src/routes/candidateRoutes.ts. The backend enforces these too,
// but a multer fileFilter/size rejection surfaces there only as a generic
// "Internal Server Error" (see backend/src/middleware/errorHandler.ts), so
// checking client-side first gives the user an actionable message instead.
const ALLOWED_RESUME_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx"];
const MAX_RESUME_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_RESUME_FILES_PER_UPLOAD = 20;
const MAX_RESUME_FILE_SIZE_MB = MAX_RESUME_FILE_SIZE_BYTES / (1024 * 1024);
const SUPPORTED_FORMATS_LABEL = ALLOWED_RESUME_EXTENSIONS.map((ext) => ext.slice(1).toUpperCase()).join(", ");

function getFileExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? "" : fileName.slice(index).toLowerCase();
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Checks a single file against the same rules the backend enforces
// (backend/src/middleware/upload.ts) — used when staging newly
// dropped/selected files so only valid ones ever reach the picker.
function validateResumeFile(file: File): string | null {
  if (!ALLOWED_RESUME_EXTENSIONS.includes(getFileExtension(file.name))) {
    return `Unsupported file type. Please upload ${SUPPORTED_FORMATS_LABEL}.`;
  }
  if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
    return `"${file.name}" is too large. Maximum allowed size is ${MAX_RESUME_FILE_SIZE_MB} MB.`;
  }
  return null;
}

// Partitions newly dropped/selected files into ones that can be staged and
// validation issues to surface, respecting how many slots are left before
// hitting MAX_RESUME_FILES_PER_UPLOAD for this batch.
function partitionIncomingFiles(
  newFiles: File[],
  alreadyStagedCount: number
): { valid: File[]; issues: string[] } {
  const availableSlots = MAX_RESUME_FILES_PER_UPLOAD - alreadyStagedCount;
  const issues: string[] = [];

  if (availableSlots <= 0) {
    return {
      valid: [],
      issues: [`You can upload a maximum of ${MAX_RESUME_FILES_PER_UPLOAD} files at a time.`],
    };
  }

  const overflowCount = Math.max(0, newFiles.length - availableSlots);
  const filesToCheck = overflowCount > 0 ? newFiles.slice(0, availableSlots) : newFiles;

  if (overflowCount > 0) {
    issues.push(
      `You can upload a maximum of ${MAX_RESUME_FILES_PER_UPLOAD} files at a time. ${overflowCount} file${
        overflowCount === 1 ? " was" : "s were"
      } not added.`
    );
  }

  const valid: File[] = [];
  for (const file of filesToCheck) {
    const issue = validateResumeFile(file);
    if (issue) issues.push(issue);
    else valid.push(file);
  }

  return { valid, issues };
}

// Translates a failed uploadResumesForJob() call into a user-facing alert.
// Prefers the backend's own message (e.g. "Job not found", "No token
// provided") whenever the request reached the server; falls back to a
// friendly message for network failures and anything unexpected.
function describeUploadError(err: unknown): UploadAlert {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return {
        title: "Authentication Required",
        description: err.message || "Your session has expired. Please sign in again.",
      };
    }

    if (err.status >= 500) {
      return {
        title: "Server Error",
        description:
          "The server ran into a problem processing your resumes. Please try again in a few moments.",
      };
    }

    return {
      title: "Resume Upload Failed",
      description: err.message || "The selected resumes could not be uploaded. Please try again.",
    };
  }

  if (err instanceof TypeError) {
    return {
      title: "Network Error",
      description: "Unable to reach the server. Please check your internet connection and try again.",
    };
  }

  return {
    title: "Unexpected Error",
    description: "Something went wrong while uploading your resumes. Please try again.",
  };
}

// Turns the raw counts on a successful upload response into the
// enterprise-style summary shown at the top of the results banner.
function summarizeUploadResult(result: UploadResumesResponse): { title: string; description: string } {
  const { totalFiles, processedFiles, failedFiles, candidates } = result;

  if (failedFiles === 0) {
    return {
      title: "Resumes Uploaded Successfully",
      description: `${processedFiles} resume${processedFiles === 1 ? "" : "s"} uploaded and analyzed.`,
    };
  }

  if (processedFiles === 0) {
    return {
      title: "Resume Upload Failed",
      description:
        totalFiles === 1
          ? `"${candidates[0]?.fileName ?? "The selected file"}" could not be processed. Please try again.`
          : `All ${totalFiles} resumes failed to process. Please try again.`,
    };
  }

  return {
    title: "Some Resumes Could Not Be Processed",
    description: `${processedFiles} resume${processedFiles === 1 ? "" : "s"} uploaded successfully. ${failedFiles} resume${
      failedFiles === 1 ? "" : "s"
    } failed to process.`,
  };
}

function uploadResultTone(result: UploadResumesResponse): "success" | "warning" | "danger" {
  if (result.failedFiles === 0) return "success";
  if (result.processedFiles === 0) return "danger";
  return "warning";
}

// Everything the table + search need for one resume in the pool, resolved
// from GET /api/resumes?jobId=... (candidateId populated) and cross-checked
// against GET /api/applications?jobId=... for "already applied" state.
interface PoolRow {
  rank: number;
  resume: PooledResume;
  candidate: PooledResume["candidateId"];
  applied: boolean;
}

// Same shape as PoolRow, plus the job it belongs to — used by the "All
// Resumes" view, which composes GET /api/resumes?jobId=... and
// GET /api/applications?jobId=... across every job (same approach
// DashboardPage.tsx already uses for a job-scoped-only application
// endpoint), since the backend has no cross-job resume listing endpoint.
interface AllPoolRow extends PoolRow {
  job: Job;
}

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function scoreClass(score: number): string {
  if (score >= 75) return "score-high";
  if (score >= 45) return "score-medium";
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
  const dragCounterRef = useRef(0);

  const [viewMode, setViewMode] = useState<ViewMode>("JOB");

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState("");

  const [allRows, setAllRows] = useState<AllPoolRow[] | null>(null);
  const [allError, setAllError] = useState<string | null>(null);
  const [allSearch, setAllSearch] = useState("");
  const [allApplyingIds, setAllApplyingIds] = useState<Set<string>>(new Set());

  const [resumesData, setResumesData] = useState<
    { rank: number; resume: PooledResume }[] | null
  >(null);
  const [resumesError, setResumesError] = useState<string | null>(null);

  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<UploadAlert | null>(null);
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
  const [viewFullscreen, setViewFullscreen] = useState(false);

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

  // "All Resumes" view: the backend has no cross-job resume listing
  // endpoint, so compose the existing per-job resume + applications
  // endpoints across every job — the same pattern DashboardPage.tsx
  // already uses for applications.
  async function loadAllResumes(jobList: Job[]) {
    setAllError(null);
    try {
      const perJob = await Promise.all(
        jobList.map((job) =>
          Promise.all([
            fetchResumesForJob(job._id),
            fetchApplicationsForJob(job._id).catch(() => ({ applications: [] })),
          ])
            .then(([resumesRes, appsRes]) => {
              const appliedIds = new Set(
                appsRes.applications.map(({ application }) =>
                  typeof application.candidateId === "object"
                    ? application.candidateId._id
                    : application.candidateId
                )
              );
              return resumesRes.resumes
                .filter(({ resume }) => Boolean(resume.candidateId))
                .map(
                  ({ rank, resume }): AllPoolRow => ({
                    rank,
                    resume,
                    candidate: resume.candidateId,
                    applied: appliedIds.has(resume.candidateId._id),
                    job,
                  })
                );
            })
            .catch(() => [] as AllPoolRow[])
        )
      );
      setAllRows(perJob.flat());
    } catch (err) {
      setAllError(err instanceof ApiError ? err.message : "Unable to load resumes.");
    }
  }

  useEffect(() => {
    if (viewMode !== "ALL" || !jobs) return;
    setAllRows(null);
    void loadAllResumes(jobs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, jobs]);

  // Every time the selected job changes, reload that job's resume pool and
  // its existing applications, and reset anything scoped to the old job.
  useEffect(() => {
    setSelectedIds(new Set());
    setPendingFiles([]);
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

  const uploadSummary = useMemo(
    () => (uploadResult ? summarizeUploadResult(uploadResult) : null),
    [uploadResult]
  );
  const uploadTone = useMemo(
    () => (uploadResult ? uploadResultTone(uploadResult) : null),
    [uploadResult]
  );

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

  const filteredAllRows = useMemo(() => {
    const query = allSearch.trim().toLowerCase();
    const source = allRows ?? [];
    if (!query) return source;

    return source.filter((row) => {
      const filename = fileNameFromPath(row.resume.filePath).toLowerCase();
      return (
        row.candidate.name?.toLowerCase().includes(query) ||
        row.candidate.email?.toLowerCase().includes(query) ||
        row.candidate.candidateRef?.toLowerCase().includes(query) ||
        row.job.title.toLowerCase().includes(query) ||
        filename.includes(query)
      );
    });
  }, [allRows, allSearch]);

  async function handleApplyOneAll(job: Job, candidateId: string) {
    setAllApplyingIds((prev) => new Set(prev).add(candidateId));
    setAllError(null);
    try {
      await bulkApplyToJob(job._id, [candidateId]);
      await loadAllResumes(jobs ?? []);
    } catch (err) {
      setAllError(err instanceof ApiError ? err.message : "Failed to apply candidate.");
    } finally {
      setAllApplyingIds((prev) => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  }

  const candidateNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.candidate._id, row.candidate.name);
    return map;
  }, [rows]);

  // Stages newly dropped/selected files onto the pending list — used by
  // both the file picker input and the drop zone's onDrop handler.
  function stageFiles(incomingFiles: File[]) {
    if (incomingFiles.length === 0) return;

    if (!selectedJobId) {
      setUploadError({
        title: "No Job Selected",
        description: "Please select a job before uploading resumes.",
      });
      return;
    }

    const { valid, issues } = partitionIncomingFiles(incomingFiles, pendingFiles.length);

    if (valid.length > 0) {
      setPendingFiles((prev) => [...prev, ...valid]);
    }

    if (issues.length > 0) {
      setUploadError({
        title: "Some Files Cannot Be Added",
        description: "Please review the following:",
        details: issues,
      });
    } else {
      setUploadError(null);
    }
  }

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    // The FileList behind e.target.files is live — it reflects the input's
    // current selection, so clearing the input's value also empties it.
    // Copy the files into a plain array first, before clearing the input.
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    stageFiles(selectedFiles);
  }

  function handleDropzoneClick() {
    if (uploading) return;
    fileInputRef.current?.click();
  }

  function handleDropzoneKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleDropzoneClick();
    }
  }

  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (uploading) return;
    stageFiles(Array.from(e.dataTransfer.files));
  }

  function removeStagedFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUploadClick() {
    if (uploading || pendingFiles.length === 0) return;
    void handleUpload(pendingFiles);
  }

  async function handleUpload(files: File[]) {
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const result = await uploadResumesForJob(selectedJobId, files);
      setUploadResult(result);
      setPendingFiles([]);
      await refreshResumes();
    } catch (err) {
      setUploadError(describeUploadError(err));
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

      <div className="resume-view-toggle" role="tablist" aria-label="Resume view">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "ALL"}
          className={`resume-view-toggle-btn${viewMode === "ALL" ? " resume-view-toggle-btn-active" : ""}`}
          onClick={() => setViewMode("ALL")}
        >
          All Resumes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "JOB"}
          className={`resume-view-toggle-btn${viewMode === "JOB" ? " resume-view-toggle-btn-active" : ""}`}
          onClick={() => setViewMode("JOB")}
        >
          By Job
        </button>
      </div>

      {jobsError && <p className="resume-upload-state resume-upload-state-error">{jobsError}</p>}

      {viewMode === "ALL" && (
        <>
          <div className="resume-upload-toolbar">
            <input
              className="resume-upload-search"
              type="text"
              placeholder="Search candidate, job, or resume..."
              value={allSearch}
              onChange={(e) => setAllSearch(e.target.value)}
            />
          </div>

          {allError && <p className="resume-upload-state resume-upload-state-error">{allError}</p>}

          {allRows === null && !allError && (
            <p className="resume-upload-state">Loading resumes...</p>
          )}
          {allRows !== null && allRows.length === 0 && !allError && (
            <p className="resume-upload-state">No resumes uploaded yet.</p>
          )}
          {allRows !== null && allRows.length > 0 && filteredAllRows.length === 0 && (
            <p className="resume-upload-state">No candidates found.</p>
          )}

          {filteredAllRows.length > 0 && (
            <div className="resume-pool-section">
              <div className="resume-pool-table-wrap">
                <table className="resume-pool-table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Candidate</th>
                      <th>Resume</th>
                      <th>Experience</th>
                      <th>AI Score</th>
                      <th>Status</th>
                      <th className="col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAllRows.map((row) => (
                      <tr key={row.resume._id}>
                        <td data-label="Job">{row.job.title}</td>

                        <td data-label="Candidate">
                          <div className="candidate-cell">
                            <span className="candidate-name">{row.candidate.name}</span>
                            {row.candidate.email && (
                              <span className="candidate-email">{row.candidate.email}</span>
                            )}
                            {row.candidate.candidateRef && (
                              <span className="candidate-ref">{row.candidate.candidateRef}</span>
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
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setViewResume(row.resume);
                                setViewFullscreen(false);
                              }}
                            >
                              View Resume
                            </Button>
                            {row.applied ? (
                              <Button variant="ghost" disabled>
                                Applied
                              </Button>
                            ) : (
                              <Button
                                isLoading={allApplyingIds.has(row.candidate._id)}
                                onClick={() => handleApplyOneAll(row.job, row.candidate._id)}
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

      {viewMode === "JOB" && (
        <>
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
          </div>

          <div className="resume-dropzone-wrap">
            <div
              className={`resume-dropzone${isDragging ? " resume-dropzone-active" : ""}${
                uploading ? " resume-dropzone-disabled" : ""
              }`}
              onClick={handleDropzoneClick}
              onKeyDown={handleDropzoneKeyDown}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              aria-label="Drag and drop resumes, or click to browse files"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALLOWED_RESUME_EXTENSIONS.join(",")}
                onChange={handleFilesSelected}
                className="resume-upload-file-input"
              />
              <div className="resume-dropzone-icon" aria-hidden="true">
                ⬆
              </div>
              {pendingFiles.length > 0 && !isDragging ? (
                <>
                  <p className="resume-dropzone-title">
                    {pendingFiles.length} file{pendingFiles.length === 1 ? "" : "s"} selected
                  </p>
                  <p className="resume-dropzone-hint">Drop more files or click to browse</p>
                </>
              ) : (
                <>
                  <p className="resume-dropzone-title">
                    {isDragging ? "Drop Resumes Here" : "Drag & Drop Resumes Here"}
                  </p>
                  <p className="resume-dropzone-hint">or click to browse</p>
                </>
              )}
            </div>

            <p className="resume-dropzone-support">
              Supported formats: {SUPPORTED_FORMATS_LABEL}
              <br />
              Maximum file size: {MAX_RESUME_FILE_SIZE_MB} MB · Maximum files: {MAX_RESUME_FILES_PER_UPLOAD}
            </p>

            {pendingFiles.length > 0 && (
              <div className="resume-file-list">
                <div className="resume-file-list-header">
                  <span>Resume Files</span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setPendingFiles([])}
                    disabled={uploading}
                  >
                    Clear All
                  </button>
                </div>

                <ul className="resume-file-list-items">
                  {pendingFiles.map((file, index) => (
                    <li key={`${file.name}-${file.size}-${index}`} className="resume-file-row">
                      <span className="resume-file-check" aria-hidden="true">
                        ✓
                      </span>
                      <div className="resume-file-meta">
                        <span className="resume-file-name">{file.name}</span>
                        <span className="resume-file-details">
                          {formatFileSize(file.size)} · {getFileExtension(file.name).slice(1).toUpperCase()}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="resume-file-remove"
                        onClick={() => removeStagedFile(index)}
                        disabled={uploading}
                        aria-label={`Remove ${file.name}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>

                <Button onClick={handleUploadClick} isLoading={uploading} disabled={pendingFiles.length === 0}>
                  {uploading ? "Uploading & analyzing..." : "Upload Resumes"}
                </Button>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="resume-upload-banner resume-upload-banner-danger" role="alert">
              <div className="resume-upload-banner-header">
                <strong>{uploadError.title}</strong>
                <button
                  type="button"
                  className="resume-upload-banner-dismiss"
                  onClick={() => setUploadError(null)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
              <p className="resume-upload-banner-description">{uploadError.description}</p>
              {uploadError.details && uploadError.details.length > 0 && (
                <ul className="resume-upload-banner-list">
                  {uploadError.details.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {uploadResult && uploadSummary && (
            <div className={`resume-upload-banner resume-upload-banner-${uploadTone}`}>
              <div className="resume-upload-banner-header">
                <strong>{uploadSummary.title}</strong>
                <button
                  type="button"
                  className="resume-upload-banner-dismiss"
                  onClick={() => setUploadResult(null)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
              <p className="resume-upload-banner-description">{uploadSummary.description}</p>
              <ul className="resume-upload-banner-list">
                {uploadResult.candidates.map((item, index) => (
                  <li key={`${item.fileName}-${index}`}>
                    <span className="resume-upload-banner-file">{item.fileName}</span>
                    {item.error ? (
                      <span className="resume-upload-error-text">{item.error}</span>
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
                          <span
                            className={`resume-upload-tag tag-score ${scoreClass(
                              item.aiAnalysis.overallMatchScore,
                            )}`}
                          >
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
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setViewResume(row.resume);
                              setViewFullscreen(false);
                            }}
                          >
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
        </>
      )}

      {viewResume && (
        <div
          className={`resume-modal-overlay${viewFullscreen ? " resume-modal-overlay-fullscreen" : ""}`}
          onClick={() => setViewResume(null)}
        >
          <div
            className={`resume-modal${viewFullscreen ? " resume-modal-fullscreen" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="resume-modal-header">
              <h2>{viewResume.candidateId.name}</h2>
              <div className="resume-modal-header-actions">
                <button
                  type="button"
                  className="resume-upload-banner-dismiss"
                  onClick={() => setViewFullscreen((prev) => !prev)}
                  aria-label={viewFullscreen ? "Exit full screen" : "View full screen"}
                  title={viewFullscreen ? "Exit full screen" : "View full screen"}
                >
                  {viewFullscreen ? "⤡" : "⤢"}
                </button>
                <button
                  type="button"
                  className="resume-upload-banner-dismiss"
                  onClick={() => setViewResume(null)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
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
