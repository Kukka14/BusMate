import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar/AdminSidebar";

/* ── small icon helpers ─────────────────────────────────────────────────── */
const IcoChev = ({ open }) => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
    style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

/* ── section data ───────────────────────────────────────────────────────── */
const SECTIONS = [
  {
    id: "overview",
    title: "System Overview",
    icon: "📊",
    color: "#38bdf8",
    items: [
      {
        q: "What is BusMate?",
        a: "BusMate is an AI-powered fleet management platform designed for bus operators. It combines real-time driver monitoring, behavioural analytics, road-sign detection, and route-hazard prediction into a single admin dashboard.",
      },
      {
        q: "What data does BusMate collect?",
        a: "BusMate collects: facial emotion frames (processed locally), drowsiness probability readings every 30 s, road-sign detection events, shift scores after every completed shift, GPS breadcrumbs during active shifts, and schedule/route metadata.",
      },
      {
        q: "Where is the data stored?",
        a: "All data is stored in a MongoDB Atlas cloud cluster. Collections: users, driver_profiles, shift_scores, driving_sessions, road_sign, schedules.",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Admin Dashboard",
    icon: "🖥",
    color: "#a78bfa",
    items: [
      {
        q: "How are dashboard statistics calculated?",
        a: "Active buses: live count of driver accounts. Safety alerts: count of driving sessions with at least one safety alert in the selected time range. Drowsiness trends, emotion shift, and sign validation charts aggregate the last 7 / 30 / 90 days of data.",
      },
      {
        q: "What do the trend charts show?",
        a: "Drowsiness trend shows average drowsy probability per day. Emotion shift shows BVI (Behaviour Volatility Index) percentages. Sign validation shows road-sign detection counts and pass/fail ratios.",
      },
      {
        q: "How do I refresh dashboard data?",
        a: "Use the time-range selector (7d / 30d / 90d) at the top of the dashboard. The data refreshes automatically when you change the range.",
      },
    ],
  },
  {
    id: "drivers",
    title: "Driver Management",
    icon: "👤",
    color: "#22c55e",
    items: [
      {
        q: "How do I add a new driver?",
        a: "Navigate to Manage Drivers → click Add Driver. Fill in username, email, password, and optional profile fields (vehicle, route, shift, phone, license number). The driver can log in immediately.",
      },
      {
        q: "What is the Driver Detail page?",
        a: "The Driver Detail page shows the full safety profile for a single driver: recent shift scores, BVI time analysis, drowsiness analysis, road-sign detection history, and route hazard risk — all in one place.",
      },
      {
        q: "How is the driver ranking calculated?",
        a: "Drivers are ranked by their average total_score across all Completed shifts. A minimum of 3 completed shifts is required to appear in the ranked list. Tier labels: Excellent (≥85), Good (≥70), Average (≥50), Needs Improvement (≥30), Poor (<30).",
      },
    ],
  },
  {
    id: "shift-scores",
    title: "Shift Score System",
    icon: "📝",
    color: "#f59e0b",
    items: [
      {
        q: "How is a shift score calculated?",
        a: "A shift score is a composite of four components (max 100 pts): Emotion stability (20 pts), Drowsiness safety (30 pts), Road-sign compliance (25 pts), and Driving regularity (25 pts). Scores are automatically generated at shift end.",
      },
      {
        q: "What do the tier labels mean?",
        a: "Excellent: 85–100 (exceptional safety). Good: 70–84 (minor deviations). Average: 50–69 (some lapses). Needs Improvement: 30–49 (frequent issues). Poor: 0–29 (high risk, needs intervention).",
      },
      {
        q: "Can I view score breakdown per component?",
        a: "Yes — click any shift row in the Shift Score History card on the Driver Detail page to expand the full score breakdown including component scores, start/end times, route, and status.",
      },
    ],
  },
  {
    id: "bvi",
    title: "BVI — Behaviour Volatility Index",
    icon: "🧠",
    color: "#a78bfa",
    items: [
      {
        q: "What is BVI?",
        a: "BVI measures how erratic a driver's emotional and behavioural signals are during a shift. A BVI of 0% = perfectly stable; 100% = highly erratic. It is computed from the variance of emotion-model output probabilities.",
      },
      {
        q: "What are the BVI state labels?",
        a: "Stable: BVI < 30%. Unstable: 30–59%. Erratic: ≥ 60%. The BVI Time Analysis card shows state distribution, peak volatile hours, and a shift-by-shift trend.",
      },
      {
        q: "How can I export BVI data?",
        a: "Click Export PDF in the BVI Time Analysis card header to download a single-driver BVI report. Use Generate Full Report at the bottom of the page for a combined report.",
      },
    ],
  },
  {
    id: "drowsiness",
    title: "Drowsiness Analysis",
    icon: "😴",
    color: "#ef4444",
    items: [
      {
        q: "How is drowsiness detected?",
        a: "An ensemble of 5 CNN/LSTM models analyses facial landmarks and eye-aspect-ratio in real time. A drowsy probability is averaged every 30 s and stored against the active shift.",
      },
      {
        q: "What triggers a drowsiness alert?",
        a: "An alert is raised when the 30-second average drowsy probability exceeds 60%. The driver dashboard shows a visual and audio warning.",
      },
      {
        q: "What does Avg Drowsy Rate mean?",
        a: "It is the percentage of 30-s windows within a shift where the driver was classified as drowsy (prob > 50%). High rates over multiple shifts may indicate chronic fatigue.",
      },
    ],
  },
  {
    id: "road-signs",
    title: "Road Sign Detection",
    icon: "🚦",
    color: "#22c55e",
    items: [
      {
        q: "What does the Road Sign Detection system do?",
        a: "A YOLOv8-based model detects road signs in the forward-facing camera feed in real time. For each detection it records the sign class, confidence score, estimated distance, and traffic congestion level.",
      },
      {
        q: "Where is road-sign data shown for a driver?",
        a: "In the Road Sign Detection Analysis card on the Driver Detail page. It shows total detections, average confidence, top sign classes, status breakdown (Normal / Damaged / Unclear), and per-shift detection history.",
      },
      {
        q: "What sign statuses exist?",
        a: "Normal: clearly visible, well-maintained sign. Damaged: visibly deteriorated. Possibly unclear: low confidence or partially occluded. Admins should flag repeated 'Damaged' detections on a route for maintenance.",
      },
    ],
  },
  {
    id: "hazard",
    title: "Route Hazard Risk Prediction",
    icon: "🗺",
    color: "#f97316",
    items: [
      {
        q: "How is route hazard risk calculated?",
        a: "Hazard risk is a deterministic terrain-based score (0–100) derived from the route start/end pair. It models road curvature, elevation change, and historically recorded incident density for that corridor.",
      },
      {
        q: "What do the risk labels mean?",
        a: "Low Risk: score 5–29. Medium Risk: 30–49. High Risk: 50–69. Critical Risk: 70–100. Routes in the High/Critical band should be reviewed for additional driver support or speed restrictions.",
      },
      {
        q: "How do I run a live hazard analysis for a route?",
        a: "Navigate to Road Scene → Hazard Analyser. Enter a start and end location; the system calls the elevation/OSRM APIs to plot a real-time risk heatmap along the route.",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports & PDF Export",
    icon: "📋",
    color: "#38bdf8",
    items: [
      {
        q: "What reports can I generate?",
        a: "Three report types are available on the Driver Detail page: (1) Drowsiness Analysis PDF — per-driver drowsiness trends and shift history. (2) BVI Analysis PDF — volatility index trends. (3) Full Driver Safety Report — comprehensive 6-page PDF combining shift scores, BVI, drowsiness, road signs, and hazard risk.",
      },
      {
        q: "How do I export the full safety report?",
        a: "Open the Driver Detail page for any driver and scroll to the bottom. Click Generate Full Report. The PDF is generated client-side using jsPDF and downloaded automatically.",
      },
      {
        q: "Can I generate reports for multiple drivers at once?",
        a: "Currently reports are generated per driver. Bulk export is on the roadmap. As a workaround, use the Driver Rankings table to identify high-risk drivers and generate individual reports.",
      },
    ],
  },
  {
    id: "api",
    title: "Backend API Reference",
    icon: "⚙",
    color: "#64748b",
    items: [
      {
        q: "Where does the backend run?",
        a: "The Flask backend runs on http://localhost:5000 by default. All admin endpoints are prefixed /api/admin. Authentication uses Bearer JWT tokens (obtained from POST /api/auth/login).",
      },
      {
        q: "Key admin endpoints",
        a: [
          "GET  /api/admin/dashboard-stats?range=7d",
          "GET  /api/admin/drivers",
          "GET  /api/admin/drivers/detailed",
          "GET  /api/admin/drivers/:id/shift-scores",
          "GET  /api/admin/drivers/:id/bvi-analysis",
          "GET  /api/admin/drivers/:id/road-sign-analysis",
          "GET  /api/admin/drivers/:id/hazard-analysis",
          "GET  /api/admin/drivers/rankings",
          "GET  /api/admin/schedules",
          "POST /api/admin/create-admin",
        ].join("\n"),
        code: true,
      },
    ],
  },
];

/* ── component ──────────────────────────────────────────────────────────── */
export default function AdminDocsPage() {
  const navigate  = useNavigate();
  const [open, setOpen] = useState({});
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

  const toggle = (sectionId, idx) => {
    const key = `${sectionId}-${idx}`;
    setOpen(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const currentSection = SECTIONS.find(s => s.id === activeSection) || SECTIONS[0];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#060d1a", color: "#e2e8f0" }}>
      <AdminSidebar activeKey="docs" />

      <main style={{ flex: 1, padding: "1.5rem 2rem", overflowY: "auto", fontFamily: "Inter, sans-serif" }}>

        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#f0f6ff", margin: 0 }}>
            Documentation
          </h1>
          <p style={{ margin: "0.3rem 0 0", fontSize: "0.82rem", color: "#475569" }}>
            BusMate Fleet Management — Admin Reference Guide
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "1.5rem", alignItems: "start" }}>

          {/* Side TOC */}
          <nav style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: "0.75rem", position: "sticky", top: "1rem" }}>
            <p style={{ fontSize: "0.62rem", color: "#334155", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 0.5rem 0.25rem" }}>
              TOPICS
            </p>
            {SECTIONS.map(s => (
              <button key={s.id}
                onClick={() => setActiveSection(s.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  width: "100%", textAlign: "left", background: activeSection === s.id ? "#0d1b2e" : "transparent",
                  border: activeSection === s.id ? `1px solid ${s.color}44` : "1px solid transparent",
                  borderRadius: 8, padding: "0.45rem 0.65rem", marginBottom: 2,
                  cursor: "pointer", fontSize: "0.78rem",
                  color: activeSection === s.id ? s.color : "#64748b",
                  transition: "all 0.15s",
                }}>
                <span>{s.icon}</span>
                <span style={{ fontWeight: activeSection === s.id ? 600 : 400 }}>{s.title}</span>
              </button>
            ))}
          </nav>

          {/* Content */}
          <div>
            <div style={{ background: "#0a1628", border: `1px solid ${currentSection.color}33`, borderRadius: 14, padding: "1.5rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
                <span style={{ fontSize: "1.5rem" }}>{currentSection.icon}</span>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: currentSection.color, margin: 0 }}>
                  {currentSection.title}
                </h2>
              </div>

              {currentSection.items.map((item, idx) => {
                const key  = `${currentSection.id}-${idx}`;
                const isOpen = !!open[key];
                return (
                  <div key={idx} style={{ marginBottom: "0.6rem", borderRadius: 10, overflow: "hidden", border: "1px solid #1e293b" }}>
                    <button
                      onClick={() => toggle(currentSection.id, idx)}
                      style={{
                        width: "100%", textAlign: "left", background: isOpen ? "#0d1b2e" : "#071828",
                        border: "none", padding: "0.75rem 1rem", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        color: isOpen ? "#f0f6ff" : "#94a3b8", fontSize: "0.85rem", fontWeight: isOpen ? 600 : 400,
                      }}>
                      <span>{item.q}</span>
                      <IcoChev open={isOpen} />
                    </button>
                    {isOpen && (
                      <div style={{ background: "#050d1a", padding: "0.85rem 1rem", borderTop: "1px solid #1e293b" }}>
                        {item.code ? (
                          <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "0.72rem", color: "#22c55e", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                            {item.a}
                          </pre>
                        ) : (
                          <p style={{ margin: 0, fontSize: "0.82rem", color: "#94a3b8", lineHeight: 1.7 }}>
                            {item.a}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick-links footer */}
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { label: "← Manage Drivers", path: "/admin/drivers" },
                { label: "Dashboard",         path: "/admin/dashboard" },
                { label: "Schedules",         path: "/admin/schedules" },
              ].map(l => (
                <button key={l.path}
                  onClick={() => navigate(l.path)}
                  style={{
                    background: "#0a1628", border: "1px solid #1e293b", borderRadius: 8,
                    padding: "0.45rem 0.9rem", cursor: "pointer", fontSize: "0.78rem", color: "#64748b",
                    transition: "color 0.15s, border-color 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color="#38bdf8"; e.currentTarget.style.borderColor="#38bdf855"; }}
                  onMouseLeave={e => { e.currentTarget.style.color="#64748b"; e.currentTarget.style.borderColor="#1e293b"; }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
