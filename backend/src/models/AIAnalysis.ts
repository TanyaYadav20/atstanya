import mongoose from "mongoose";


// Shared AI-analysis shape.


export interface IAIAnalysis {
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

export const AIAnalysisSchema = new mongoose.Schema<IAIAnalysis>(
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
