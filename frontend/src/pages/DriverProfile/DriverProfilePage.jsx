import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area,
  Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, Brush, LineChart,
} from "recharts";
import Sidebar from "../../components/common/Sidebar";
import "./DriverProfile.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Icons ─────────────────────────────────────────────────────────────────────
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

// ── DSS Rank Card ─────────────────────────────────────────────────────────────
const TIER_META = [
  { label: "High Risk",      min: 0,  max: 40,  color: "#ef4444" },
  { label: "At Risk",        min: 40, max: 60,  color: "#f97316" },
  { label: "Needs Attention",min: 60, max: 75,  color: "#f59e0b" },
  { label: "Safe",           min: 75, max: 90,  color: "#38bdf8" },
  { label: "Elite",          min: 90, max: 100, color: "#22c55e" },
];
const DSS_TIER_COLOR = { Elite: "#22c55e", Safe: "#38bdf8", "Needs Attention": "#f59e0b", "At Risk": "#f97316", "High Risk": "#ef4444" };

function DSSTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const tc = DSS_TIER_COLOR[d?.tier] || "#64748b";
  return (
    <div className="dp-chart-tooltip">
      <p className="dp-chart-tooltip-title" style={{ marginBottom: "0.25rem" }}>
        Session {label} · {d?.date || ""}
      </p>
      <p style={{ color: tc, margin: "2px 0", fontSize: "0.72rem" }}>
        DSS: <strong>{d?.dss}</strong> — <span>{d?.tier}</span>
      </p>
      {d?.avg_bvi != null && (
        <p style={{ color: "#38bdf8", margin: "2px 0", fontSize: "0.72rem" }}>
          Avg BVI: <strong>{d.avg_bvi}</strong>
        </p>
      )}
      {d?.dominant && (
        <p style={{ color: "#94a3b8", margin: "2px 0", fontSize: "0.72rem" }}>
          Dominant: <strong>{d.dominant}</strong>
        </p>
      )}
    </div>
  );
}

