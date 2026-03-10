import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Sidebar.css";

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoHome     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IcoMonitor  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoSched    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IcoUser     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IcoLogout   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IcoRoadSign = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18M10.5 10.677a2 2 0 002.828 2.828"/><path d="M13.161 6.843A2 2 0 0015 9a2 2 0 00.8-.167m1.99 1.99C18.954 12.099 20 13.927 20 16a8 8 0 01-8 8 8 8 0 01-8-8c0-4.42 3.579-8 8-8 .786 0 1.547.113 2.268.322"/><path d="M12 4V2"/></svg>;

export default function Sidebar({ activeKey }) {
  const navigate   = useNavigate();
  const location   = useLocation();
  const [rsOpen, setRsOpen] = useState(
    // auto-expand if already on a road-sign page
    location.pathname.startsWith("/road-sign") || activeKey === "roadsign"
  );
  const [roadSceneOpen, setRoadSceneOpen] = useState(
    // auto-expand if already on a road-scene page
    location.pathname.startsWith("/road-scene") || activeKey === "roadscene"
  );

  useEffect(() => {
    if (location.pathname.startsWith("/road-sign") || activeKey === "roadsign") {
      setRsOpen(true);
    }
    if (location.pathname.startsWith("/road-scene") || activeKey === "roadscene") {
      setRoadSceneOpen(true);
    }
  }, [location.pathname, activeKey]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  const items = [
    { key: "dashboard", label: "Dashboard",                    Icon: IcoHome,     path: "/driver/dashboard" },
    { key: "section1",  label: "Section 1",                    Icon: IcoSched,    path: null                },
    { key: "monitor",   label: "Emotion Shift Profile Analysis", Icon: IcoMonitor, path: "/driver/monitor"   },
    {
      key: "roadsign",
      label: "Road Sign Detection",
      Icon: IcoRoadSign,
      path: null,
      sub: [
        { key: "rs-image",  label: "🖼  Image",  path: "/road-sign?mode=image" },
        { key: "rs-video",  label: "🎥  Video",  path: "/road-sign?mode=video" },
        { key: "rs-webcam", label: "📷  Webcam", path: "/road-sign/live"       },
      ],
    },
    {
      key: "roadscene",
      label: "Road Scene Analysis",
      Icon: IcoMonitor,
      path: null,
      sub: [
        { key: "rsc-image",  label: "🖼  Image",   path: "/road-scene?mode=image" },
        { key: "rsc-video",  label: "🎥  Video",   path: "/road-scene?mode=video" },
        { key: "rsc-hazard", label: "🗺  Hazard",  path: "/road-scene/hazard"     },
      ],
    },
    { key: "profile",   label: "Profile",   Icon: IcoUser,  path: "/driver/profile"  },
  ];

  // Determine active key from current path if not passed as prop
  const resolvedActive = activeKey || (() => {
    if (location.pathname.startsWith("/road-sign")) return "roadsign";
    if (location.pathname.startsWith("/road-scene")) return "roadscene";
    if (location.pathname === "/driver/monitor")    return "monitor";
    if (location.pathname === "/driver/dashboard")  return "dashboard";
    if (location.pathname === "/driver/profile")    return "profile";
    return "";
  })();

  return (
    <aside className="dm-sidebar">
      <div className="dm-logo">
        <div className="dm-logo-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <span>DriveGuard</span>
      </div>

      <nav className="dm-nav">
        {items.map(({ key, label, Icon, path, sub }) => (
          <div key={key}>
            <button
              className={`dm-nav-btn ${resolvedActive === key ? "active" : ""}`}
              onClick={() => {
                if (sub && key === "roadsign") setRsOpen((o) => !o);
                else if (sub && key === "roadscene") setRoadSceneOpen((o) => !o);
                else if (path) navigate(path);
              }}
            >
              <Icon />
              <span>{label}</span>
              {sub && (
                <span className="dm-nav-arrow">
                  {(key === "roadsign" ? rsOpen : roadSceneOpen) ? "▾" : "▸"}
                </span>
              )}
            </button>

            {sub && (key === "roadsign" ? rsOpen : roadSceneOpen) && (
              <div className="dm-nav-sub">
                {sub.map((s) => (
                  <button
                    key={s.key}
                    className="dm-nav-sub-btn"
                    onClick={() => setTimeout(() => navigate(s.path), 150)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="dm-sidebar-foot">
        <div className="dm-tip-box">
          <span className="dm-tip-label">MONITOR TIP</span>
          <p className="dm-tip-text">Face the camera in good lighting for best accuracy.</p>
        </div>
        <button className="dm-signout" onClick={logout}>
          <IcoLogout />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
