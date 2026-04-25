import { useNavigate, useLocation } from "react-router-dom";
import "./Sidebar.css";

// ── Icons (matching DriverDashboard) ──────────────────────────────────────────
const IcoHome    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IcoMonitor = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoSched   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IcoStats   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const IcoUser    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IcoLogout  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;

const NAV_ITEMS = [
  { key: "home",     label: "Home",     Icon: IcoHome,    path: "/driver/dashboard" },
  { key: "monitor",  label: "Monitor",  Icon: IcoMonitor, path: "/driver/monitor"   },
  { key: "schedule", label: "Schedule", Icon: IcoSched,   path: "/driver/schedule"  },
  { key: "stats",    label: "Stats",    Icon: IcoStats,   path: "/driver/stats"     },
  { key: "profile",  label: "Profile",  Icon: IcoUser,    path: "/driver/profile"   },
];

export default function Sidebar({ activeKey }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Resolve active key from prop or current path
  const active = activeKey || (() => {
    const p = location.pathname;
    if (p === "/driver/dashboard")            return "home";
    if (p.startsWith("/driver/monitor"))      return "monitor";
    if (p.startsWith("/driver/drowsiness"))   return "monitor";
    if (p.startsWith("/road-sign"))           return "monitor";
    if (p.startsWith("/road-scene"))          return "monitor";
    if (p.startsWith("/driver/schedule"))     return "schedule";
    if (p.startsWith("/driver/active-shift")) return "schedule";
    if (p.startsWith("/driver/stats"))        return "stats";
    if (p.startsWith("/driver/profile"))      return "profile";
    return "";
  })();

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <aside className="dd-sidebar">
      <div className="dd-logo">
        <div className="dd-logo-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M3 9h18"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/><path d="M5.5 16v2M18.5 16v2"/></svg>
        </div>
        <span>BusMate</span>
      </div>
      <nav className="dd-nav">
        {NAV_ITEMS.map(({ key, label, Icon, path }) => (
          <button
            key={key}
            className={`dd-nav-btn ${active === key ? "active" : ""}`}
            onClick={() => path && navigate(path)}
          >
            <Icon /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="dd-sidebar-foot">
        <div className="dd-tip-box">
          <span className="dd-tip-label">DRIVER SAFETY TIP</span>
          <p className="dd-tip-text">Face the camera in good lighting for best accuracy.</p>
        </div>
        <button className="dd-signout" onClick={logout}><IcoLogout />Sign Out</button>
      </div>
    </aside>
  );
}
