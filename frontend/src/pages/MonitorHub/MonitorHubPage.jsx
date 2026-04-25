import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import "./MonitorHub.css";

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoArrow    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;

// ── Feature Cards ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    key: "drowsiness",
    title: "Drowsiness Detection",
    subtitle: "Driver fatigue monitoring",
    description:
      "Real-time eye aspect ratio (EAR) analysis and head-pose estimation to detect driver drowsiness and microsleeps. Triggers alerts before fatigue becomes a safety risk.",
    tags: ["Eye Tracking", "Head Pose", "Real-time Alert"],
    accent: "#818cf8",
    gradient: "linear-gradient(135deg, #818cf815, #6366f110)",
    border: "#818cf8",
    comingSoon: false,
    path: "/driver/drowsiness",
    cta: "Start Monitoring",
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5">
        <ellipse cx="12" cy="12" rx="10" ry="6"/>
        <circle cx="12" cy="12" r="3"/>
        <line x1="12" y1="2" x2="12" y2="4"/>
        <line x1="12" y1="20" x2="12" y2="22"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      </svg>
    ),
  },
  {
    key: "emotion",
    title: "Emotion Shift Profile Analysis",
    subtitle: "Real-time driver monitoring",
    description:
      "Live webcam emotion detection with Behavioral Volatility Index (BVI) scoring. Tracks happy, sad, angry, fearful and neutral states frame-by-frame. Also supports video upload for post-trip analysis.",
    tags: ["Live Camera", "Video Upload", "BVI Score", "YOLO Objects"],
    accent: "#818cf8",
    gradient: "linear-gradient(135deg, #818cf820, #38bdf810)",
    border: "#818cf8",
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5">
        <circle cx="12" cy="8" r="4"/>
        <path d="M8 14s1 3 4 3 4-3 4-3"/>
        <path d="M2 20h20"/>
      </svg>
    ),
    sub: [
      { label: "📷 Live",          path: "/driver/monitor/emotion?tab=live"  },
      { label: "🎥 Video Analysis", path: "/driver/monitor/emotion?tab=video" },
    ],
  },
  {
    key: "roadsign",
    title: "Road Sign Detection",
    subtitle: "Sign recognition & classification",
    description:
      "Detect and classify road signs from uploaded images, video files or a live webcam stream. Uses a 3-model ensemble (MobileNetV2 + Custom CNN + YOLOv8) for high accuracy results.",
    tags: ["Image Upload", "Video Upload", "Webcam Live", "Ensemble Model"],
    accent: "#34d399",
    gradient: "linear-gradient(135deg, #34d39920, #10b98110)",
    border: "#34d399",
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    sub: [
      { label: "🖼 Image",  path: "/road-sign?mode=image" },
      { label: "🎥 Video",  path: "/road-sign?mode=video" },
      { label: "📷 Webcam", path: "/road-sign/live"       },
    ],
  },
  {
    key: "roadscene",
    title: "Scene Analysis",
    subtitle: "Semantic segmentation & hazard assessment",
    description:
      "Pixel-level semantic segmentation of road scenes using a fine-tuned SegFormer model (16 classes). Includes a Route Hazard Analyser powered by SRTM elevation and OpenStreetMap road data.",
    tags: ["Image Upload", "Video Upload", "16 Classes", "Route Hazard Map"],
    accent: "#f59e0b",
    gradient: "linear-gradient(135deg, #f59e0b20, #d9770610)",
    border: "#f59e0b",
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5">
        <path d="M2 20h20"/>
        <path d="M4 20L9 9l4 6 3-3 4 8"/>
        <circle cx="17" cy="6" r="2"/>
      </svg>
    ),
    sub: [
      { label: "🖼 Image",   path: "/road-scene?mode=image" },
      { label: "🎥 Video",   path: "/road-scene?mode=video" },
      { label: "🗺 Hazard",  path: "/road-scene/hazard"     },
    ],
  },
];

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function MonitorHubPage() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const token = localStorage.getItem("token");

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <div className="dd-root">
      <Sidebar activeKey="monitor" />
      <main className="mh-main">

        {/* Top bar */}
        <header className="mh-topbar">
          <div>
            <h1 className="mh-topbar-title">Monitor Hub</h1>
            <p className="mh-topbar-sub">Select a monitoring module to get started</p>
          </div>
          <div className="mh-topbar-right">
            <span className="mh-driver-name">{user.username || "Driver"}</span>
            <div className="mh-avatar">{(user.username || "D")[0].toUpperCase()}</div>
          </div>
        </header>

        {/* Cards grid */}
        <div className="mh-grid">
          {FEATURES.map((f) => (
            <div
              key={f.key}
              className="mh-card"
              style={{ background: f.gradient, borderColor: f.border + "44" }}
            >
              {/* Card header */}
              <div className="mh-card-header">
                <div className="mh-card-icon" style={{ background: f.accent + "18", borderColor: f.accent + "44" }}>
                  {f.icon}
                </div>
                <div>
                  <h2 className="mh-card-title">{f.title}</h2>
                  <p className="mh-card-subtitle" style={{ color: f.accent }}>{f.subtitle}</p>
                </div>
              </div>

              {/* Description */}
              <p className="mh-card-desc">{f.description}</p>

              {/* Tags */}
              <div className="mh-tags">
                {f.tags.map((t) => (
                  <span key={t} className="mh-tag" style={{ background: f.accent + "18", color: f.accent, borderColor: f.accent + "44" }}>
                    {t}
                  </span>
                ))}
              </div>

              {/* Actions */}
              <div className="mh-card-footer">
                {f.comingSoon ? (
                  <span className="mh-coming-soon" style={{ color: f.accent, borderColor: f.accent + "55", background: f.accent + "12" }}>
                    🚧 Coming Soon
                  </span>
                ) : f.sub ? (
                  <div className="mh-sub-btns">
                    {f.sub.map((s) => (
                      <button
                        key={s.path}
                        className="mh-sub-btn"
                        style={{ borderColor: f.accent + "55", color: f.accent }}
                        onClick={() => navigate(s.path)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    className="mh-cta-btn"
                    style={{ background: f.accent + "22", borderColor: f.accent + "66", color: f.accent }}
                    onClick={() => navigate(f.path)}
                  >
                    {f.cta} <IcoArrow />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}
