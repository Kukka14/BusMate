import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Sidebar.css";

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoHome     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IcoMonitor  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoDrowsy   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="10" ry="6"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/></svg>;
const IcoEmotion  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>;
const IcoUser     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IcoLogout   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IcoRoadSign = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18M10.5 10.677a2 2 0 002.828 2.828"/><path d="M13.161 6.843A2 2 0 0015 9a2 2 0 00.8-.167m1.99 1.99C18.954 12.099 20 13.927 20 16a8 8 0 01-8 8 8 8 0 01-8-8c0-4.42 3.579-8 8-8 .786 0 1.547.113 2.268.322"/><path d="M12 4V2"/></svg>;
const IcoScene    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20"/><path d="M4 20L9 9l4 6 3-3 4 8"/><circle cx="17" cy="6" r="2"/></svg>;

export default function Sidebar({ activeKey }) {
  const navigate  = useNavigate();
  const location  = useLocation();

  const onEmotion = location.pathname.startsWith("/driver/monitor/emotion") || activeKey === "emotion";
  const onRS      = location.pathname.startsWith("/road-sign")  || activeKey === "roadsign";
  const onRSC     = location.pathname.startsWith("/road-scene") || activeKey === "roadscene";

  const [openKey, setOpenKey] = useState(
    onEmotion ? "emotion" : onRS ? "roadsign" : onRSC ? "roadscene" : null
  );

  useEffect(() => {
    if (onEmotion) setOpenKey("emotion");
    else if (onRS)  setOpenKey("roadsign");
    else if (onRSC) setOpenKey("roadscene");
  }, [location.pathname, activeKey]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  // Resolve which key is "active" for highlight
  const resolvedActive = activeKey || (() => {
    if (location.pathname.startsWith("/driver/monitor/emotion")) return "emotion";
    if (location.pathname === "/driver/monitor")               return "monitor";
    if (location.pathname.startsWith("/road-sign"))            return "roadsign";
    if (location.pathname.startsWith("/road-scene"))           return "roadscene";
    if (location.pathname === "/driver/dashboard")             return "dashboard";
    if (location.pathname === "/driver/profile")               return "profile";
    return "";
  })();

  const items = [
    { key: "dashboard",  label: "Dashboard",              Icon: IcoHome,     path: "/driver/dashboard" },
    { key: "monitor",    label: "Monitor",                 Icon: IcoMonitor,  path: "/driver/monitor"   },
    { key: "drowsiness", label: "Drowsiness Detection",   Icon: IcoDrowsy,   path: null, disabled: true },
    {
      key: "emotion",
      label: "Emotion Shift Analysis",
      Icon: IcoEmotion,
      path: null,
      sub: [
        { key: "em-live",  label: "📷  Live Cam",       path: "/driver/monitor/emotion?tab=live"  },
        { key: "em-video", label: "🎥  Video Analysis", path: "/driver/monitor/emotion?tab=video" },
      ],
    },
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
      Icon: IcoScene,
      path: null,
      sub: [
        { key: "rsc-image",  label: "🖼  Image",  path: "/road-scene?mode=image" },
        { key: "rsc-video",  label: "🎥  Video",  path: "/road-scene?mode=video" },
        { key: "rsc-hazard", label: "🗺  Hazard", path: "/road-scene/hazard"     },
      ],
    },
    { key: "profile", label: "Profile", Icon: IcoUser, path: "/driver/profile" },
  ];

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
        {items.map(({ key, label, Icon, path, sub, disabled }) => (
          <div key={key}>
            <button
              className={`dm-nav-btn ${resolvedActive === key ? "active" : ""} ${disabled ? "dm-nav-disabled" : ""}`}
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                if (sub) setOpenKey(k => k === key ? null : key);
                else if (path) navigate(path);
              }}
            >
              <Icon />
              <span>{label}</span>
              {disabled && <span className="dm-nav-cs-badge">Soon</span>}
              {sub && !disabled && (
                <span className="dm-nav-arrow">{openKey === key ? "▾" : "▸"}</span>
              )}
            </button>
            {sub && openKey === key && (
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
