import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import "./SettingsPage.css";

export default function SettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <div>
          <h1>Settings</h1>
          <p className="settings-subtitle">Manage your account.</p>
        </div>
      </div>

      <section className="settings-card">
        <h2>Account</h2>
        <p className="settings-card-description">
          Sign out of your account on this device.
        </p>
        <Button variant="ghost" onClick={handleLogout}>
          Log out
        </Button>
      </section>
    </div>
  );
}
