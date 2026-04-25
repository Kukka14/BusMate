import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import AdminSidebar from "../../components/AdminSidebar/AdminSidebar";
import "./AdminDashboard.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Icons ─────────────────────────────────────────────────────────────────────

const IcoBell     = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
const IcoChat     = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const IcoExport   = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IcoSearch   = () => <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IcoBus      = () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 4v4h-7V8Z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
const IcoWarn     = () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const IcoCheck    = () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>;
const IcoSign     = () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 3h18v4H3z"/><path d="M12 7v14"/></svg>;
const IcoSpeed    = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10"/><path d="M12 8v4l2 2"/></svg>;
const IcoStop     = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/></svg>;
const IcoCity     = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="13"/><path d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/><path d="M9 21v-5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5"/></svg>;
const IcoRain     = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="16" y1="19" x2="16" y2="21"/><line x1="16" y1="13" x2="16" y2="15"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="12" y1="15" x2="12" y2="17"/></svg>;
const IcoMap      = () => <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>;


// ── Custom bar tooltip ─────────────────────────────────────────────────────────
function DrownTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ad-tooltip">
      <p className="ad-tooltip-title">{label}</p>
      <p style={{ color: "#38bdf8", fontSize: "0.75rem" }}>
        Incidents: <strong>{payload[0].value}</strong>
      </p>
    </div>
  );
}

// ── Circular gauge ─────────────────────────────────────────────────────────────
function StabilityGauge({ value = 72 }) {
  const r = 54, cx = 70, cy = 70, circ = 2 * Math.PI * r;
  const offset = circ * (1 - value / 100);
  const color  = value >= 75 ? "#3b82f6" : value >= 55 ? "#f59e0b" : "#ef4444";
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e2d45" strokeWidth="10"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.7s ease" }}/>
      <text x={cx} y={cy - 6} textAnchor="middle" fill={color}
        fontSize="28" fontWeight="800" fontFamily="Inter,sans-serif">{value}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fill="#64748b"
        fontSize="9" letterSpacing="1.5" fontFamily="Inter,sans-serif">STABILITY</text>
    </svg>
  );
}

// ── Metric bar ─────────────────────────────────────────────────────────────────
function MetricBar({ label, value, color }) {
  return (
    <div className="ad-metric-bar">
      <div className="ad-metric-top">
        <span className="ad-metric-label">{label}</span>
        <span className="ad-metric-val" style={{ color }}>{value}%</span>
      </div>
      <div className="ad-metric-track">
        <div className="ad-metric-fill" style={{ width: `${value}%`, background: color }}/>
      </div>
    </div>
  );
}

