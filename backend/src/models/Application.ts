import mongoose from "mongoose";

interface IApplication {
  candidateId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  status: "APPLIED" | "SHORTLISTED" | "REJECTED";
}

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