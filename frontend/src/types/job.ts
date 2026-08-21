export type JobStatus = "OPEN" | "CLOSED";

export interface Job {
  _id: string;
  title: string;
  description: string;
  status: JobStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIAnalysis {
  scoringRationale: string;
  overallMatchScore: number;
  hardSkillsMatch: {
    found: string[];
    missing: string[];
  };
  mustHaveEvaluation: {
    met: boolean;
    reason: string;
  };
  redFlags: string[];
  executiveSummary: string;
}

export interface Candidate {
  _id: string;
  candidateRef: string;
  name: string;
  email: string;
  phone: string;
  linkedinUrl?: string;
  githubUrl?: string;
  totalExperienceYears: number;
}

export type ApplicationStatus = "APPLIED" | "SHORTLISTED" | "REJECTED";

export interface Application {
  _id: string;
  candidateId: Candidate | string;
  jobId: string;
  resumeId: string;
  status: ApplicationStatus;
  aiAnalysis?: AIAnalysis | null;
  createdAt: string;
  updatedAt: string;
}

export interface RankedApplication {
  rank: number;
  application: Application;
}

export interface ResumePoolCount {
  jobId: string;
  jobTitle: string;
  totalResumes: number;
}
