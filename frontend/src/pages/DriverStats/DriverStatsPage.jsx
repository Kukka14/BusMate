import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, Cell, PieChart, Pie,
} from "recharts";
import "./DriverStats.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const TIER_COLOR = {
  Elite:            "#22c55e",
  Safe:             "#38bdf8",
  "Needs Attention":"#f59e0b",
  "At Risk":        "#f97316",
  "High Risk":      "#ef4444",
};
const EMOTION_COLOR = {
  happy:    "#22c55e",
  neutral:  "#64748b",
  sad:      "#a78bfa",
  angry:    "#ef4444",
  fearful:  "#f97316",
  surprised:"#f59e0b",
  disgust:  "#84cc16",
  disgusted:"#84cc16",
  no_face:  "#334155",
};

function bviColor(s) {
  if (s == null) return "#475569";
  if (s < 0.30)  return "#22c55e";
  if (s < 0.60)  return "#f59e0b";
  return "#ef4444";
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoHome    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IcoMonitor = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoStats   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const IcoUser    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IcoLogout  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IcoShield  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IcoTrend   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>;
const IcoBrain   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.51-2.07A3 3 0 1 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.51-2.07A3 3 0 1 0 14.5 2Z"/></svg>;
const IcoCamera  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
const IcoAlert   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ onLogout }) {
  const navigate = useNavigate();
  const navItems = [
    { key: "home",    label: "Home",     Icon: IcoHome,    path: "/driver/dashboard" },
    { key: "monitor", label: "Monitor",  Icon: IcoMonitor, path: "/driver/monitor"   },
    { key: "stats",   label: "Stats",    Icon: IcoStats,   path: "/driver/stats"     },
    { key: "profile", label: "Profile",  Icon: IcoUser,    path: "/driver/profile"   },
  ];
  return (
    <aside className="ds-sidebar">
      <div className="ds-logo">
        <div className="ds-logo-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <span>DriveGuard</span>
      </div>
      <nav className="ds-nav">
        {navItems.map(({ key, label, Icon, path }) => (
          <button key={key}
            className={`ds-nav-btn ${key === "stats" ? "active" : ""}`}
            onClick={() => path && navigate(path)}>
            <Icon /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="ds-sidebar-foot">
        <button className="ds-signout" onClick={onLogout}><IcoLogout />Sign Out</button>
      </div>
    </aside>
  );
}

// ── Custom Tooltips ───────────────────────────────────────────────────────────
function DSSChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const tc = TIER_COLOR[d?.tier] || "#64748b";
  return (
    <div className="ds-tooltip">
      <p className="ds-tooltip-title">Session {d?.session} · {d?.date}</p>
      <p style={{ color: tc }}>DSS: <strong>{d?.dss}</strong> — {d?.tier}</p>
      {d?.avg_bvi != null && <p style={{ color: bviColor(d.avg_bvi) }}>Avg BVI: <strong>{d.avg_bvi}</strong></p>}
    </div>
  );
}

function BVIChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="ds-tooltip">
      <p className="ds-tooltip-title">Session {d?.session} · {d?.date}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(3) : p.value}</strong>
        </p>
      ))}
      <p style={{ color: "#ef4444" }}>Erratic frames: <strong>{d?.erratic_count}</strong></p>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="ds-stat-card">
      <div className="ds-stat-icon" style={{ color: color || "#38bdf8" }}>
        <Icon />
      </div>
      <div className="ds-stat-body">
        <span className="ds-stat-label">{label}</span>
        <span className="ds-stat-value" style={{ color: color || "#e2e8f0" }}>{value}</span>
        {sub && <span className="ds-stat-sub">{sub}</span>}
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState() {
  const navigate = useNavigate();
  return (
    <div className="ds-empty">
      <IcoCamera />
      <h3>No session data yet</h3>
      <p>Start a Live Cam session from the Monitor page to build your performance stats.</p>
      <button className="ds-empty-btn" onClick={() => navigate("/driver/monitor/emotion?tab=live")}>
        Go to Live Monitor
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DriverStatsPage() {
  const navigate = useNavigate();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [tableExpanded, setTableExpanded] = useState(false);

  const user  = JSON.parse(localStorage.getItem("user")  || "{}");
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) { navigate("/login"); return; }
    fetch(`${API}/api/driver/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setStats(d);
      })
      .catch(() => setError("Could not load stats — is the backend running?"))
      .finally(() => setLoading(false));
  }, [navigate, token]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  const initials = (user.username || "D").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="ds-root">
      <Sidebar onLogout={logout} />
      <main className="ds-main">

        {/* Topbar */}
        <header className="ds-topbar">
          <div>
            <h1 className="ds-page-title">Performance Statistics</h1>
            <p className="ds-page-sub">Your full driving safety analytics — all sessions</p>
          </div>
          <div className="ds-topbar-right">
            <div className="ds-avatar">{initials}</div>
          </div>
        </header>

        <div className="ds-content">
          {loading && (
            <div className="ds-loading"><div className="ds-spinner" /><p>Loading stats…</p></div>
          )}
          {error && <div className="ds-error">{error}</div>}

          {!loading && !error && stats && (
            <>
              {stats.total_sessions === 0 ? <EmptyState /> : (
                <>
                  {/* ── Overview Stat Cards ─────────────────────────────── */}
                  <div className="ds-cards-row">
                    <StatCard
                      label="Total Sessions"
                      value={stats.total_sessions}
                      sub={`${stats.total_frames.toLocaleString()} frames analysed`}
                      color="#38bdf8"
                      icon={IcoCamera}
                    />
                    <StatCard
                      label="Avg Safety Score"
                      value={stats.overview.avg_dss != null ? `${stats.overview.avg_dss} / 100` : "—"}
                      sub={stats.overview.overall_tier}
                      color={stats.overview.overall_tier_color || "#64748b"}
                      icon={IcoShield}
                    />
                    <StatCard
                      label="Best DSS"
                      value={stats.overview.best_dss ?? "—"}
                      sub="Best single session"
                      color="#22c55e"
                      icon={IcoTrend}
                    />
                    <StatCard
                      label="Avg BVI"
                      value={stats.overview.avg_bvi ?? "—"}
                      sub={`Peak: ${stats.overview.peak_bvi ?? "—"}`}
                      color={bviColor(stats.overview.avg_bvi)}
                      icon={IcoBrain}
                    />
                    <StatCard
                      label="Erratic Frames"
                      value={stats.overview.total_erratic ?? 0}
                      sub="Across all sessions"
                      color={stats.overview.total_erratic > 0 ? "#ef4444" : "#22c55e"}
                      icon={IcoAlert}
                    />
                  </div>

                  {/* ── Trend badge ─────────────────────────────────────── */}
                  {stats.overview.trend && (
                    <div className="ds-trend-banner" style={{
                      borderColor: stats.overview.trend === "improving" ? "#22c55e55" : stats.overview.trend === "declining" ? "#ef444455" : "#33415555",
                      background:  stats.overview.trend === "improving" ? "#22c55e0a" : stats.overview.trend === "declining" ? "#ef44440a" : "#1e293b66",
                    }}>
                      <span className="ds-trend-icon" style={{
                        color: stats.overview.trend === "improving" ? "#22c55e" : stats.overview.trend === "declining" ? "#ef4444" : "#64748b"
                      }}>
                        {stats.overview.trend === "improving" ? "↑" : stats.overview.trend === "declining" ? "↓" : "→"}
                      </span>
                      <span className="ds-trend-text">
                        Performance is <strong style={{
                          color: stats.overview.trend === "improving" ? "#22c55e" : stats.overview.trend === "declining" ? "#ef4444" : "#94a3b8"
                        }}>{stats.overview.trend}</strong> — based on last 6 sessions comparison.
                        {stats.overview.trend === "improving" && " Great work! Keep it up."}
                        {stats.overview.trend === "declining" && " Consider reviewing your recent sessions."}
                      </span>
                    </div>
                  )}

                  {/* ── Charts Row ──────────────────────────────────────── */}
                  <div className="ds-charts-row">

                    {/* DSS Trend Chart */}
                    {stats.dss_chart.length > 0 && (
                      <div className="ds-card ds-chart-card ds-dss-chart">
                        <div className="ds-card-head">
                          <span className="ds-card-title">Driver Safety Score — Session Trend</span>
                          <span className="ds-card-hint">{stats.dss_chart.length} scored sessions</span>
                        </div>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={stats.dss_chart} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="session" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false}
                              label={{ value: "Session", position: "insideBottom", offset: -2, fill: "#334155", fontSize: 9 }} />
                            <YAxis domain={[0, 100]} tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<DSSChartTooltip />} />
                            {[{ y: 40, c: "#ef4444", l: "High Risk" }, { y: 60, c: "#f59e0b", l: "Caution" }, { y: 75, c: "#38bdf8", l: "Safe" }, { y: 90, c: "#22c55e", l: "Elite" }].map(r => (
                              <ReferenceLine key={r.y} y={r.y} stroke={r.c} strokeDasharray="3 3" strokeOpacity={0.35}
                                label={{ value: r.l, position: "insideTopRight", fill: r.c, fontSize: 8 }} />
                            ))}
                            {stats.overview.avg_dss && (
                              <ReferenceLine y={stats.overview.avg_dss}
                                stroke={stats.overview.overall_tier_color || "#64748b"}
                                strokeDasharray="6 3" strokeOpacity={0.7}
                                label={{ value: `Avg ${stats.overview.avg_dss}`, position: "insideTopLeft", fill: stats.overview.overall_tier_color || "#64748b", fontSize: 9 }} />
                            )}
                            <Line type="monotone" dataKey="dss" stroke="#38bdf8" strokeWidth={2.5}
                              dot={(props) => {
                                const { cx, cy, payload } = props;
                                const c = TIER_COLOR[payload?.tier] || "#64748b";
                                return <circle key={payload?.session} cx={cx} cy={cy} r={4} fill={c} stroke="#0f172a" strokeWidth={1.5} />;
                              }}
                              activeDot={{ r: 6 }} name="DSS" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* BVI Trend Chart */}
                    {stats.bvi_chart.length > 0 && (
                      <div className="ds-card ds-chart-card ds-bvi-chart">
                        <div className="ds-card-head">
                          <span className="ds-card-title">Behavioral Volatility Index — Session Trend</span>
                          <span className="ds-card-hint">avg &amp; peak BVI per session</span>
                        </div>
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={stats.bvi_chart} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                            <defs>
                              <linearGradient id="avgBviGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor="#38bdf8" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                              </linearGradient>
                              <linearGradient id="pkBviGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor="#ef4444" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="session" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false}
                              label={{ value: "Session", position: "insideBottom", offset: -2, fill: "#334155", fontSize: 9 }} />
                            <YAxis domain={[0, 1]} tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false}
                              tickFormatter={v => v.toFixed(1)} />
                            <Tooltip content={<BVIChartTooltip />} />
                            <ReferenceLine y={0.30} stroke="#22c55e" strokeDasharray="4 3" strokeOpacity={0.4}
                              label={{ value: "Stable", position: "insideTopLeft", fill: "#22c55e", fontSize: 9 }} />
                            <ReferenceLine y={0.60} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.4}
                              label={{ value: "Caution", position: "insideTopLeft", fill: "#f59e0b", fontSize: 9 }} />
                            <Area type="monotone" dataKey="avg_bvi"  name="Avg BVI"  stroke="#38bdf8" strokeWidth={2} fill="url(#avgBviGrad)" dot={false} />
                            <Area type="monotone" dataKey="peak_bvi" name="Peak BVI" stroke="#ef4444" strokeWidth={1.5} fill="url(#pkBviGrad)" dot={false} strokeDasharray="4 2" />
                            <Legend wrapperStyle={{ fontSize: "0.72rem", color: "#64748b" }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* ── Bottom row: emotion pie + tier dist + distraction ── */}
                  <div className="ds-bottom-row">

                    {/* Emotion breakdown */}
                    {Object.keys(stats.emotion_totals).length > 0 && (
                      <div className="ds-card ds-emotion-card">
                        <div className="ds-card-head">
                          <span className="ds-card-title">Emotion Distribution</span>
                          <span className="ds-card-hint">Latest session frames</span>
                        </div>
                        <div className="ds-emotion-body">
                          <ResponsiveContainer width="100%" height={160}>
                            <PieChart>
                              <Pie
                                data={Object.entries(stats.emotion_totals).map(([k, v]) => ({ name: k, value: v }))}
                                cx="50%" cy="50%" innerRadius={42} outerRadius={68}
                                paddingAngle={3} dataKey="value"
                              >
                                {Object.entries(stats.emotion_totals).map(([k], i) => (
                                  <Cell key={i} fill={EMOTION_COLOR[k] || "#64748b"} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v, n) => [v, n.charAt(0).toUpperCase() + n.slice(1)]} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="ds-emotion-legend">
                            {Object.entries(stats.emotion_totals)
                              .sort(([, a], [, b]) => b - a)
                              .map(([k, v]) => {
                                const total = Object.values(stats.emotion_totals).reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                                return (
                                  <div key={k} className="ds-emo-row">
                                    <span className="ds-emo-dot" style={{ background: EMOTION_COLOR[k] || "#64748b" }} />
                                    <span className="ds-emo-label">{k.charAt(0).toUpperCase() + k.slice(1)}</span>
                                    <div className="ds-emo-track">
                                      <div className="ds-emo-fill" style={{ width: `${pct}%`, background: EMOTION_COLOR[k] || "#64748b" }} />
                                    </div>
                                    <span className="ds-emo-pct">{pct}%</span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tier distribution */}
                    {stats.tier_dist && Object.values(stats.tier_dist).some(v => v > 0) && (
                      <div className="ds-card ds-tier-card">
                        <div className="ds-card-head">
                          <span className="ds-card-title">DSS Tier Distribution</span>
                          <span className="ds-card-hint">How often each tier was achieved</span>
                        </div>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart
                            data={["High Risk","At Risk","Needs Attention","Safe","Elite"].map(t => ({ tier: t, count: stats.tier_dist[t] || 0 }))}
                            margin={{ top: 8, right: 8, left: -20, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="tier" tick={{ fill: "#475569", fontSize: 9 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: "0.75rem" }}
                              labelStyle={{ color: "#94a3b8" }}
                            />
                            <Bar dataKey="count" name="Sessions" radius={[4, 4, 0, 0]}>
                              {["High Risk","At Risk","Needs Attention","Safe","Elite"].map(t => (
                                <Cell key={t} fill={TIER_COLOR[t]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Summary stats */}
                    <div className="ds-card ds-summary-stats-card">
                      <div className="ds-card-head">
                        <span className="ds-card-title">Session Averages</span>
                      </div>
                      <div className="ds-sum-list">
                        {[
                          { label: "Avg DSS",           val: stats.overview.avg_dss != null ? `${stats.overview.avg_dss} / 100` : "—",   color: stats.overview.overall_tier_color },
                          { label: "Best DSS",          val: stats.overview.best_dss  ?? "—",  color: "#22c55e" },
                          { label: "Worst DSS",         val: stats.overview.worst_dss ?? "—",  color: "#ef4444" },
                          { label: "Avg BVI",           val: stats.overview.avg_bvi   ?? "—",  color: bviColor(stats.overview.avg_bvi) },
                          { label: "Peak BVI (all-time)",val: stats.overview.peak_bvi ?? "—",  color: "#ef4444" },
                          { label: "Total Erratic Frames",val: stats.overview.total_erratic ?? 0, color: stats.overview.total_erratic > 0 ? "#ef4444" : "#22c55e" },
                          { label: "Distraction Rate",  val: `${stats.overview.distraction_rate ?? 0}%`, color: stats.overview.distraction_rate > 10 ? "#ef4444" : "#22c55e" },
                          { label: "Dominant Emotion",  val: stats.overview.dominant_emotion ? stats.overview.dominant_emotion.charAt(0).toUpperCase() + stats.overview.dominant_emotion.slice(1) : "—",
                            color: EMOTION_COLOR[stats.overview.dominant_emotion] || "#94a3b8" },
                          { label: "Overall Trend",     val: stats.overview.trend ?? "—",
                            color: stats.overview.trend === "improving" ? "#22c55e" : stats.overview.trend === "declining" ? "#ef4444" : "#64748b" },
                        ].map(({ label, val, color }) => (
                          <div key={label} className="ds-sum-row">
                            <span className="ds-sum-lbl">{label}</span>
                            <span className="ds-sum-val" style={color ? { color } : {}}>{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ── Sessions Table ──────────────────────────────────── */}
                  <div className="ds-card ds-sessions-card">
                    <div className="ds-card-head">
                      <div>
                        <span className="ds-card-title">All Sessions</span>
                        <span className="ds-card-hint">&nbsp;— {stats.sessions_table.length} completed sessions, newest first</span>
                      </div>
                      <button className="ds-table-toggle" onClick={() => setTableExpanded(v => !v)}>
                        {tableExpanded ? "▲ Collapse" : "▼ Expand"}
                      </button>
                    </div>

                    <div className="ds-table-wrap">
                      <table className="ds-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Frames</th>
                            <th>DSS</th>
                            <th>Tier</th>
                            <th>Avg BVI</th>
                            <th>Peak BVI</th>
                            <th>Erratic</th>
                            <th>Dominant Emotion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(tableExpanded ? stats.sessions_table : stats.sessions_table.slice(0, 5)).map((s, i) => {
                            const tc = TIER_COLOR[s.tier] || "#64748b";
                            return (
                              <tr key={s.id || i}>
                                <td className="ds-td-num">{s.session}</td>
                                <td>{s.date}</td>
                                <td className="ds-td-time">{s.time || "—"}</td>
                                <td>{s.frames?.toLocaleString() ?? "—"}</td>
                                <td><span className="ds-td-dss" style={{ color: tc }}>{s.dss ?? "—"}</span></td>
                                <td>
                                  {s.tier !== "—"
                                    ? <span className="ds-td-tier" style={{ background: tc + "22", color: tc, border: `1px solid ${tc}44` }}>{s.tier}</span>
                                    : <span className="ds-td-tier-none">—</span>}
                                </td>
                                <td style={{ color: bviColor(s.avg_bvi) }}>{s.avg_bvi ?? "—"}</td>
                                <td style={{ color: bviColor(s.peak_bvi) }}>{s.peak_bvi ?? "—"}</td>
                                <td style={{ color: s.erratic > 0 ? "#ef4444" : "#22c55e" }}>{s.erratic ?? 0}</td>
                                <td style={{ color: EMOTION_COLOR[s.dominant] || "#94a3b8" }}>
                                  {s.dominant ? s.dominant.charAt(0).toUpperCase() + s.dominant.slice(1) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {!tableExpanded && stats.sessions_table.length > 5 && (
                        <div className="ds-table-more" onClick={() => setTableExpanded(true)}>
                          Show {stats.sessions_table.length - 5} more sessions ▼
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
