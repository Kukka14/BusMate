import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area,
  Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, Brush,
} from "recharts";
import "./DriverProfile.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoHome    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IcoMonitor = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoSched   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IcoStats   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const IcoUser    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IcoLogout  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IcoEdit    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IcoMsg     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
const IcoWarn    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const IcoShield  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IcoCar     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17H3a2 2 0 01-2-2V9a2 2 0 012-2h2"/><rect x="9" y="3" width="6" height="6" rx="1"/><path d="M18 7h1a2 2 0 012 2v6a2 2 0 01-2 2h-2"/><path d="M1 17l3-3 3 3"/><path d="M23 17l-3-3-3 3"/></svg>;
const IcoChevron = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>;
const IcoRoute   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>;
const IcoClock   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IcoAlert   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;

const STATE_COLOR    = { stable: "#22c55e", unstable: "#f59e0b", erratic: "#ef4444" };
const RANGE_OPTIONS  = [
  { label: "7 Days",  value: "7d"  },
  { label: "30 Days", value: "30d" },
  { label: "90 Days", value: "90d" },
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dp-chart-tooltip">
      <p className="dp-chart-tooltip-title">{label}</p>
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
    <div className="dp-chart-tooltip">
      <p className="dp-chart-tooltip-title">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.fill, margin: "2px 0", fontSize: "0.72rem" }}>
          {p.name}: <strong>{((p.value || 0) * 100).toFixed(1)}%</strong>
        </p>
      ))}
    </div>
  );
}

function GaugeCircle({ pct = 18, label = "Low", sub = "Volatility", color = "#22c55e" }) {
  const r = 50, cx = 64, cy = 64;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width="128" height="128" viewBox="0 0 128 128">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="10"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}/>
      <text x={cx} y={cy - 6} textAnchor="middle" fill={color}
        fontSize="18" fontWeight="700" fontFamily="Inter,sans-serif">{pct}%</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="#e2e8f0"
        fontSize="10" fontFamily="Inter,sans-serif">{label}</text>
      <text x={cx} y={cy + 27} textAnchor="middle" fill="#475569"
        fontSize="8.5" fontFamily="Inter,sans-serif">{sub}</text>
    </svg>
  );
}

