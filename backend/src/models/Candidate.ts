import mongoose from "mongoose";

interface ICandidate {
  candidateRef: string;
  name: string;
  email: string;
  phone: string;
  totalExperienceYears: number;
  resumeFilePath: string;

  skills: string[];
  experience: string;
  projects: string;
  education: string;
}

const CandidateSchema = new mongoose.Schema(
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
      required: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    totalExperienceYears: {
      type: Number,
      required: true,
      min: 0,
    },

    resumeFilePath: {
      type: String,
      required: true,
    },

    skills: {
      type: [String],
      default: [],
    },

    experience: {
      type: String,
      default: "",
    },

    projects: {
      type: String,
      default: "",
    },

    education: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Generate Candidate Reference (CAN-1001, CAN-1002...)
CandidateSchema.pre("save", async function () {
  if (this.candidateRef) {
    return;
  }

  const Candidate = mongoose.model<ICandidate>("Candidate");

  const lastCandidate = await Candidate.findOne()
    .sort({ createdAt: -1 })
    .select("candidateRef");

  let nextNumber = 1001;

  if (lastCandidate?.candidateRef) {
    const lastNumber = parseInt(
      lastCandidate.candidateRef.split("-")[1],
      10
    );

    nextNumber = lastNumber + 1;
  }

  this.candidateRef = `CAN-${nextNumber}`;
});

const Candidate = mongoose.model<ICandidate>(
  "Candidate",
  CandidateSchema
);

export default Candidate;