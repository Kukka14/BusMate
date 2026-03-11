import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import "./SchedulePage.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const IcoRoute = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/>
    <path d="M6 9v1a5 5 0 005 5h2a5 5 0 005-5V9"/>
  </svg>
);
const IcoBus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="13" rx="2"/><path d="M3 9h18"/>
    <circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/>
    <path d="M5.5 16v2M18.5 16v2"/>
  </svg>
);
const IcoPlay = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);
const IcoCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

function StatusPill({ status }) {
  const map = {
    Today:     ["rgba(34,197,94,0.18)",  "#4ade80"],
    Upcoming:  ["rgba(37,99,235,0.15)",  "#60a5fa"],
    Completed: ["rgba(100,116,139,0.12)","#94a3b8"],
    "Day Off": ["rgba(100,116,139,0.08)","#64748b"],
  };
  const [bg, clr] = map[status] || map.Upcoming;
  return <span className="sch-pill" style={{ background: bg, color: clr }}>{status}</span>;
}

export default function SchedulePage() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState("upcoming"); // "upcoming" | "completed"

  useEffect(() => {
    if (!token) { navigate("/login"); return; }
    fetch(`${API}/api/driver/schedules`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => setSchedules(d.schedules || []))
      .catch(err => {
        console.warn("Schedule fetch failed, using demo data:", err.message);
        // Fallback demo data so the page is never empty
        const today = new Date();
        const fmt = d => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        const day = n => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
        setSchedules([
          { id: "SCH-D001", date: fmt(day(-2)), shift_time: "06:00 – 14:00", start_town: "Colombo", end_town: "Kandy", bus: "BUS-204", route_name: "101 Express", status: "Completed" },
          { id: "SCH-D002", date: fmt(day(-1)), shift_time: "10:00 – 18:00", start_town: "Galle", end_town: "Matara", bus: "BUS-117", route_name: "202 Southern", status: "Completed" },
          { id: "SCH-D003", date: fmt(day(0)),  shift_time: "06:00 – 14:00", start_town: "Negombo", end_town: "Colombo", bus: "BUS-155", route_name: "404 Coastal", status: "Today" },
          { id: "SCH-D004", date: fmt(day(1)),  shift_time: "14:00 – 22:00", start_town: "Kandy", end_town: "Nuwara Eliya", bus: "BUS-301", route_name: "505 Hill Country", status: "Upcoming" },
          { id: "SCH-D005", date: fmt(day(2)),  shift_time: "06:00 – 14:00", start_town: "Colombo", end_town: "Galle", bus: "BUS-204", route_name: "606 Southern Exp", status: "Upcoming" },
          { id: "SCH-D006", date: fmt(day(3)),  shift_time: "10:00 – 18:00", start_town: "Kurunegala", end_town: "Anuradhapura", bus: "BUS-088", route_name: "303 North Central", status: "Upcoming" },
        ]);
      })
      .finally(() => setLoading(false));
  }, [token, navigate]);

  const upcoming  = schedules.filter(s => s.status === "Today" || s.status === "Upcoming");
  const completed = schedules.filter(s => s.status === "Completed");
  const display   = tab === "upcoming" ? upcoming : completed;

  function startShift(schedule) {
    // Navigate to active shift page with schedule info
    navigate("/driver/active-shift", {
      state: {
        schedule_id: schedule.id,
        start_town:  schedule.start_town,
        end_town:    schedule.end_town,
        bus:         schedule.bus,
        route_name:  schedule.route_name,
        shift_time:  schedule.shift_time,
        date:        schedule.date,
      },
    });
  }

  return (
    <div className="dd-root">
      <Sidebar activeKey="schedule" />

      <main className="sch-main">
        <header className="sch-topbar">
          <span className="sch-topbar-title">Shift Schedule</span>
          <div className="sch-topbar-right">
            <span className="sch-driver-name">{user.username || "Driver"}</span>
            <div className="sch-avatar">{(user.username || "D")[0].toUpperCase()}</div>
          </div>
        </header>

        <div className="sch-content">
          {/* Tab switcher */}
          <div className="sch-tabs">
            <button className={`sch-tab ${tab === "upcoming" ? "active" : ""}`}
              onClick={() => setTab("upcoming")}>
              Upcoming ({upcoming.length})
            </button>
            <button className={`sch-tab ${tab === "completed" ? "active" : ""}`}
              onClick={() => setTab("completed")}>
              Completed ({completed.length})
            </button>
          </div>

          {loading ? (
            <div className="sch-loading"><div className="dd-spinner" /></div>
          ) : display.length === 0 ? (
            <div className="sch-empty">
              <p>No {tab} schedules found.</p>
            </div>
          ) : (
            <div className="sch-list">
              {display.map(s => (
                <div key={s.id} className={`sch-card ${s.status === "Today" ? "sch-card-today" : ""}`}>
                  <div className="sch-card-left">
                    <div className="sch-card-date">{s.date}</div>
                    <div className="sch-card-time">{s.shift_time}</div>
                    <StatusPill status={s.status} />
                  </div>

                  <div className="sch-card-center">
                    <div className="sch-route-visual">
                      <div className="sch-town sch-town-start">
                        <span className="sch-town-dot start" />
                        <span className="sch-town-name">{s.start_town}</span>
                      </div>
                      <div className="sch-route-line">
                        <IcoRoute />
                        <span className="sch-route-label">{s.route_name}</span>
                      </div>
                      <div className="sch-town sch-town-end">
                        <span className="sch-town-dot end" />
                        <span className="sch-town-name">{s.end_town}</span>
                      </div>
                    </div>
                    <div className="sch-bus-tag">
                      <IcoBus /> {s.bus}
                    </div>
                  </div>

                  <div className="sch-card-right">
                    {(s.status === "Today" || s.status === "Upcoming") && s.start_town !== "—" ? (
                      <button className="sch-start-btn" onClick={() => startShift(s)}>
                        <IcoPlay /> START SHIFT
                      </button>
                    ) : s.status === "Completed" ? (
                      <span className="sch-completed-badge"><IcoCheck /> Done</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
