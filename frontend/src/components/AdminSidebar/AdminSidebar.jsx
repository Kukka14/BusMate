import React from "react";
import { useNavigate } from "react-router-dom";
import "./AdminSidebar.css";

/* ── Icons ─────────────────────────────────────────────────────────────── */
const IcoDash   = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
const IcoFleet  = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 4v4h-7V8Z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
const IcoPeople = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IcoCal    = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IcoShield = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IcoGear   = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>;
const IcoDoc    = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;

const MAIN_NAV = [
  { key: "dashboard", label: "Dashboard",        Icon: IcoDash,   path: "/admin/dashboard"  },
  { key: "fleet",     label: "Fleet Monitoring",  Icon: IcoFleet,  path: null                },
  { key: "drivers",   label: "Manage Drivers",    Icon: IcoPeople, path: "/admin/drivers"    },
  { key: "schedules", label: "Schedules",         Icon: IcoCal,    path: "/admin/schedules"  },
  { key: "safety",    label: "Safety Reports",    Icon: IcoShield, path: null                },
];

const SYS_NAV = [
  { key: "settings", label: "Settings",       Icon: IcoGear },
  { key: "docs",     label: "Documentation",  Icon: IcoDoc  },
];

const initials = (name = "") =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/**
 * Shared admin sidebar.
 *
 * Props:
 *   activeKey  — nav item key to highlight ("dashboard" | "fleet" | "drivers" | "schedules" | "safety")
 *   onItemClick — optional callback(key) called when a nav item is clicked
 *                 (used by AdminDashboard for in-page tab switching)
 */
export default function AdminSidebar({ activeKey, onItemClick }) {
  const navigate = useNavigate();
  const user = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
  })();

  function handleNavClick(key, path) {
    if (onItemClick) onItemClick(key);
    if (path) navigate(path);
  }

  function logout() {
    localStorage.clear();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="adm-sidebar">
      {/* Logo */}
      <div className="adm-logo">
        <div className="adm-logo-icon">
          <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
            <rect x="1" y="3" width="15" height="13" rx="2"/>
            <path d="M16 8h4l3 4v4h-7V8Z"/>
          </svg>
        </div>
        <div>
          <div className="adm-logo-name">BusMate</div>
          <div className="adm-logo-sub">Enterprise Fleet</div>
        </div>
      </div>

      {/* Main nav */}
      <p className="adm-nav-section">MAIN MENU</p>
      <nav className="adm-nav">
        {MAIN_NAV.map(({ key, label, Icon, path }) => (
          <button
            key={key}
            className={`adm-nav-btn${activeKey === key ? " active" : ""}`}
            onClick={() => handleNavClick(key, path)}
          >
            <Icon /><span>{label}</span>
          </button>
        ))}
      </nav>

      {/* System nav */}
      <p className="adm-nav-section" style={{ marginTop: "1.25rem" }}>SYSTEM</p>
      <nav className="adm-nav">
        {SYS_NAV.map(({ key, label, Icon }) => (
          <button
            key={key}
            className="adm-nav-btn"
            onClick={() => onItemClick && onItemClick(key)}
          >
            <Icon /><span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="adm-sidebar-footer">
        <div className="adm-user-row">
          <div className="adm-user-avatar">{initials(user.username || "Admin")}</div>
          <div>
            <div className="adm-user-name">{user.username || "Admin"}</div>
            <div className="adm-user-role">Fleet Administrator</div>
          </div>
        </div>
        <button className="adm-signout-btn" onClick={logout}>Sign Out</button>
      </div>
    </aside>
  );
}