// ── Sign row ───────────────────────────────────────────────────────────────────
function SignRow({ sign }) {
  const pct   = Math.round(sign.detected / sign.total * 100);
  const IcoEl = sign.icon === "stop" ? IcoStop : sign.icon === "warn" ? IcoWarn : sign.icon === "cross" ? IcoCheck : IcoSpeed;
  return (
    <div className="ad-sign-row">
      <div className="ad-sign-icon" style={{ background: sign.color + "22", color: sign.color }}>
        <IcoEl />
      </div>
      <div className="ad-sign-body">
        <div className="ad-sign-top">
          <span className="ad-sign-label">{sign.label}</span>
          <span className="ad-sign-count" style={{ color: sign.color }}>
            {sign.detected.toLocaleString()} / {sign.total.toLocaleString()}
          </span>
        </div>
        <div className="ad-sign-track">
          <div className="ad-sign-fill" style={{ width: `${pct}%`, background: sign.color }}/>
        </div>
      </div>
      <span className="ad-sign-pct">{pct}%</span>
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, trend, trendUp, icon: Icon, iconBg, iconColor }) {
  return (
    <div className="ad-stat-card">
      <div className="ad-stat-top">
        <div>
          <p className="ad-stat-label">{label}</p>
          <p className="ad-stat-value">{value}</p>
        </div>
        <div className="ad-stat-icon" style={{ background: iconBg, color: iconColor }}>
          <Icon />
        </div>
      </div>
      <p className={`ad-stat-trend ${trendUp ? "up" : "down"}`}>
        {trendUp ? "↑" : "↓"} {trend}
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate  = useNavigate();
  const [range,   setRange]   = useState("24h");
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [navKey,  setNavKey]  = useState("dashboard");

  const fetchData = useCallback(async (r) => {
    setLoading(true);
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }
    try {
      const res  = await fetch(`${API}/api/admin/fleet-analytics?range=${r}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) setError(json.error);
      else { setData(json); setError(""); }
    } catch {
      setError("Network error — make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { fetchData(range); }, [range, fetchData]);

  const stats   = data?.stats             || {};
  const trends  = data?.drowsiness_trends || [];
  const emotion = data?.emotion_shift     || {};
  const signs   = data?.sign_validation   || {};
  const scene   = data?.scene_analysis    || {};

  const volColor = emotion.volatility === "HIGH"   ? "#ef4444"
                 : emotion.volatility === "MEDIUM"  ? "#f59e0b"
                 :                                    "#22c55e";

  return (
    <div className="ad-root">

      {/* ─── SIDEBAR ─── */}
      <AdminSidebar activeKey={navKey} onItemClick={setNavKey} />

      {/* ─── MAIN ─── */}
      <div className="ad-main">

        {/* Top bar */}
        <header className="ad-topbar">
          <div className="ad-search-wrap">
            <IcoSearch />
            <input className="ad-search" placeholder="Search fleet, drivers, or alerts…" />
          </div>
          <div className="ad-topbar-right">
            <button className="ad-icon-btn"><IcoBell /></button>
            <button className="ad-icon-btn"><IcoChat /></button>
            <div className="ad-topbar-sep" />
            <button className="ad-export-btn"><IcoExport /> Export Data</button>
          </div>
        </header>

        {/* Content */}
        <div className="ad-content">

          {/* Page heading */}
          <div className="ad-page-head">
            <div>
              <h1 className="ad-page-title">Fleet Analytics Overview</h1>
              <p className="ad-page-sub">Real-time driver behavior and environment safety intelligence.</p>
            </div>
            <div className="ad-range-tabs">
              {[["24h","24 Hours"],["7d","7 Days"],["30d","30 Days"]].map(([v,l]) => (
                <button key={v}
                  className={`ad-range-tab ${range === v ? "active" : ""}`}
                  onClick={() => setRange(v)}>{l}</button>
              ))}
            </div>
          </div>

          {error && <div className="ad-error-bar">{error}</div>}

          {/* Stat cards */}
          <div className="ad-stats-row">
            <StatCard label="ACTIVE BUSES"     value={loading ? "—" : String(stats.active_buses  ?? "—")}
              trend="+2.4%" trendUp icon={IcoBus}   iconBg="#0e2742" iconColor="#38bdf8"/>
            <StatCard label="SAFETY ALERTS"    value={loading ? "—" : (stats.safety_alerts ?? 0).toLocaleString()}
              trend="+12%" trendUp={false} icon={IcoWarn}  iconBg="#3d1212" iconColor="#f87171"/>
            <StatCard label="AVG SAFETY SCORE" value={loading ? "—" : `${stats.avg_safety_score ?? "—"}%`}
              trend="+1.2%" trendUp icon={IcoCheck} iconBg="#0d2b1a" iconColor="#4ade80"/>
            <StatCard label="SIGN ACCURACY"    value={loading ? "—" : `${stats.sign_accuracy    ?? "—"}%`}
              trend="+0.8%" trendUp icon={IcoSign}  iconBg="#141e35" iconColor="#60a5fa"/>
          </div>

          {/* Row 2 */}
          <div className="ad-row-2">

            {/* Drowsiness Detection Trends */}
            <div className="ad-card ad-bar-card">
              <div className="ad-card-head">
                <div>
                  <p className="ad-card-title">Drowsiness Detection Trends</p>
                  <p className="ad-card-sub">Frequency and intensity over time</p>
                </div>
                <button className="ad-icon-btn-sm" title="Info">
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                </button>
              </div>
              {loading
                ? <div className="ad-chart-load"><div className="ad-spinner"/></div>
                : (
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={trends} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#162035" vertical={false}/>
                      <XAxis dataKey="day" tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false}/>
                      <Tooltip content={<DrownTooltip />} cursor={{ fill: "rgba(56,189,248,0.05)" }}/>
                      <Bar dataKey="value" radius={[4,4,0,0]}>
                        {trends.map((e,i) => (
                          <Cell key={i}
                            fill={e.peak ? "#92400e" : "#1e3a5f"}
                            stroke={e.peak ? "#f59e0b" : "#2563eb"}
                            strokeWidth={e.peak ? 1 : 0}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              }
            </div>

            {/* Emotion Shift Profile */}
            <div className="ad-card ad-emotion-card">
              <div className="ad-card-head">
                <div>
                  <p className="ad-card-title">Emotion Shift Profile</p>
                  <p className="ad-card-sub">Visualizing high volatility &amp; shifts</p>
                </div>
                {emotion.volatility && (
                  <span className="ad-vol-chip"
                    style={{ background: volColor + "1a", color: volColor, border: `1px solid ${volColor}55` }}>
                    {emotion.volatility} VOLATILITY
                  </span>
                )}
              </div>
              {loading
                ? <div className="ad-chart-load"><div className="ad-spinner"/></div>
                : (
                  <div className="ad-emo-body">
                    <StabilityGauge value={emotion.stability || 72}/>
                    <div className="ad-emo-metrics">
                      <MetricBar label="Stress Levels"       value={emotion.stress_level        || 0} color="#ef4444"/>
                      <MetricBar label="Focus Concentration" value={emotion.focus_concentration || 0} color="#22c55e"/>
                      <MetricBar label="Fatigue Onset"       value={emotion.fatigue_onset       || 0} color="#f59e0b"/>
                    </div>
                  </div>
                )
              }
            </div>
          </div>

          {/* Row 3 */}
          <div className="ad-row-2">

            {/* Sign Validation Accuracy */}
            <div className="ad-card">
              <div className="ad-card-head">
                <div>
                  <p className="ad-card-title">Sign Validation Accuracy</p>
                  <p className="ad-card-sub">Correctly identified vs missed road signs</p>
                </div>
                <div className="ad-match-rate">
                  <span className="ad-match-pct">{loading ? "—" : `${signs.match_rate}%`}</span>
                  <span className="ad-match-lbl">Match Rate</span>
                </div>
              </div>
              {loading
                ? <div className="ad-chart-load"><div className="ad-spinner"/></div>
                : <div className="ad-sign-list">{(signs.signs||[]).map((s,i)=><SignRow key={i} sign={s}/>)}</div>
              }
            </div>

            {/* Scene Analysis Metrics */}
            <div className="ad-card ad-scene-card">
              <div className="ad-card-head">
                <p className="ad-card-title">Scene Analysis Metrics</p>
                <p className="ad-card-sub">Environmental context data</p>
              </div>
              {loading
                ? <div className="ad-chart-load"><div className="ad-spinner"/></div>
                : <>
                    <div className="ad-scene-rows">
                      <div className="ad-scene-row">
                        <div>
                          <p className="ad-scene-lbl">URBAN DENSITY</p>
                          <p className="ad-scene-val">{scene.urban_density||"—"}</p>
                        </div>
                        <div className="ad-scene-ico blue"><IcoCity/></div>
                      </div>
                      <div className="ad-scene-row">
                        <div>
                          <p className="ad-scene-lbl">WEATHER STATE</p>
                          <p className="ad-scene-val">{scene.weather_state||"—"}</p>
                        </div>
                        <div className="ad-scene-ico teal"><IcoRain/></div>
                      </div>
                      {scene.temp_c!=null && (
                        <div className="ad-scene-row">
                          <div>
                            <p className="ad-scene-lbl">TEMPERATURE</p>
                            <p className="ad-scene-val">{scene.temp_c}°C</p>
                          </div>
                          <div className="ad-scene-ico orange">
                            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="ad-scene-map">
                      <div className="ad-map-label"><IcoMap/><span>LIVE SCENE MAP</span></div>
                    </div>
                  </>
              }
            </div>
          </div>

        </div>{/* /ad-content */}
      </div>{/* /ad-main */}
    </div>
  );
}
