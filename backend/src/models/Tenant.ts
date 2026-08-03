import mongoose from "mongoose";

interface ITenant {
  companyName: string;
}

const TenantSchema = new mongoose.Schema<ITenant>({
  companyName: {
    type: String,
    required: true,
  },
});

const Tenant = mongoose.model("Tenant", TenantSchema);

export default Tenant;