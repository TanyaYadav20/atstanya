import mongoose from "mongoose";

interface IJob {
  title: string;
  description: string;
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
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

const Job = mongoose.model<IJob>("Job", JobSchema);

export default Job;
