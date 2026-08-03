import mongoose from "mongoose";
interface IJob {
  title: string;
  description: string;
  tenantId: mongoose.Types.ObjectId;
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
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Tenant",
  },
});
const Job = mongoose.model("Job", JobSchema);

export default Job;