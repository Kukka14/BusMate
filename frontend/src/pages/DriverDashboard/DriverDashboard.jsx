import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./DriverDashboard.css";
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area,
  Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, Brush,
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Behavior Analytics Card ───────────────────────────────────────────────────
const RANGE_OPTIONS = [
  { label: "7 Days",  value: "7d"  },
  { label: "30 Days", value: "30d" },
  { label: "90 Days", value: "90d" },
];

const STATE_COLOR = { stable: "#22c55e", unstable: "#f59e0b", erratic: "#ef4444" };

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dd-chart-tooltip">
      <p className="dd-chart-tooltip-title">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: "2px 0", fontSize: "0.72rem" }}>
          {p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(3) : p.value}</strong>
        </p>
      ))}
    </div>
  );
}

function EmotionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dd-chart-tooltip">
      <p className="dd-chart-tooltip-title">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.fill, margin: "2px 0", fontSize: "0.72rem" }}>
          {p.name}: <strong>{((p.value || 0) * 100).toFixed(1)}%</strong>
        </p>
      ))}
    </div>
  );
}

function BehaviorAnalyticsCard({ initialHistory, currentBVI }) {
  const [range, setRange]       = useState("30d");
  const [history, setHistory]   = useState(initialHistory || []);
  const [loading, setLoading]   = useState(false);
  const [chartTab, setChartTab] = useState("bvi");

  async function fetchRange(r) {
    setRange(r);
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res  = await fetch(`${API}/api/driver/analytics?range=${r}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setHistory(data.history || []);
    } finally {
      setLoading(false);
    }
  }

  // Thin data for large ranges so labels don't overlap
  const displayData = history.length > 30
    ? history.filter((_, i) => i % 3 === 0)
    : history;

  const latest = history[history.length - 1] || {};
  const bviState = latest.state || "stable";
  const gaugeColor = STATE_COLOR[bviState] || "#22c55e";
  const bviPct = Math.min(100, Math.round((latest.bvi_score || 0) * 100));

  const metrics = [
    { label: "Distraction Idx", pct: Math.round((latest.transition_rate || 0) * 100), color: "#38bdf8" },
    { label: "Aggression Idx",  pct: Math.round((latest.angry     || 0) * 100),       color: "#f87171" },
    { label: "Fatigue Level",   pct: Math.round(((latest.sad || 0) + (latest.fearful || 0)) * 100), color: "#a78bfa" },
  ];

  // Summary stats over window
  const avgBVI  = history.length ? (history.reduce((a, r) => a + r.bvi_score, 0) / history.length).toFixed(3) : "—";
  const maxBVI  = history.length ? Math.max(...history.map(r => r.bvi_score)).toFixed(3) : "—";
  const erratic = history.filter(r => r.state === "erratic").length;

  return (
    <div className="dd-card dd-analytics-card">
      {/* ── Header ── */}
      <div className="dd-card-head dd-analytics-head">
        <div className="dd-analytics-title-group">
          <span className="dd-analytics-title">Behavioral Volatility Index — Analysis</span>
          <span className={`dd-card-badge ${bviState === "stable" ? "green" : bviState === "unstable" ? "yellow" : "red"}`}>
            {bviState === "stable" ? "Low Risk" : bviState === "unstable" ? "Caution" : "High Risk"}
          </span>
        </div>
        {/* Range picker */}
        <div className="dd-range-tabs">
          {RANGE_OPTIONS.map(o => (
            <button
              key={o.value}
              className={`dd-range-tab ${range === o.value ? "active" : ""}`}
              onClick={() => fetchRange(o.value)}
            >{o.label}</button>
          ))}
        </div>
      </div>

      {/* ── Summary stats strip ── */}
      <div className="dd-analytics-summary">
        <div className="dd-analytics-stat">
          <span className="dd-analytics-stat-val" style={{ color: gaugeColor }}>
            {(latest.bvi_score || 0).toFixed(3)}
          </span>
          <span className="dd-analytics-stat-lbl">Latest BVI</span>
        </div>
        <div className="dd-analytics-divider" />
        <div className="dd-analytics-stat">
          <span className="dd-analytics-stat-val">{avgBVI}</span>
          <span className="dd-analytics-stat-lbl">Period Avg</span>
        </div>
        <div className="dd-analytics-divider" />
        <div className="dd-analytics-stat">
          <span className="dd-analytics-stat-val" style={{ color: "#ef4444" }}>{maxBVI}</span>
          <span className="dd-analytics-stat-lbl">Peak BVI</span>
        </div>
        <div className="dd-analytics-divider" />
        <div className="dd-analytics-stat">
          <span className="dd-analytics-stat-val" style={{ color: "#f87171" }}>{erratic}</span>
          <span className="dd-analytics-stat-lbl">Erratic Days</span>
        </div>
        <div className="dd-analytics-divider" />
        <div className="dd-analytics-stat">
          <span className="dd-analytics-stat-val">{history.length}</span>
          <span className="dd-analytics-stat-lbl">Shifts Analyzed</span>
        </div>
      </div>

      {/* ── Chart tab selector ── */}
      <div className="dd-chart-tabs">
        <button className={`dd-chart-tab ${chartTab === "bvi" ? "active" : ""}`} onClick={() => setChartTab("bvi")}>BVI Trend</button>
        <button className={`dd-chart-tab ${chartTab === "emotion" ? "active" : ""}`} onClick={() => setChartTab("emotion")}>Emotion Breakdown</button>
      </div>

      {/* ── Charts ── */}
      <div className="dd-charts-body">
        {/* Left: main chart */}
        <div className="dd-chart-main">
          {loading ? (
            <div className="dd-chart-loading"><div className="dd-spinner" /></div>
          ) : chartTab === "bvi" ? (
            <>
              <p className="dd-chart-hint">
                BVI score per shift · Green zone &lt;0.30 stable · Yellow 0.30–0.60 caution · Red &gt;0.60 erratic
              </p>
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart data={displayData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bviGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#38bdf8" stopOpacity={0.35}/>
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02}/>
                    </linearGradient>
                    <linearGradient id="trGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#a78bfa" stopOpacity={0.25}/>
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false}/>
                  <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false}/>
                  <YAxis domain={[0, 1]} tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => v.toFixed(1)}/>
                  <Tooltip content={<CustomTooltip />}/>
                  <Legend wrapperStyle={{ fontSize: "0.72rem", color: "#64748b", paddingTop: "4px" }}/>
                  {/* State zone bands */}
                  <ReferenceLine y={0.30} stroke="#22c55e" strokeDasharray="4 3" strokeOpacity={0.5}
                    label={{ value: "Stable", position: "insideTopLeft", fill: "#22c55e", fontSize: 9 }}/>
                  <ReferenceLine y={0.60} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.5}
                    label={{ value: "Caution", position: "insideTopLeft", fill: "#f59e0b", fontSize: 9 }}/>
                  <Area type="monotone" dataKey="bvi_score" name="BVI Score" stroke="#38bdf8"
                    strokeWidth={2} fill="url(#bviGrad)" dot={false} activeDot={{ r: 4, fill: "#38bdf8" }}/>
                  <Area type="monotone" dataKey="transition_rate" name="Transition Rate" stroke="#a78bfa"
                    strokeWidth={1.5} fill="url(#trGrad)" dot={false} strokeDasharray="4 2"/>
                  <Line type="monotone" dataKey="entropy" name="Entropy" stroke="#f59e0b"
                    strokeWidth={1.5} dot={false} strokeDasharray="2 3"/>
                  {history.length > 14 && <Brush dataKey="date" height={18} stroke="#1e293b" fill="#111827" travellerWidth={6}
                    startIndex={Math.max(0, displayData.length - 14)}
                    style={{ fontSize: "9px" }}/>}
                </ComposedChart>
              </ResponsiveContainer>
            </>
          ) : (
            <>
              <p className="dd-chart-hint">
                Emotion distribution per shift — shows how emotional states drive volatility over time
              </p>
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={displayData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <defs>
                    {[["angryG","#ef4444"],["fearfulG","#f97316"],["sadG","#a78bfa"],["neutralG","#64748b"],["happyG","#22c55e"]].map(([id, c]) => (
                      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={c} stopOpacity={0.6}/>
                        <stop offset="95%" stopColor={c} stopOpacity={0.05}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false}/>
                  <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false}/>
                  <YAxis domain={[0, 1]} tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${Math.round(v * 100)}%`}/>
                  <Tooltip content={<EmotionTooltip />}/>
                  <Legend wrapperStyle={{ fontSize: "0.72rem", color: "#64748b", paddingTop: "4px" }}/>
                  <Area type="monotone" stackId="1" dataKey="angry"   name="Angry"   stroke="#ef4444" fill="url(#angryG)"   strokeWidth={1.5}/>
                  <Area type="monotone" stackId="1" dataKey="fearful" name="Fearful" stroke="#f97316" fill="url(#fearfulG)" strokeWidth={1.5}/>
                  <Area type="monotone" stackId="1" dataKey="sad"     name="Sad"     stroke="#a78bfa" fill="url(#sadG)"     strokeWidth={1.5}/>
                  <Area type="monotone" stackId="1" dataKey="neutral" name="Neutral" stroke="#64748b" fill="url(#neutralG)" strokeWidth={1.5}/>
                  <Area type="monotone" stackId="1" dataKey="happy"   name="Happy"   stroke="#22c55e" fill="url(#happyG)"   strokeWidth={1.5}/>
                  {history.length > 14 && <Brush dataKey="date" height={18} stroke="#1e293b" fill="#111827" travellerWidth={6}
                    startIndex={Math.max(0, displayData.length - 14)}/>}
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}
        </div>

        {/* Right: current gauge + metric bars */}
        <div className="dd-chart-side">
          <p className="dd-chart-side-title">Latest Shift</p>
          <div className="dd-gauge-wrap">
            <GaugeCircle pct={bviPct} label={bviState === "stable" ? "Stable" : bviState === "unstable" ? "Moderate" : "Erratic"}
              sub={`BVI ${(latest.bvi_score || 0).toFixed(3)}`} color={gaugeColor}/>
          </div>
          <div className="dd-metrics">
            {metrics.map(m => (
              <div key={m.label} className="dd-metric-row">
                <span className="dd-metric-label">{m.label}</span>
                <div className="dd-metric-track">
                  <div className="dd-metric-fill" style={{ width: `${m.pct}%`, background: m.color }}/>
                </div>
                <span className="dd-metric-pct">{m.pct}%</span>
              </div>
            ))}
          </div>
          {/* Latest emotion breakdown mini-bars */}
          <div className="dd-emo-mini">
            {[
              { k: "happy",   label: "Happy",   c: "#22c55e" },
              { k: "neutral", label: "Neutral", c: "#64748b" },
              { k: "sad",     label: "Sad",     c: "#a78bfa" },
              { k: "angry",   label: "Angry",   c: "#ef4444" },
              { k: "fearful", label: "Fearful", c: "#f97316" },
            ].map(({ k, label, c }) => (
              <div key={k} className="dd-emo-row">
                <span className="dd-emo-dot" style={{ background: c }}/>
                <span className="dd-emo-label">{label}</span>
                <div className="dd-metric-track">
                  <div className="dd-metric-fill" style={{ width: `${Math.round((latest[k] || 0) * 100)}%`, background: c }}/>
                </div>
                <span className="dd-metric-pct">{Math.round((latest[k] || 0) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoHome    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IcoSched   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IcoStats   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const IcoUser    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IcoPin     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
const IcoWarn    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m10.29 3.86-8.31 14.38A1 1 0 0 0 2.86 20h16.28a1 1 0 0 0 .87-1.5L11.71 3.86a1 1 0 0 0-1.73 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const IcoShield  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IcoClock   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IcoFuel    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 22V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15"/><path d="m17 22V11l-4-4"/><path d="M13 7h4a2 2 0 0 1 2 2v3"/><line x1="3" y1="22" x2="19" y2="22"/></svg>;
const IcoPlay    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
const IcoLogout      = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IcoMonitorIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>;

// ── Gauge ─────────────────────────────────────────────────────────────────────
function GaugeCircle({ pct = 18, label = "Low", sub = "Volatility", color = "#22c55e" }) {
  const r = 50, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width="128" height="128" viewBox="0 0 128 128">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="10"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}/>
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#f1f5f9" fontSize="20" fontWeight="700" fontFamily="Inter,sans-serif">{label}</text>
      <text x={cx} y={cy + 15} textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="Inter,sans-serif">{sub}</text>
    </svg>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ active, onNav, onLogout, safetyTip }) {
  const navigate = useNavigate();
  const navItems = [
    { key: "home",     label: "Home",    Icon: IcoHome,  path: null              },
    { key: "monitor",  label: "Monitor", Icon: IcoMonitorIcon, path: "/driver/monitor" },
    { key: "schedule", label: "Schedule",Icon: IcoSched, path: null              },
    { key: "stats",    label: "Stats",   Icon: IcoStats, path: "/driver/stats"   },
    { key: "profile",  label: "Profile", Icon: IcoUser,  path: "/driver/profile" },
  ];
  return (
    <aside className="dd-sidebar">
      <div className="dd-logo">
        <div className="dd-logo-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M3 9h18"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/><path d="M5.5 16v2M18.5 16v2"/></svg>
        </div>
        <span>BusMate</span>
      </div>
      <nav className="dd-nav">
        {navItems.map(({ key, label, Icon, path }) => (
          <button
            key={key}
            className={`dd-nav-btn ${active === key ? "active" : ""}`}
            onClick={() => path ? navigate(path) : onNav(key)}
          >
            <Icon /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="dd-sidebar-foot">
        <div className="dd-tip-box">
          <span className="dd-tip-label">DRIVER SAFETY TIP</span>
          <p className="dd-tip-text">{safetyTip}</p>
        </div>
        <button className="dd-signout" onClick={onLogout}><IcoLogout />Sign Out</button>
      </div>
    </aside>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, Icon, color }) {
  return (
    <div className="dd-stat-card">
      <div className="dd-stat-icon" style={{ color, background: color + "18" }}><Icon /></div>
      <div>
        <div className="dd-stat-label">{label}</div>
        <div className="dd-stat-val">{value}</div>
      </div>
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const map = {
    Upcoming:  ["rgba(37,99,235,0.15)",  "#60a5fa"],
    Scheduled: ["rgba(139,92,246,0.15)", "#a78bfa"],
    "Day Off": ["rgba(100,116,139,0.1)", "#64748b"],
    Completed: ["rgba(34,197,94,0.12)",  "#4ade80"],
  };
  const [bg, clr] = map[status] || map.Scheduled;
  return <span className="dd-pill" style={{ background: bg, color: clr }}>{status}</span>;
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function DriverDashboard() {
  const navigate = useNavigate();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [navKey, setNavKey]     = useState("home");
  const [shiftActive, setShift] = useState(false);
  const [shiftLoading, setShiftLoading] = useState(false);
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }
    fetch(`${API}/api/driver/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else { setData(d); setShift(d.shift?.shift_active || false); }
      })
      .catch(() => setError("Failed to load dashboard data."))
      .finally(() => setLoading(false));
  }, [navigate]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  async function toggleShift() {
    setShiftLoading(true);
    const token = localStorage.getItem("token");
    const ep = shiftActive ? "stop" : "start";
    try {
      const r = await fetch(`${API}/api/driver/shift/${ep}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setShift(!shiftActive);
    } finally {
      setShiftLoading(false);
    }
  }

  if (loading) return (
    <div className="dd-loading">
      <div className="dd-spinner" />
      <p>Loading your dashboard…</p>
    </div>
  );

  if (error) return (
    <div className="dd-error-screen">
      <p>{error}</p>
      <button onClick={logout}>Back to Login</button>
    </div>
  );

  const d      = data || {};
  const stats  = d.stats || {};
  const bvi    = d.behavioral_volatility_index || {};
  const route  = d.route_performance || {};
  const events = d.safety_events || [];
  const sched  = d.schedule || [];
  const shift  = d.shift || {};

  return (
    <div className="dd-root">
      <Sidebar
        active={navKey}
        onNav={setNavKey}
        onLogout={logout}
        safetyTip={d.safety_tip || "Always maintain a safe following distance."}
      />

      <main className="dd-main">
        {/* ── Top bar ──────────────────────────────────────────────── */}
        <header className="dd-topbar">
          <span className="dd-topbar-title">Driver Portal</span>
          <div className="dd-topbar-right">
            <div className="dd-driver-info">
              <span className="dd-driver-name">{d.driver_name || user.username || "Driver"}</span>
              <span className="dd-driver-id">ID: {d.driver_id || "DRV-001"}</span>
            </div>
            <div className="dd-active-pill">
              <span className="dd-active-dot" />
              ACTIVE STATUS
            </div>
            <div className="dd-avatar">{(d.driver_name || user.username || "D")[0].toUpperCase()}</div>
          </div>
        </header>

        <div className="dd-content">
          {/* ── Welcome + Stat cards ─────────────────────────────── */}
          <div className="dd-welcome-row">
            <div>
              <h1 className="dd-welcome-h1">Welcome back, {(d.driver_name || user.username || "Driver").split(" ")[0]}!</h1>
              <p className="dd-welcome-sub">Here's your performance summary for today.</p>
            </div>
          </div>
          <div className="dd-stats-row">
            <StatCard label="Total Distance" value={`${(stats.total_distance_km || 0).toLocaleString()} km`} Icon={IcoPin} color="#38bdf8" />
            <StatCard label="Safety Alerts"  value={stats.safety_alerts ?? 0} Icon={IcoWarn} color="#f59e0b" />
            <StatCard label="Risk Score"     value={`${stats.risk_score ?? 0}/100`} Icon={IcoShield} color="#4ade80" />
          </div>

          {/* ── Road Scene Analysis quick links ───────────────────── */}
          <div className="dd-card dd-rsa-card">
            <div className="dd-card-head">
              <span>Road Scene Analysis</span>
              <span className="dd-card-badge green">Quick Access</span>
            </div>
            <p className="dd-rsa-sub">Open the Road Scene tools directly from your dashboard.</p>
            <div className="dd-rsa-actions">
              <button className="dd-rsa-btn" onClick={() => navigate("/road-scene?mode=image")}>🖼 Image Analysis</button>
              <button className="dd-rsa-btn" onClick={() => navigate("/road-scene?mode=video")}>🎥 Video Analysis</button>
              <button className="dd-rsa-btn" onClick={() => navigate("/road-scene/hazard")}>🗺 Hazard Analyser</button>
            </div>
          </div>

          {/* ── Shift banner ─────────────────────────────────────── */}
          <div className={`dd-shift-banner ${shiftActive ? "active" : ""}`}>
            <div className="dd-shift-left">
              <div className="dd-shift-title">{shiftActive ? "Shift in Progress" : "Shift Check-In"}</div>
              <div className="dd-shift-tags">
                <span className="dd-tag"><IcoPin /> {shift.vehicle || "TK-2847"}</span>
                <span className="dd-tag"><IcoClock /> {shift.route || "Route 42 – City Express"}</span>
              </div>
            </div>
            <button className="dd-shift-btn" onClick={toggleShift} disabled={shiftLoading}>
              {shiftLoading ? "…" : (<><IcoPlay /> {shiftActive ? "END SHIFT" : "START SHIFT"}</>)}
            </button>
          </div>

          {/* ── Behavioral Analytics (full width) ────────────── */}
          <BehaviorAnalyticsCard
            initialHistory={bvi.history || []}
            currentBVI={bvi}
          />

          {/* ── 2-col cards ──────────────────────────────────────── */}
          <div className="dd-cards-row dd-cards-row-2">
            {/* Route Performance card */}
            <div className="dd-card">
              <div className="dd-card-head"><span>Route Performance Summary</span></div>
              <div className="dd-route-kpis">
                <div className="dd-route-kpi">
                  <span className="dd-route-kpi-val">{route.schedule_adherence ?? "94"}%</span>
                  <span className="dd-route-kpi-label">Schedule Adherence</span>
                </div>
                <div className="dd-route-kpi">
                  <span className="dd-route-kpi-val">{route.fuel_efficiency ?? "8.2"}<small> L/100km</small></span>
                  <span className="dd-route-kpi-label">Fuel Efficiency</span>
                </div>
              </div>
              <div className="dd-map-mock">
                <svg width="100%" height="100%" viewBox="0 0 320 140" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.8"/>
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.8"/>
                    </linearGradient>
                  </defs>
                  {[20,50,80,110].map(y => <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="#1e293b" strokeWidth="1"/>)}
                  {[40,80,120,160,200,240,280].map(x => <line key={x} x1={x} y1="0" x2={x} y2="140" stroke="#1e293b" strokeWidth="1"/>)}
                  <path d="M20,110 Q60,80 100,65 T180,45 T260,30 T300,25" fill="none" stroke="url(#routeGrad)" strokeWidth="3" strokeLinecap="round"/>
                  {[[20,110],[100,65],[180,45],[260,30],[300,25]].map(([x,y],i) => (
                    <circle key={i} cx={x} cy={y} r={i===0||i===4?5:3} fill={i===0?"#4ade80":i===4?"#38bdf8":"#f1f5f9"} stroke="#0f1623" strokeWidth="1.5"/>
                  ))}
                  <text x="20" y="128" fill="#64748b" fontSize="9" fontFamily="Inter,sans-serif">Start</text>
                  <text x="285" y="22" fill="#64748b" fontSize="9" fontFamily="Inter,sans-serif">End</text>
                </svg>
              </div>
              <div className="dd-route-foot">
                <span><IcoFuel /> Fuel used: {route.fuel_used ?? "38.4"} L</span>
                <span><IcoClock /> Avg delay: {route.avg_delay ?? "3"} min</span>
              </div>
            </div>

            {/* Safety Events card */}
            <div className="dd-card">
              <div className="dd-card-head"><span>Recent Safety Events</span>
                <span className="dd-card-badge yellow">{events.length || 3} Events</span>
              </div>
              <ul className="dd-events-list">
                {(events.length ? events : [
                  { type:"warning", label:"Distraction Detected", time:"09:14 AM", detail:"Phone usage detected" },
                  { type:"danger",  label:"Microsleep Warning",   time:"11:32 AM", detail:"Eye closure 2.1s" },
                  { type:"info",    label:"Harsh Brake Mitigated",time:"02:05 PM", detail:"Collision avoided" },
                ]).map((ev, i) => (
                  <li key={i} className={`dd-event-item ${ev.type || "info"}`}>
                    <div className="dd-event-icon-wrap">
                      {ev.type === "danger" ? <IcoWarn /> : ev.type === "warning" ? <IcoWarn /> : <IcoShield />}
                    </div>
                    <div className="dd-event-body">
                      <span className="dd-event-label">{ev.label}</span>
                      <span className="dd-event-detail">{ev.detail}</span>
                    </div>
                    <span className="dd-event-time">{ev.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Schedule table ───────────────────────────────────── */}
          <div className="dd-card dd-table-card">
            <div className="dd-card-head"><span>Upcoming Schedule</span></div>
            <div className="dd-table-wrap">
              <table className="dd-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Shift Time</th><th>Route</th><th>Vehicle</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(sched.length ? sched : [
                    { date:"Mon, Jul 7",  time:"06:00–14:00", route:"Route 42", vehicle:"TK-2847", status:"Upcoming"  },
                    { date:"Tue, Jul 8",  time:"06:00–14:00", route:"Route 18", vehicle:"TK-2847", status:"Scheduled" },
                    { date:"Wed, Jul 9",  time:"—",           route:"—",        vehicle:"—",        status:"Day Off"  },
                    { date:"Thu, Jul 10", time:"14:00–22:00", route:"Route 7",  vehicle:"TK-1193", status:"Scheduled" },
                  ]).map((row, i) => (
                    <tr key={i}>
                      <td>{row.date}</td>
                      <td>{row.time}</td>
                      <td>{row.route}</td>
                      <td>{row.vehicle}</td>
                      <td><StatusPill status={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}


