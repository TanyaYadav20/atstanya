import mongoose from "mongoose";
interface IUser {
  email: string;
  password: string;
  tenantId: mongoose.Types.ObjectId;
}
const UserSchema = new mongoose.Schema<IUser>({
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Tenant",
  },
});
const User = mongoose.model("User", UserSchema);

export default User;