function DSSRankCard({ rank }) {
  const [showTable, setShowTable] = useState(false);

  const trendIcon  = rank.trend === "improving" ? "↑" : rank.trend === "declining" ? "↓" : "→";
  const trendColor = rank.trend === "improving" ? "#22c55e" : rank.trend === "declining" ? "#ef4444" : "#64748b";

  // Build chart data — numbered 1..N (oldest first, already sorted in API)
  const chartData = (rank.session_scores || []).map((s, i) => ({
    ...s,
    session: i + 1,
  }));

  // Custom dot: color by tier
  const DssDot = (props) => {
    const { cx, cy, payload } = props;
    const c = DSS_TIER_COLOR[payload?.tier] || "#64748b";
    return <circle cx={cx} cy={cy} r={4} fill={c} stroke="#0f172a" strokeWidth={1.5} />;
  };

  return (
    <div className="dp-card dp-dss-card">
      {/* Header */}
      <div className="dp-dss-head">
        <div>
          <span className="dp-card-title">Driver Safety Score &amp; Ranking</span>
          <span className="dp-card-hint">&nbsp;— last {rank.sessions_analysed || 0} monitored sessions</span>
        </div>
        {rank.tier && (
          <span className="dp-dss-badge" style={{ background: (rank.tier_color || "#64748b") + "22", color: rank.tier_color || "#64748b", border: `1px solid ${rank.tier_color || "#64748b"}55` }}>
            {rank.tier}
          </span>
        )}
      </div>

      {rank.sessions_analysed === 0 ? (
        <p className="dp-dss-empty">No monitored sessions yet — start a Live Cam session to build your safety score.</p>
      ) : (
        <div className="dp-dss-body">

          {/* Top row: big score + stats strip */}
          <div className="dp-dss-top-row">
            {/* Big avg score */}
            <div className="dp-dss-score-block">
              <span className="dp-dss-score" style={{ color: rank.tier_color || "#64748b" }}>{rank.avg_dss ?? "—"}</span>
              <span className="dp-dss-score-sub">/ 100</span>
              <span className="dp-dss-score-label">Avg DSS</span>
            </div>
            {/* Stats strip */}
            <div className="dp-dss-stats-strip">
              <div className="dp-dss-stat">
                <span className="dp-dss-stat-val">{rank.sessions_analysed}</span>
                <span className="dp-dss-stat-lbl">Sessions</span>
              </div>
              <div className="dp-dss-stat-div" />
              <div className="dp-dss-stat">
                <span className="dp-dss-stat-val" style={{ color: "#22c55e" }}>{rank.best_dss ?? "—"}</span>
                <span className="dp-dss-stat-lbl">Best</span>
              </div>
              <div className="dp-dss-stat-div" />
              <div className="dp-dss-stat">
                <span className="dp-dss-stat-val" style={{ color: "#ef4444" }}>{rank.worst_dss ?? "—"}</span>
                <span className="dp-dss-stat-lbl">Worst</span>
              </div>
              <div className="dp-dss-stat-div" />
              <div className="dp-dss-stat">
                <span className="dp-dss-stat-val" style={{ color: trendColor }}>{trendIcon} {rank.trend}</span>
                <span className="dp-dss-stat-lbl">Trend</span>
              </div>
            </div>
          </div>

          {/* Tier bar */}
          <div className="dp-dss-tiers">
            {TIER_META.map(t => (
              <div key={t.label}
                className={`dp-dss-tier-seg ${rank.tier === t.label ? "active" : ""}`}
                style={{ flex: t.max - t.min, background: rank.tier === t.label ? t.color : t.color + "33" }}
                title={`${t.label}: ${t.min}–${t.max}`}
              />
            ))}
          </div>
          <div className="dp-dss-tier-labels">
            {TIER_META.map(t => (
              <span key={t.label} className={rank.tier === t.label ? "dp-dss-tlabel active" : "dp-dss-tlabel"}>{t.label}</span>
            ))}
          </div>

          {/* DSS Trend Chart */}
          {chartData.length > 0 && (
            <div className="dp-dss-chart-wrap">
              <div className="dp-dss-chart-header">
                <span className="dp-dss-trend-title">DSS Per Session — Performance Trend</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dssGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={rank.tier_color || "#38bdf8"} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={rank.tier_color || "#38bdf8"} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="session" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false}
                    label={{ value: "Session #", position: "insideBottom", offset: -2, fill: "#334155", fontSize: 9 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<DSSTooltip />} />
                  {/* Reference lines for tier thresholds */}
                  {[{ y: 40, c: "#ef4444", l: "At Risk" }, { y: 60, c: "#f59e0b", l: "Needs" }, { y: 75, c: "#38bdf8", l: "Safe" }, { y: 90, c: "#22c55e", l: "Elite" }].map(r => (
                    <ReferenceLine key={r.y} y={r.y} stroke={r.c} strokeDasharray="3 3" strokeOpacity={0.4}
                      label={{ value: r.l, position: "insideTopRight", fill: r.c, fontSize: 8 }} />
                  ))}
                  {/* Avg reference line */}
                  {rank.avg_dss && (
                    <ReferenceLine y={rank.avg_dss} stroke={rank.tier_color || "#64748b"} strokeDasharray="6 3" strokeOpacity={0.7}
                      label={{ value: `Avg ${rank.avg_dss}`, position: "insideTopLeft", fill: rank.tier_color || "#64748b", fontSize: 9 }} />
                  )}
                  <Line type="monotone" dataKey="dss" stroke={rank.tier_color || "#38bdf8"} strokeWidth={2.5}
                    dot={<DssDot />} activeDot={{ r: 6 }} name="DSS" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Session table toggle */}
          {chartData.length > 0 && (
            <>
              <button className="dp-dss-table-toggle" onClick={() => setShowTable(v => !v)}>
                {showTable ? "▲ Hide session details" : "▼ Show all session details"}
              </button>
              {showTable && (
                <div className="dp-dss-table-wrap">
                  <table className="dp-dss-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>DSS</th>
                        <th>Tier</th>
                        <th>Avg BVI</th>
                        <th>Dominant</th>
                        <th>Erratic</th>
                        <th>Frames</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...chartData].reverse().map((s, i) => {
                        const tc = DSS_TIER_COLOR[s.tier] || "#64748b";
                        return (
                          <tr key={s.id || i}>
                            <td className="dp-dss-td-num">{chartData.length - i}</td>
                            <td>{s.date}{s.time ? <span className="dp-dss-td-time">&nbsp;{s.time}</span> : null}</td>
                            <td><span className="dp-dss-td-dss" style={{ color: tc }}>{s.dss}</span></td>
                            <td><span className="dp-dss-td-tier" style={{ background: tc + "22", color: tc, border: `1px solid ${tc}44` }}>{s.tier}</span></td>
                            <td>{s.avg_bvi ?? "—"}</td>
                            <td>{s.dominant ? s.dominant.charAt(0).toUpperCase() + s.dominant.slice(1) : "—"}</td>
                            <td style={{ color: s.erratic > 0 ? "#ef4444" : "#22c55e" }}>{s.erratic ?? 0}</td>
                            <td>{s.frames ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
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
// ── Shift Score History Card ──────────────────────────────────────────────────
const TIER_COLORS = {
  Excellent:          "#22c55e",
  Good:               "#38bdf8",
  Average:            "#f59e0b",
  "Needs Improvement":"#f97316",
  Poor:               "#ef4444",
};

function ShiftScoreHistoryCard({ scores }) {
  const [expanded, setExpanded] = useState(null);

  if (!scores || scores.length === 0) {
    return (
      <div className="dp-card dp-shift-scores-card">
        <span className="dp-card-title">Shift Score History</span>
        <p className="dp-dss-empty">No shift scores recorded yet — complete a shift to see your scores here.</p>
      </div>
    );
  }

  const avgScore = Math.round(scores.reduce((a, s) => a + (s.score?.total_score || 0), 0) / scores.length);
  const bestScore = Math.max(...scores.map(s => s.score?.total_score || 0));
  const latestTier = scores[0]?.score?.tier || "—";

  return (
    <div className="dp-card dp-shift-scores-card">
      <div className="dp-ss-head">
        <div>
          <span className="dp-card-title">Shift Score History</span>
          <span className="dp-card-hint">&nbsp;— {scores.length} completed shift{scores.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="dp-ss-summary">
          <div className="dp-ss-sum-item">
            <span className="dp-ss-sum-val" style={{ color: TIER_COLORS[latestTier] || "#64748b" }}>{scores[0]?.score?.total_score ?? "—"}</span>
            <span className="dp-ss-sum-lbl">Latest</span>
          </div>
          <div className="dp-ss-sum-divider" />
          <div className="dp-ss-sum-item">
            <span className="dp-ss-sum-val">{avgScore}</span>
            <span className="dp-ss-sum-lbl">Average</span>
          </div>
          <div className="dp-ss-sum-divider" />
          <div className="dp-ss-sum-item">
            <span className="dp-ss-sum-val" style={{ color: "#22c55e" }}>{bestScore}</span>
            <span className="dp-ss-sum-lbl">Best</span>
          </div>
        </div>
      </div>

      <div className="dp-ss-list">
        {scores.map((s, idx) => {
          const sc = s.score || {};
          const tierColor = TIER_COLORS[sc.tier] || "#64748b";
          const isOpen = expanded === idx;
          const comps = sc.components || {};

          return (
            <div key={idx} className={`dp-ss-row ${isOpen ? "open" : ""}`}>
              <div className="dp-ss-row-main" onClick={() => setExpanded(isOpen ? null : idx)}>
                <div className="dp-ss-route-info">
                  <span className="dp-ss-route">{s.start_town || "—"} → {s.end_town || "—"}</span>
                  <span className="dp-ss-meta">{s.date || "—"} · {s.shift_time || "—"} · {s.bus || ""}</span>
                </div>
                <div className="dp-ss-score-pill" style={{ background: tierColor + "18", borderColor: tierColor + "55", color: tierColor }}>
                  <span className="dp-ss-score-num">{sc.total_score ?? "—"}</span>
                  <span className="dp-ss-score-tier">{sc.tier || "—"}</span>
                </div>
                <span className={`dp-ss-chevron ${isOpen ? "open" : ""}`}><IcoChevron /></span>
              </div>

              {isOpen && (
                <div className="dp-ss-detail">
                  <div className="dp-ss-bars">
                    {Object.entries(comps).map(([key, c]) => {
                      const pct = (c.score / c.max) * 100;
                      const barColor = pct >= 80 ? "#22c55e" : pct >= 50 ? "#38bdf8" : pct >= 30 ? "#f59e0b" : "#ef4444";
                      return (
                        <div key={key} className="dp-ss-bar-row">
                          <span className="dp-ss-bar-label">{c.label}</span>
                          <div className="dp-ss-bar-track">
                            <div className="dp-ss-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                          </div>
                          <span className="dp-ss-bar-val">{c.score}/{c.max}</span>
                        </div>
                      );
                    })}
                  </div>
                  {s.route_name && <span className="dp-ss-route-name">Route: {s.route_name}</span>}
                  {s.duration_sec > 0 && <span className="dp-ss-duration">Duration: {Math.round(s.duration_sec / 60)} min</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DriverProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [rank,    setRank]    = useState(null);
  const [shiftScores, setShiftScores] = useState([]);
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }

    Promise.allSettled([
      fetch(`${API}/api/driver/profile`,      { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API}/api/driver/rank`,          { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API}/api/driver/shift/scores`,  { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([profileResult, rankResult, scoresResult]) => {
        if (profileResult.status === "fulfilled") {
          if (profileResult.value.error) setError(profileResult.value.error);
          else setProfile(profileResult.value);
        } else {
          setError("Failed to load profile.");
        }
        if (rankResult.status === "fulfilled" && !rankResult.value?.error) {
          setRank(rankResult.value);
        }
        if (scoresResult.status === "fulfilled" && scoresResult.value?.scores) {
          setShiftScores(scoresResult.value.scores);
        }
      })
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
    <div className="dd-root">
      <Sidebar activeKey="profile" />

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

          {/* ── DSS Rank Card ────────────────────────────────────────── */}
          {rank && (
            <DSSRankCard rank={rank} />
          )}

          {/* ── Shift Score History ─────────────────────────────────── */}
          <ShiftScoreHistoryCard scores={shiftScores} />

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
