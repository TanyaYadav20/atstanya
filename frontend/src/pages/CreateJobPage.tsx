import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Input from "../components/Input";
import { createJob } from "../lib/jobsApi";
import { ApiError } from "../types/auth";
import type { JobStatus } from "../types/job";
import "./CreateJobPage.css";

// Mirrors backend/src/validators/jobValidator.ts so obviously invalid
// input is caught before hitting the API — the backend remains the
// source of truth and its message is shown on any 400 response.
const TITLE_MIN = 5;
const TITLE_MAX = 100;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 1000;

export default function CreateJobPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<JobStatus>("OPEN");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (trimmedTitle.length < TITLE_MIN || trimmedTitle.length > TITLE_MAX) {
      setError(`Title must be between ${TITLE_MIN} and ${TITLE_MAX} characters.`);
      return;
    }

    if (
      trimmedDescription.length < DESCRIPTION_MIN ||
      trimmedDescription.length > DESCRIPTION_MAX
    ) {
      setError(
        `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await createJob({
        title: trimmedTitle,
        description: trimmedDescription,
        status,
      });
      navigate("/jobs", { state: { jobCreated: true } });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to create job. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="create-job-page">
      <h1>Create Job</h1>
      <form className="create-job-form" onSubmit={handleSubmit}>
        <Input
          label="Job Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Senior Backend Engineer"
          required
        />

        <div className="field">
          <label className="field-label" htmlFor="job-description">
            Description
          </label>
          <textarea
            id="job-description"
            className="field-input job-description-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the role, responsibilities, and requirements..."
            rows={8}
            required
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="job-status">
            Status
          </label>
          <select
            id="job-status"
            className="field-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as JobStatus)}
          >
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        {error && (
          <p className="create-job-error" role="alert">
            {error}
          </p>
        )}

        <div className="create-job-actions">
          <Button type="button" variant="ghost" onClick={() => navigate("/jobs")}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Create Job
          </Button>
        </div>
      </form>
    </div>
  );
}
