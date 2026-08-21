import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import "./AppLayout.css";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">{children}</main>
    </div>
  );
}
