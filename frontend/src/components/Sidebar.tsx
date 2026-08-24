import { NavLink } from "react-router-dom";
import juntraxLogo from "../assets/juntrax-logo.png";
import "./Sidebar.css";

// Dashboard, Jobs, Candidates, Applications, Resume Upload, AI Analysis and
// Settings have real pages today.
const NAV_ITEMS: { label: string; path: string }[] = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Jobs", path: "/jobs" },
  { label: "Candidates", path: "/candidates" },
  { label: "Applications", path: "/applications" },
  { label: "Resume Upload", path: "/resume-upload" },
  { label: "AI Analysis", path: "/ai-analysis" },
  { label: "Settings", path: "/settings" },
];

const COMING_SOON_ITEMS: string[] = [];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src={juntraxLogo} alt="Juntrax" className="sidebar-brand-mark" />
        <span className="sidebar-brand-name">Juntrax ATS</span>
      </div>
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
