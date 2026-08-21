import mongoose from "mongoose";
import { AIAnalysisSchema, type IAIAnalysis } from "./AIAnalysis";

export interface IResume {
  candidateId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  resumeHash: string;
  filePath: string;
  resumeText: string;
  aiAnalysis?: IAIAnalysis;
}

const ResumeSchema = new mongoose.Schema<IResume>(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
      index: true,
    },

    // Which job this resume belongs to in the recruiter's
    
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    // SHA-256 of the uploaded file. This identifies an exact
    // duplicate FILE only — it is never used to determine
    // candidate identity (see candidateMatching.service.ts).
    resumeHash: {
      type: String,
      required: true,
    },

    filePath: {
      type: String,
      required: true,
    },

    resumeText: {
      type: String,
      required: true,
    },

    // The same Gemini output that may also be stored on an
    // Application (models/Application.ts, untouched by this
    // feature) — kept here too so a resume in the pool has its
    // score/analysis even when no Application exists for it yet.
    aiAnalysis: {
      type: AIAnalysisSchema,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);



ResumeSchema.index(
  {
    jobId: 1,
    resumeHash: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      jobId: { $exists: true },
    },
  }
);

// Reuse existing model during tsx watch/hot reload
const Resume =
  mongoose.models.Resume ||
  mongoose.model<IResume>(
    "Resume",
    ResumeSchema
  );

export default Resume;