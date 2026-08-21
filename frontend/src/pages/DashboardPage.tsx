import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import "./DashboardPage.css";

export default function DashboardPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <span className="dashboard-brand">AI-ATS</span>
        <Button variant="ghost" onClick={handleLogout}>
          Log out
        </Button>
      </header>
      <main className="dashboard-main">
        <h1>Welcome back</h1>
        <p>You&apos;re signed in. This is a placeholder for the recruiter dashboard.</p>
      </main>
    </div>
  );
}
