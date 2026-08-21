import mongoose from "mongoose";
import { normalizeUrl } from "../utils/normalize";

// ============================================================
// A record of an ambiguous (REVIEW-confidence) candidate match.
// Written when candidateMatching.service.ts cannot confidently
// say two resumes belong to the same person, so a new Candidate
// is created instead of silently merging — this is what lets a
// human later confirm/reject the possible duplicate.
// ============================================================

export interface IPossibleDuplicate {
  candidateId: mongoose.Types.ObjectId;
  confidenceScore: number;
  matchedFields: string[];
  flaggedAt: Date;
}

export interface ICandidate {
  candidateRef: string;
  name: string;
  email: string;
  phone: string;
  linkedinUrl?: string;
  githubUrl?: string;
  totalExperienceYears: number;
  possibleDuplicateOf: IPossibleDuplicate[];
}

const PossibleDuplicateSchema = new mongoose.Schema<IPossibleDuplicate>(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
    },

    confidenceScore: {
      type: Number,
      required: true,
    },

    matchedFields: {
      type: [String],
      default: [],
    },

    flaggedAt: {
      type: Date,
      required: true,
    },
  },
  {
    _id: false,
  }
);

const CandidateSchema = new mongoose.Schema<ICandidate>(
  {
    candidateRef: {
      type: String,
      unique: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      required: false,
      default: "",
      trim: true,
      index: true,
    },


    linkedinUrl: {
      type: String,
      required: false,
      default: "",
      trim: true,
      set: normalizeUrl,
      index: true,
      sparse: true,
    },

    githubUrl: {
      type: String,
      required: false,
      default: "",
      trim: true,
      set: normalizeUrl,
      index: true,
      sparse: true,
    },

    totalExperienceYears: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    possibleDuplicateOf: {
      type: [PossibleDuplicateSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// ============================================================
// Generate Candidate Reference
// CAN-1001, CAN-1002, CAN-1003...
// ============================================================

CandidateSchema.pre("save", async function () {
  if (this.candidateRef) {
    return;
  }

  const Candidate =
    mongoose.model<ICandidate>("Candidate");

  const lastCandidate =
    await Candidate.findOne()
      .sort({ createdAt: -1 })
      .select("candidateRef");

  let nextNumber = 1001;

  const lastRefSuffix = lastCandidate?.candidateRef?.split("-")[1];

  if (lastRefSuffix) {
    const lastNumber = parseInt(lastRefSuffix, 10);

    if (!isNaN(lastNumber)) {
      nextNumber = lastNumber + 1;
    }
  }

  this.candidateRef =
    `CAN-${nextNumber}`;
});



const Candidate =
  mongoose.models.Candidate ||
  mongoose.model<ICandidate>(
    "Candidate",
    CandidateSchema
  );

export default Candidate;