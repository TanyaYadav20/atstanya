import mongoose from "mongoose";

interface IAIAnalysis {
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

interface IApplication {
  candidateId: mongoose.Types.ObjectId;

  jobId: mongoose.Types.ObjectId;

  status: "APPLIED" | "SHORTLISTED" | "REJECTED";

  aiAnalysis?: IAIAnalysis;
}

const AIAnalysisSchema = new mongoose.Schema(
  {
    scoringRationale: {
      type: String,
      required: true,
    },

    overallMatchScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    hardSkillsMatch: {
      found: {
        type: [String],
        default: [],
      },

      missing: {
        type: [String],
        default: [],
      },
    },

    mustHaveEvaluation: {
      met: {
        type: Boolean,
        required: true,
      },

      reason: {
        type: String,
        required: true,
      },
    },

    redFlags: {
      type: [String],
      default: [],
    },

    executiveSummary: {
      type: String,
      required: true,
    },
  },
  {
    _id: false,
  }
);

const ApplicationSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
    },

    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },

    status: {
      type: String,
      enum: ["APPLIED", "SHORTLISTED", "REJECTED"],
      default: "APPLIED",
    },

    aiAnalysis: {
      type: AIAnalysisSchema,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Application = mongoose.model<IApplication>(
  "Application",
  ApplicationSchema
);

export default Application;