function ProfileBVICard({ initialHistory, currentBVI }) {
  const [range, setRange]       = useState("30d");
  const [history, setHistory]   = useState(initialHistory || []);
  const [loading, setLoading]   = useState(false);
  const [chartTab, setChartTab] = useState("bvi");

  async function fetchRange(r) {
    setRange(r); setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res  = await fetch(`${API}/api/driver/analytics?range=${r}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setHistory(data.history || []);
    } finally { setLoading(false); }
  }

  const displayData = history.length > 30
    ? history.filter((_, i) => i % 3 === 0)
    : history;

  const latest     = history[history.length - 1] || {};
  const bviState   = latest.state || "stable";
  const gaugeColor = STATE_COLOR[bviState] || "#22c55e";
  const bviPct     = Math.min(100, Math.round((latest.bvi_score || 0) * 100));

  const metrics = [
    { label: "Distraction Idx", pct: Math.round((latest.transition_rate || 0) * 100), color: "#38bdf8" },
    { label: "Aggression Idx",  pct: Math.round((latest.angry     || 0) * 100),       color: "#f87171" },
    { label: "Fatigue Level",   pct: Math.round(((latest.sad || 0) + (latest.fearful || 0)) * 100), color: "#a78bfa" },
  ];

  const avgBVI  = history.length ? (history.reduce((a, r) => a + r.bvi_score, 0) / history.length).toFixed(3) : "—";
  const maxBVI  = history.length ? Math.max(...history.map(r => r.bvi_score)).toFixed(3) : "—";
  const erratic = history.filter(r => r.state === "erratic").length;

  return (
    <div className="dp-card dp-analytics-card">
      {/* Header */}
      <div className="dp-analytics-head">
        <div className="dp-analytics-title-group">
          <span className="dp-analytics-title">Behavioral Volatility Index — Analysis</span>
          <span className={`dp-badge ${bviState === "stable" ? "green" : bviState === "unstable" ? "yellow" : "red"}`}>
            {bviState === "stable" ? "Low Risk" : bviState === "unstable" ? "Caution" : "High Risk"}
          </span>
        </div>
        <div className="dp-range-tabs">
          {RANGE_OPTIONS.map(o => (
            <button key={o.value}
              className={`dp-range-tab ${range === o.value ? "active" : ""}`}
              onClick={() => fetchRange(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>

      {/* Summary stats strip */}
      <div className="dp-analytics-summary">
        {[
          { val: (latest.bvi_score || 0).toFixed(3), lbl: "Latest BVI",     color: gaugeColor },
          { val: avgBVI,                              lbl: "Period Avg"                        },
          { val: maxBVI,                              lbl: "Peak BVI",       color: "#ef4444"  },
          { val: erratic,                             lbl: "Erratic Days",   color: "#f87171"  },
          { val: history.length,                      lbl: "Shifts Analyzed"                  },
        ].map(({ val, lbl, color }) => (
          <React.Fragment key={lbl}>
            <div className="dp-analytics-stat">
              <span className="dp-analytics-stat-val" style={color ? { color } : {}}>{val}</span>
              <span className="dp-analytics-stat-lbl">{lbl}</span>
            </div>
            <div className="dp-analytics-divider"/>
          </React.Fragment>
        ))}
      </div>

      {/* Chart tab selector */}
      <div className="dp-chart-tabs">
        <button className={`dp-chart-tab ${chartTab === "bvi" ? "active" : ""}`} onClick={() => setChartTab("bvi")}>BVI Trend</button>
        <button className={`dp-chart-tab ${chartTab === "emotion" ? "active" : ""}`} onClick={() => setChartTab("emotion")}>Emotion Breakdown</button>
      </div>

      {/* Charts body */}
      <div className="dp-charts-body">
        <div className="dp-chart-main">
          {loading ? (
            <div className="dp-chart-loading"><div className="dp-spinner"/></div>
          ) : chartTab === "bvi" ? (
            <>
              <p className="dp-chart-hint">BVI score per shift · Green &lt;0.30 stable · Yellow 0.30–0.60 caution · Red &gt;0.60 erratic</p>
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart data={displayData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dpBviGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#38bdf8" stopOpacity={0.35}/>
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02}/>
                    </linearGradient>
                    <linearGradient id="dpTrGrad" x1="0" y1="0" x2="0" y2="1">
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
                  <ReferenceLine y={0.30} stroke="#22c55e" strokeDasharray="4 3" strokeOpacity={0.5}
                    label={{ value: "Stable", position: "insideTopLeft", fill: "#22c55e", fontSize: 9 }}/>
                  <ReferenceLine y={0.60} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.5}
                    label={{ value: "Caution", position: "insideTopLeft", fill: "#f59e0b", fontSize: 9 }}/>
                  <Area type="monotone" dataKey="bvi_score" name="BVI Score" stroke="#38bdf8"
                    strokeWidth={2} fill="url(#dpBviGrad)" dot={false} activeDot={{ r: 4, fill: "#38bdf8" }}/>
                  <Area type="monotone" dataKey="transition_rate" name="Transition Rate" stroke="#a78bfa"
                    strokeWidth={1.5} fill="url(#dpTrGrad)" dot={false} strokeDasharray="4 2"/>
                  <Line type="monotone" dataKey="entropy" name="Entropy" stroke="#f59e0b"
                    strokeWidth={1.5} dot={false} strokeDasharray="2 3"/>
                  {history.length > 14 && <Brush dataKey="date" height={18} stroke="#1e293b" fill="#111827" travellerWidth={6}
                    startIndex={Math.max(0, displayData.length - 14)} style={{ fontSize: "9px" }}/>}
                </ComposedChart>
              </ResponsiveContainer>
            </>
          ) : (
            <>
              <p className="dp-chart-hint">Emotion distribution per shift — how emotional states drive volatility over time</p>
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={displayData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <defs>
                    {[["dpAngryG","#ef4444"],["dpFearG","#f97316"],["dpSadG","#a78bfa"],["dpNeutG","#64748b"],["dpHappyG","#22c55e"]].map(([id, c]) => (
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
                  <Area type="monotone" stackId="1" dataKey="angry"   name="Angry"   stroke="#ef4444" fill="url(#dpAngryG)" strokeWidth={1.5}/>
                  <Area type="monotone" stackId="1" dataKey="fearful" name="Fearful" stroke="#f97316" fill="url(#dpFearG)"  strokeWidth={1.5}/>
                  <Area type="monotone" stackId="1" dataKey="sad"     name="Sad"     stroke="#a78bfa" fill="url(#dpSadG)"   strokeWidth={1.5}/>
                  <Area type="monotone" stackId="1" dataKey="neutral" name="Neutral" stroke="#64748b" fill="url(#dpNeutG)"  strokeWidth={1.5}/>
                  <Area type="monotone" stackId="1" dataKey="happy"   name="Happy"   stroke="#22c55e" fill="url(#dpHappyG)" strokeWidth={1.5}/>
                  {history.length > 14 && <Brush dataKey="date" height={18} stroke="#1e293b" fill="#111827" travellerWidth={6}
                    startIndex={Math.max(0, displayData.length - 14)}/>}
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}
        </div>

        {/* Right: gauge + metrics */}
        <div className="dp-chart-side">
          <p className="dp-chart-side-title">Latest Shift</p>
          <div className="dp-gauge-wrap">
            <GaugeCircle pct={bviPct}
              label={bviState === "stable" ? "Stable" : bviState === "unstable" ? "Moderate" : "Erratic"}
              sub={`BVI ${(latest.bvi_score || 0).toFixed(3)}`}
              color={gaugeColor}/>
          </div>
          <div className="dp-metrics">
            {metrics.map(m => (
              <div key={m.label} className="dp-metric-row">
                <span className="dp-metric-label">{m.label}</span>
                <div className="dp-metric-track">
                  <div className="dp-metric-fill" style={{ width: `${m.pct}%`, background: m.color }}/>
                </div>
                <span className="dp-metric-pct">{m.pct}%</span>
              </div>
            ))}
          </div>
          <div className="dp-emo-mini">
            {[
              { k: "happy",   label: "Happy",   c: "#22c55e" },
              { k: "neutral", label: "Neutral", c: "#64748b" },
              { k: "sad",     label: "Sad",     c: "#a78bfa" },
              { k: "angry",   label: "Angry",   c: "#ef4444" },
              { k: "fearful", label: "Fearful", c: "#f97316" },
            ].map(({ k, label, c }) => (
              <div key={k} className="dp-emo-row">
                <span className="dp-emo-dot" style={{ background: c }}/>
                <span className="dp-emo-label">{label}</span>
                <div className="dp-metric-track">
                  <div className="dp-metric-fill" style={{ width: `${Math.round((latest[k] || 0) * 100)}%`, background: c }}/>
                </div>
                <span className="dp-metric-pct">{Math.round((latest[k] || 0) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {currentBVI?.system_insight && (
        <div className="dp-insight-box">
          <IcoAlert />
          <p><strong>System Insight:</strong> {currentBVI.system_insight}</p>
        </div>
      )}
    </div>
  );
}

// ── Sidebar (shared with DriverDashboard) ─────────────────────────────────────
function Sidebar({ onLogout }) {
  const navigate = useNavigate();
  const navItems = [
    { key: "home",    label: "Home",     Icon: IcoHome,    path: "/driver/dashboard" },
    { key: "monitor", label: "Monitor",  Icon: IcoMonitor, path: "/driver/monitor"  },
    { key: "stats",   label: "Stats",    Icon: IcoStats,   path: null               },
    { key: "profile", label: "Profile",  Icon: IcoUser,    path: "/driver/profile"  },
  ];
  return (
    <aside className="dp-sidebar">
      <div className="dp-logo">
        <div className="dp-logo-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <span>DriveGuard</span>
      </div>
      <nav className="dp-nav">
        {navItems.map(({ key, label, Icon, path }) => (
          <button key={key}
            className={`dp-nav-btn ${key === "profile" ? "active" : ""}`}
            onClick={() => path && navigate(path)}>
            <Icon /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="dp-sidebar-foot">
        <button className="dp-signout" onClick={onLogout}><IcoLogout />Sign Out</button>
      </div>
    </aside>
  );
}

// ── Risk Exposure Gauge ───────────────────────────────────────────────────────
function RiskGauge({ level, label }) {
  const color = level === "Low" ? "#22c55e" : level === "Medium" ? "#f59e0b" : "#ef4444";
  const pct   = level === "Low" ? 0.22 : level === "Medium" ? 0.55 : 0.85;
  const r = 54, cx = 70, cy = 70, circ = 2 * Math.PI * r;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="10"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}/>
      <text x={cx} y={cy - 6} textAnchor="middle" fill={color}
        fontSize="20" fontWeight="700" fontFamily="Inter,sans-serif">{level}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#64748b"
        fontSize="9.5" fontFamily="Inter,sans-serif">{label}</text>
    </svg>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ label, value, max, suffix = "%" }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct > 80 ? "#22c55e" : pct > 50 ? "#38bdf8" : "#f59e0b";
  return (
    <div className="dp-pbar-row">
      <div className="dp-pbar-top">
        <span className="dp-pbar-label">{label}</span>
        <span className="dp-pbar-val" style={{ color }}>{value}{suffix}</span>
      </div>
      <div className="dp-pbar-track">
        <div className="dp-pbar-fill" style={{ width: `${pct}%`, background: color }}/>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DriverProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }
    fetch(`${API}/api/driver/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setProfile(d); })
      .catch(() => setError("Failed to load profile."))
      .finally(() => setLoading(false));
  }, [navigate]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  if (loading) return (
    <div className="dp-loading"><div className="dp-spinner"/><p>Loading profile…</p></div>
  );
  if (error) return (
    <div className="dp-error"><p>{error}</p><button onClick={logout}>Back to Login</button></div>
  );

  const p      = profile || {};
  const bvi    = p.bvi   || {};
  const stats  = p.stats || {};
  const risk   = p.risk  || {};
  const route  = p.route_performance || {};
  const events = p.events || [];
  const sched  = p.schedule || [];

  const bviColor = STATE_COLOR[bvi.state] || "#64748b";
  const initials = (p.username || "D").split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2);

  return (
    <div className="dp-root">
      <Sidebar onLogout={logout} />

      <main className="dp-main">
        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <header className="dp-topbar">
          <nav className="dp-breadcrumb">
            <span onClick={() => navigate("/driver/dashboard")} className="dp-breadcrumb-link">Dashboard</span>
            <span className="dp-breadcrumb-sep">›</span>
            <span>Drivers</span>
            <span className="dp-breadcrumb-sep">›</span>
            <span>Vehicles</span>
            <span className="dp-breadcrumb-sep">›</span>
            <span>Reports</span>
          </nav>
          <div className="dp-topbar-right">
            <div className="dp-notification"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg></div>
            <div className="dp-avatar-sm">{initials}</div>
          </div>
        </header>

        <div className="dp-content">
          <h1 className="dp-page-title">Individual Driver Analytics</h1>

          {/* ── Driver hero card ─────────────────────────────────────── */}
          <div className="dp-hero-card">
            <div className="dp-hero-left">
              <div className="dp-avatar-lg">{initials}</div>
              <div className="dp-hero-info">
                <div className="dp-hero-name-row">
                  <h2 className="dp-hero-name">{p.username || user.username || "Driver"}</h2>
                  <span className="dp-online-badge">ONLINE</span>
                </div>
                <p className="dp-hero-sub">
                  ID: {p.driver_id || "BM-00001"} &nbsp;·&nbsp; {p.vehicle || "Volvo BSR #402"}
                </p>
                <div className="dp-hero-tags">
                  <span className="dp-hero-tag"><IcoRoute /> {p.route || "Route 42 – Downtown Loop"}</span>
                  <span className="dp-hero-tag"><IcoClock /> Shift: {p.shift || "08:00 – 16:00"}</span>
                </div>
              </div>
            </div>
            <div className="dp-hero-actions">
              <button className="dp-btn-outline"><IcoMsg /> Message</button>
              <button className="dp-btn-primary"><IcoEdit /> Edit Profile</button>
            </div>
          </div>

          {/* ── Stat cards ───────────────────────────────────────────── */}
          <div className="dp-stats-row">
            {[
              { label: "TOTAL DISTANCE",    value: `${(stats.total_distance_km || 0).toLocaleString()} km`,  sub: "+62% vs last month",   color: "#38bdf8", up: true  },
              { label: "AVG FUEL ECONOMY",  value: `${stats.avg_fuel_economy || "—"} km/L`,                  sub: "-5.2% efficiency",      color: "#a78bfa", up: false },
              { label: "SAFETY EVENTS",     value: stats.safety_events ?? "—",                                sub: "-3 events improved",    color: "#f59e0b", up: true  },
              { label: "SAFETY SCORE",      value: `${stats.safety_score ?? "—"}/100`,                       sub: "Overall performance",   color: "#22c55e", up: true  },
            ].map(({ label, value, sub, color, up }) => (
              <div key={label} className="dp-stat-card">
                <span className="dp-stat-label">{label}</span>
                <span className="dp-stat-val" style={{ color }}>{value}</span>
                <span className={`dp-stat-sub ${up ? "up" : "down"}`}>{sub}</span>
              </div>
            ))}
          </div>

          {/* ── BVI Analytics Card (full-width, matches dashboard) ──────── */}
          <ProfileBVICard initialHistory={bvi.history || []} currentBVI={bvi}/>

          {/* ── In-Cabin Event Log ────────────────────────────────────── */}
          <div className="dp-card dp-events-card">
            <div className="dp-card-head">
              <div>
                <span className="dp-card-title">In-Cabin Event Log</span>
                <span className="dp-card-hint">Timeline of AI detected distraction and drowsiness</span>
              </div>
              <div className="dp-event-tabs">
                <button className="dp-etab active">Today</button>
                <button className="dp-etab">Weekly View</button>
              </div>
            </div>
            <ul className="dp-event-list">
              {events.map((ev, i) => (
                <li key={i} className={`dp-event-item ${ev.type}`}>
                  <div className="dp-event-icon-wrap">
                    {ev.type === "danger"  ? <IcoWarn />   :
                     ev.type === "warning" ? <IcoWarn />   :
                                            <IcoShield />}
                  </div>
                  <div className="dp-event-body">
                    <span className="dp-event-label">{ev.label}</span>
                    <span className="dp-event-detail">{ev.detail}</span>
                  </div>
                  <div className="dp-event-right">
                    <span className="dp-event-time">{ev.time}</span>
                    <button className="dp-event-link">Review Footage ›</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Route Performance + Risk Exposure + Upcoming Schedule ──── */}
          <div className="dp-bottom-row">

            {/* Risk Exposure */}
            <div className="dp-card dp-risk-card">
              <span className="dp-card-title">Risk Exposure</span>
              <span className="dp-card-hint" style={{ display:"block", marginBottom: "0.75rem" }}>Aggregated risk profile</span>
              <div className="dp-risk-gauge-wrap">
                <RiskGauge level={risk.level || "Low"} label={risk.label || "SAFE ZONE"}/>
              </div>
              <div className="dp-risk-metrics">
                <div className="dp-risk-row">
                  <span className="dp-risk-label">Harsh Braking</span>
                  <div className="dp-risk-track">
                    <div className="dp-risk-fill" style={{ width: `${Math.min(100,(risk.harsh_braking||0)*100)}%`, background:"#f59e0b" }}/>
                  </div>
                  <span className="dp-risk-val">{risk.harsh_braking ?? "—"} / 100km</span>
                </div>
                <div className="dp-risk-row">
                  <span className="dp-risk-label">Speeding Incidents</span>
                  <div className="dp-risk-track">
                    <div className="dp-risk-fill" style={{ width: `${Math.min(100,(risk.speeding_incidents||0)*200)}%`, background:"#ef4444" }}/>
                  </div>
                  <span className="dp-risk-val">{risk.speeding_incidents ?? "—"} / 100km</span>
                </div>
              </div>
            </div>

            {/* Route Performance */}
            <div className="dp-card">
              <span className="dp-card-title">Route Performance</span>
              <span className="dp-card-hint" style={{ display:"block", marginBottom: "1rem" }}>Schedule adherence &amp; comfort metrics</span>
              <ProgressBar label="Schedule Adherence"      value={route.schedule_adherence     || 0} max={100} suffix="%"/>
              <ProgressBar label="Passenger Comfort Score" value={route.passenger_comfort_score || 0} max={10}  suffix="/10"/>
            </div>

            {/* Upcoming Schedule */}
            <div className="dp-card">
              <span className="dp-card-title">Upcoming Schedule</span>
              <span className="dp-card-hint" style={{ display:"block", marginBottom: "1rem" }}>Next sessions</span>
              <ul className="dp-schedule-list">
                {sched.map((s, i) => (
                  <li key={i} className="dp-schedule-item">
                    <div className="dp-schedule-date">{s.date}</div>
                    <div className="dp-schedule-info">
                      <span className="dp-schedule-label">{s.label}</span>
                      <span className="dp-schedule-route">{s.route}</span>
                    </div>
                    <button className="dp-schedule-arrow"><IcoChevron /></button>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
