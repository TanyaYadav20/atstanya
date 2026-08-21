import { NavLink } from "react-router-dom";
import "./Sidebar.css";

// Dashboard, Jobs, Candidates, Applications, Resume Upload and AI Analysis
// have real pages today. The rest are shown per the required ATS layout but
// stay non-navigable since building those pages is out of scope for this change.
const NAV_ITEMS: { label: string; path: string }[] = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Jobs", path: "/jobs" },
  { label: "Candidates", path: "/candidates" },
  { label: "Applications", path: "/applications" },
  { label: "Resume Upload", path: "/resume-upload" },
  { label: "AI Analysis", path: "/ai-analysis" },
];

const COMING_SOON_ITEMS = ["Settings"];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">AI-ATS</div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              "sidebar-link" + (isActive ? " sidebar-link-active" : "")
            }
          >
            {item.label}
          </NavLink>
        ))}
        {COMING_SOON_ITEMS.map((label) => (
          <span
            key={label}
            className="sidebar-link sidebar-link-disabled"
            title="Not available yet"
          >
            {label}
          </span>
        ))}
      </nav>
    </aside>
  );
}
