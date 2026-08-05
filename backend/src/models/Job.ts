import mongoose from "mongoose";

interface IJob {
  title: string;
  description: string;
  status: "OPEN" | "CLOSED";
  createdBy: mongoose.Types.ObjectId;
}

const JobSchema = new mongoose.Schema<IJob>({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["OPEN", "CLOSED"],
    default: "OPEN",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
},
{
    timestamps: true,
}
);

const Job = mongoose.model<IJob>("Job", JobSchema);

export default Job;
