import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, ReferenceLine,
} from "recharts";
import AdminSidebar from "../../components/AdminSidebar/AdminSidebar";
import "./AdminDriverDetailPage.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* ── Icons ─────────────────────────────────────────────────────────────────── */
const IcoBack   = () => <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>;
const IcoPen    = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IcoMail   = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;
const IcoPhone  = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.09 4.18 2 2 0 0 1 5.06 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L9.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const IcoID     = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 9h4M14 12h4M14 15h2"/></svg>;
const IcoCal    = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IcoBuild  = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="13"/><path d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/><path d="M9 21v-5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5"/></svg>;

/* ── helpers ─────────────────────────────────────────────────────────────── */
const initials = (name = "") =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

function fmtDuration(sec) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const TIER_COLOR = {
  Excellent:         "#22c55e",
  Good:              "#38bdf8",
  Average:           "#f59e0b",
  "Needs Improvement": "#f97316",
  Poor:              "#ef4444",
};

/* ── Score ring SVG ──────────────────────────────────────────────────────── */
function ScoreRing({ score, size = 72 }) {
  const color  = score == null ? "#334155" : score >= 75 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const r      = size / 2 - 7;
  const cx     = size / 2, cy = size / 2;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - (score ?? 0) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a2744" strokeWidth="7"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.7s ease" }}/>
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color}
        fontSize={size * 0.22} fontWeight="800" fontFamily="Inter,sans-serif">
        {score ?? "—"}
      </text>
      <text x={cx} y={cy + size * 0.18} textAnchor="middle" fill="#334155"
        fontSize={size * 0.13} fontFamily="Inter,sans-serif">/ 100</text>
    </svg>
  );
}

/* ── Component progress bar ──────────────────────────────────────────────── */
function CompBar({ label, score, max }) {
  const pct   = max > 0 ? Math.round((score / max) * 100) : 0;
  const color = pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="dd-comp-bar">
      <div className="dd-comp-bar-head">
        <span>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{score}/{max}</span>
      </div>
      <div className="dd-comp-bar-track">
        <div className="dd-comp-bar-fill"
          style={{ width: `${pct}%`, background: color }}/>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function AdminDriverDetailPage() {
  const navigate        = useNavigate();
  const { id }          = useParams();
  const { state }       = useLocation();                     // driver passed via navigate state

  const token = localStorage.getItem("token");
  const admin = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();

  /* driver profile — use passed state or re-fetch if missing */
  const [driver,        setDriver       ] = useState(state?.driver || null);
  const [driverLoading, setDriverLoading] = useState(!state?.driver);

  /* shift scores */
  const [scores,        setScores       ] = useState(null);
  const [scoresLoading, setScoresLoading ] = useState(true);
  const [scoresError,   setScoresError  ] = useState("");

  /* expanded shift index */
  const [expandedIdx,   setExpandedIdx  ] = useState(null);

  /* drowsiness analytics */
  const [dwAnalysis,    setDwAnalysis   ] = useState(null);
  const [dwLoading,     setDwLoading    ] = useState(false);
  const [selShiftId,    setSelShiftId   ] = useState(null);
  const [timeline,      setTimeline     ] = useState(null);
  const [tlLoading,     setTlLoading    ] = useState(false);

  /* auth guard */
  useEffect(() => {
    if (!token || admin.role !== "admin") navigate("/login", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* fetch driver details if not passed via state */
  useEffect(() => {
    if (driver) return;
    setDriverLoading(true);
    fetch(`${API}/api/admin/drivers/detailed`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const found = Array.isArray(data) ? data.find((d) => d._id === id) : null;
        if (found) setDriver(found);
      })
      .catch(() => {})
      .finally(() => setDriverLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* fetch shift scores */
  function loadScores() {
    if (!id || !token) return;
    setScoresLoading(true);
    setScoresError("");
    fetch(`${API}/api/admin/drivers/${id}/shift-scores`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Server error ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setScores(data);
      })
      .catch((e) => {
        const msg = e.message === "Failed to fetch"
          ? "Cannot reach the backend server — make sure Flask is running (python app.py)."
          : e.message;
        setScoresError(msg);
      })
      .finally(() => setScoresLoading(false));
  }

  useEffect(() => { loadScores(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadDwAnalysis() {
    if (!id || !token) return;
    setDwLoading(true);
    fetch(`${API}/api/drowsiness/driver/${id}/analysis`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setDwAnalysis(data))
      .catch(() => {})
      .finally(() => setDwLoading(false));
  }

  function loadTimeline(shiftId) {
    setSelShiftId(shiftId);
    setTimeline(null);
    setTlLoading(true);
    fetch(`${API}/api/drowsiness/shift/${shiftId}/timeline`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setTimeline(Array.isArray(data) ? data : []))
      .catch(() => setTimeline([]))
      .finally(() => setTlLoading(false));
  }

  useEffect(() => { loadDwAnalysis(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── loading skeleton ── */
  if (driverLoading || !driver) {
    return (
      <div className="dd-root">
        <AdminSidebar activeKey="drivers" />
        <main className="dd-main">
          <div className="dd-loading">
            <div className="dd-spinner"/>
            <span>Loading driver profile…</span>
          </div>
        </main>
      </div>
    );
  }

  const p = driver.profile || {};

  /* ── render ── */
  return (
    <div className="dd-root">
      <AdminSidebar activeKey="drivers" />

      <main className="dd-main">

        {/* ── Top bar ── */}
        <header className="dd-topbar">
          <div className="dd-topbar-left">
            <button className="dd-back-btn" onClick={() => navigate("/admin/drivers")}>
              <IcoBack /> Back to Drivers
            </button>
            <span className="dd-topbar-divider">|</span>
            <span className="dd-topbar-title">Driver Profile</span>
          </div>
          <button className="dd-edit-btn"
            onClick={() => navigate("/admin/drivers", { state: { editId: driver._id } })}>
            <IcoPen /> Edit Driver
          </button>
        </header>

        {/* ── Hero banner ── */}
        <div className="dd-hero">
          <div className="dd-hero-left">
            <div className="dd-hero-av">{initials(driver.username)}</div>
            <div className="dd-hero-info">
              <h1 className="dd-hero-name">{driver.username}</h1>
              <div className="dd-hero-meta">
                <span><IcoMail /> {driver.email}</span>
                {p.phone && <span><IcoPhone /> {p.phone}</span>}
                {driver.company && <span><IcoBuild /> {driver.company}</span>}
              </div>
            </div>
          </div>
          <div className="dd-hero-right">
            <span className={`dd-status-badge ${driver.is_active ? "on" : "off"}`}>
              <span className="dd-status-dot"/>
              {driver.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        {/* ── Body: two columns ── */}
        <div className="dd-body">

          {/* LEFT — profile info */}
          <aside className="dd-profile-col">

            <div className="dd-card">
              <p className="dd-card-title">Account Info</p>
              <div className="dd-info-list">
                <InfoRow icon={<IcoID/>}    label="Driver ID"  value={`BM-${driver._id?.slice(-5).toUpperCase()}`}/>
                <InfoRow icon={<IcoBuild/>} label="Company"    value={driver.company}/>
                <InfoRow icon={<IcoCal/>}   label="Joined"     value={driver.created_at ? new Date(driver.created_at).toLocaleDateString() : "—"}/>
              </div>
            </div>

            <div className="dd-card">
              <p className="dd-card-title">License</p>
              <div className="dd-info-list">
                <InfoRow icon={<IcoID/>}  label="Licence No."  value={p.license_number}/>
                <InfoRow icon={<IcoCal/>} label="Expiry"       value={p.license_expiry}/>
                <InfoRow icon={<IcoID/>}  label="Experience"   value={p.experience_years != null ? `${p.experience_years} yrs` : null}/>
              </div>
            </div>

            {p.vehicle && (
              <div className="dd-card">
                <p className="dd-card-title">Assignment</p>
                <div className="dd-info-list">
                  <InfoRow icon={<IcoID/>}  label="Vehicle"  value={p.vehicle}/>
                  <InfoRow icon={<IcoID/>}  label="Route"    value={p.route}/>
                  <InfoRow icon={<IcoCal/>} label="Shift"    value={p.shift}/>
                </div>
              </div>
            )}

            {p.emergency_contact?.name && (
              <div className="dd-card">
                <p className="dd-card-title">Emergency Contact</p>
                <div className="dd-info-list">
                  <InfoRow icon={<IcoID/>}   label="Name"     value={p.emergency_contact.name}/>
                  <InfoRow icon={<IcoPhone/>} label="Phone"   value={p.emergency_contact.phone}/>
                  <InfoRow icon={<IcoID/>}   label="Relation" value={p.emergency_contact.relation}/>
                </div>
              </div>
            )}
          </aside>

          {/* RIGHT — schedules & scores */}
          <section className="dd-scores-col">

            {/* ── Summary stat bar ── */}
            {scores && (
              <div className="dd-summary-bar">
                <div className="dd-summary-stat">
                  <span>Total Shifts</span>
                  <strong>{scores.total_shifts}</strong>
                </div>
                <div className="dd-summary-stat">
                  <span>Overall Avg Score</span>
                  <strong style={{
                    color: scores.avg_score == null ? "#475569"
                      : scores.avg_score >= 75 ? "#22c55e"
                      : scores.avg_score >= 60 ? "#f59e0b" : "#ef4444"
                  }}>
                    {scores.avg_score ?? "—"}
                    {scores.avg_score != null &&
                      <span className="dd-stat-sub">/100</span>}
                  </strong>
                </div>
                <div className="dd-summary-stat">
                  <span>Best Score</span>
                  <strong style={{ color: "#38bdf8" }}>
                    {scores.best_score ?? "—"}
                    {scores.best_score != null &&
                      <span className="dd-stat-sub">/100</span>}
                  </strong>
                </div>
                <div className="dd-summary-stat">
                  <span>Completed</span>
                  <strong style={{ color: "#94a3b8" }}>{scores.total_shifts} shifts</strong>
                </div>
              </div>
            )}

            <div className="dd-card dd-shifts-card">
              <p className="dd-card-title">Shift History &amp; Scores</p>

              {/* loading */}
              {scoresLoading && (
                <div className="dd-shift-loading">
                  <div className="dd-spinner"/>
                  <span>Loading shift scores…</span>
                </div>
              )}

              {/* error */}
              {scoresError && !scoresLoading && (
                <div className="dd-err-bar">
                  <span>{scoresError}</span>
                  <button className="dd-retry-btn" onClick={loadScores}>↺ Retry</button>
                </div>
              )}

              {/* empty */}
              {scores && !scoresLoading && scores.shifts.length === 0 && (
                <div className="dd-empty-shifts">
                  <span style={{ fontSize: "2rem" }}>📋</span>
                  <p>No completed shifts found for this driver.</p>
                  <span>Scores will appear here once the driver completes a shift.</span>
                </div>
              )}

              {/* shift rows */}
              {scores && !scoresLoading && scores.shifts.length > 0 && (
                <div className="dd-shift-list">
                  {scores.shifts.map((shift, idx) => {
                    const tColor = shift.tier_color || TIER_COLOR[shift.tier] || "#64748b";
                    const isOpen = expandedIdx === idx;
                    return (
                      <div key={idx} className={`dd-shift-row ${isOpen ? "open" : ""}`}>

                        {/* clickable header */}
                        <div className="dd-shift-head"
                          onClick={() => setExpandedIdx(isOpen ? null : idx)}>

                          {/* score ring */}
                          <ScoreRing score={shift.total_score} size={64}/>

                          {/* route + meta */}
                          <div className="dd-shift-info">
                            <div className="dd-shift-route">
                              {shift.start_town || "—"}&nbsp;→&nbsp;{shift.end_town || "—"}
                            </div>
                            <div className="dd-shift-meta-row">
                              {shift.route_name && <span>{shift.route_name}</span>}
                              {shift.bus        && <span>{shift.bus}</span>}
                              {(shift.date || shift.scored_at) &&
                                <span>{shift.date || shift.scored_at?.slice(0, 10)}</span>}
                              {shift.shift_time  && <span>{shift.shift_time}</span>}
                              {shift.duration_sec > 0 &&
                                <span>⏱ {fmtDuration(shift.duration_sec)}</span>}
                            </div>
                          </div>

                          {/* tier badge + chevron */}
                          <div className="dd-shift-right">
                            <span className="dd-tier-badge" style={{
                              color:       tColor,
                              borderColor: tColor + "55",
                              background:  tColor + "18",
                            }}>{shift.tier || "—"}</span>
                            <span className="dd-chevron"
                              style={{ transform: isOpen ? "rotate(180deg)" : "none" }}>
                              ▾
                            </span>
                          </div>
                        </div>

                        {/* expanded component breakdown */}
                        {isOpen && (
                          <div className="dd-shift-comps">
                            <p className="dd-comps-title">Score Breakdown</p>
                            <div className="dd-comps-grid">
                              {Object.entries(shift.components || {}).map(([key, comp]) => (
                                <CompBar key={key}
                                  label={comp.label}
                                  score={comp.score}
                                  max={comp.max}
                                />
                              ))}
                            </div>
                            {Object.keys(shift.components || {}).length === 0 && (
                              <p style={{ color:"#334155", fontSize:"0.78rem", margin:0 }}>
                                No component data available for this shift.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* ── Drowsiness Analytics ── */}
            <div className="dd-card" style={{marginTop:"1rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
                <p className="dd-card-title" style={{margin:0}}>😴 Drowsiness Analytics</p>
                <button className="dd-retry-btn" onClick={loadDwAnalysis} style={{fontSize:"0.72rem"}}>
                  ↺ Refresh
                </button>
              </div>

              {dwLoading && (
                <div className="dd-shift-loading"><div className="dd-spinner"/><span>Loading analytics…</span></div>
              )}

              {!dwLoading && dwAnalysis && (
                <>
                  {/* Hourly pattern chart */}
                  {dwAnalysis.hourly?.length > 0 ? (
                    <div style={{marginBottom:"1.25rem"}}>
                      <p style={{fontSize:"0.72rem",color:"#64748b",fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"0.5rem"}}>
                        Drowsiness by Hour of Day
                        <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,color:"#475569",marginLeft:6}}>
                          (avg drowsy probability)
                        </span>
                      </p>
                      <ResponsiveContainer width="100%" height={140}>
                        <BarChart data={buildHourly(dwAnalysis.hourly)} barSize={14} margin={{top:4,right:4,left:-20,bottom:0}}>
                          <XAxis dataKey="label" tick={{fill:"#475569",fontSize:10}} tickLine={false} axisLine={false}/>
                          <YAxis tickFormatter={v=>`${v}%`} tick={{fill:"#475569",fontSize:10}} tickLine={false} axisLine={false} domain={[0,100]}/>
                          <Tooltip
                            formatter={(v,n,p) => [`${v}% avg · ${p.payload.alerts} alerts`, p.payload.label]}
                            contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,fontSize:"0.75rem"}}
                            labelStyle={{display:"none"}}
                          />
                          <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1}/>
                          <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1}/>
                          <Bar dataKey="prob" radius={[3,3,0,0]}>
                            {buildHourly(dwAnalysis.hourly).map((entry, i) => (
                              <Cell key={i} fill={entry.prob >= 60 ? "#ef4444" : entry.prob >= 30 ? "#f59e0b" : "#22c55e"}/>
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div style={{display:"flex",gap:"1rem",fontSize:"0.65rem",color:"#475569",marginTop:2,justifyContent:"flex-end"}}>
                        <span style={{color:"#22c55e"}}>■ Alert (&lt;30%)</span>
                        <span style={{color:"#f59e0b"}}>■ Caution (30–60%)</span>
                        <span style={{color:"#ef4444"}}>■ Drowsy (&gt;60%)</span>
                      </div>
                    </div>
                  ) : (
                    <p style={{fontSize:"0.78rem",color:"#334155",margin:"0 0 1rem"}}>
                      No hourly data yet — data appears after the driver completes shifts.
                    </p>
                  )}

                  {/* Per-shift drowsiness table */}
                  {dwAnalysis.shifts?.length > 0 && (
                    <div>
                      <p style={{fontSize:"0.72rem",color:"#64748b",fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"0.5rem"}}>
                        Shift-level Drowsiness History
                      </p>
                      <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
                        {dwAnalysis.shifts.map(sh => {
                          const isOpen = selShiftId === sh.shift_id;
                          const alertColor = sh.alert_count > 5 ? "#ef4444" : sh.alert_count > 2 ? "#f59e0b" : "#22c55e";
                          const probColor  = sh.avg_prob * 100 >= 60 ? "#ef4444" : sh.avg_prob * 100 >= 30 ? "#f59e0b" : "#22c55e";
                          return (
                            <div key={sh.shift_id} style={{background:"#0d1b2e",border:"1px solid #1e3a5f",borderRadius:10,overflow:"hidden"}}>
                              <div
                                onClick={() => isOpen ? setSelShiftId(null) : loadTimeline(sh.shift_id)}
                                style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.6rem 0.85rem",cursor:"pointer"}}
                              >
                                {/* Drowsy % ring */}
                                <DwRing prob={sh.avg_prob}/>
                                {/* Info */}
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:"0.82rem",fontWeight:600,color:"#f1f5f9",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                                    {sh.route_name || "—"}
                                  </div>
                                  <div style={{fontSize:"0.68rem",color:"#475569",marginTop:2}}>
                                    {sh.started_at ? new Date(sh.started_at).toLocaleString() : "—"}
                                    {sh.duration_sec > 0 && ` · ${fmtDuration(sh.duration_sec)}`}
                                    {` · ${sh.readings} readings`}
                                  </div>
                                </div>
                                {/* Stats */}
                                <div style={{display:"flex",gap:"1rem",textAlign:"center",flexShrink:0}}>
                                  <div>
                                    <div style={{fontSize:"0.78rem",fontWeight:700,color:probColor}}>{Math.round(sh.avg_prob*100)}%</div>
                                    <div style={{fontSize:"0.6rem",color:"#475569"}}>Avg</div>
                                  </div>
                                  <div>
                                    <div style={{fontSize:"0.78rem",fontWeight:700,color:"#f97316"}}>{Math.round(sh.max_prob*100)}%</div>
                                    <div style={{fontSize:"0.6rem",color:"#475569"}}>Peak</div>
                                  </div>
                                  <div>
                                    <div style={{fontSize:"0.78rem",fontWeight:700,color:alertColor}}>{sh.alert_count}</div>
                                    <div style={{fontSize:"0.6rem",color:"#475569"}}>Alerts</div>
                                  </div>
                                  <div style={{fontSize:"0.75rem",color:"#475569",alignSelf:"center"}}>
                                    {isOpen ? "▲" : "▼"}
                                  </div>
                                </div>
                              </div>

                              {/* Expanded: shift timeline chart */}
                              {isOpen && (
                                <div style={{padding:"0 0.85rem 0.75rem",borderTop:"1px solid #1e3a5f"}}>
                                  {tlLoading && (
                                    <div style={{display:"flex",alignItems:"center",gap:8,padding:"0.5rem 0",color:"#64748b",fontSize:"0.75rem"}}>
                                      <div className="dd-spinner" style={{width:14,height:14}}/>
                                      Loading timeline…
                                    </div>
                                  )}
                                  {!tlLoading && timeline?.length > 0 && (
                                    <>
                                      <p style={{fontSize:"0.68rem",color:"#64748b",margin:"0.5rem 0 0.35rem",fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase"}}>
                                        Drowsiness Timeline
                                      </p>
                                      <ResponsiveContainer width="100%" height={120}>
                                        <AreaChart data={timeline.map(r=>({
                                          t:  fmtElapsed(r.shift_elapsed_seconds),
                                          prob: Math.round((r.drowsy_prob||0)*100),
                                          alert: r.alert_triggered ? Math.round((r.drowsy_prob||0)*100) : null,
                                        }))} margin={{top:4,right:4,left:-22,bottom:0}}>
                                          <defs>
                                            <linearGradient id="dwGrad" x1="0" y1="0" x2="0" y2="1">
                                              <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.35}/>
                                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02}/>
                                            </linearGradient>
                                          </defs>
                                          <XAxis dataKey="t" tick={{fill:"#475569",fontSize:9}} tickLine={false} axisLine={false} interval={0} minTickGap={30}/>
                                          <YAxis tick={{fill:"#475569",fontSize:9}} tickLine={false} axisLine={false} domain={[0,100]} tickFormatter={v=>`${v}%`}/>
                                          <Tooltip
                                            formatter={v=>[`${v}%`,"Drowsy prob"]}
                                            contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,fontSize:"0.72rem"}}
                                          />
                                          <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1}/>
                                          <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1}/>
                                          <Area type="monotone" dataKey="prob" stroke="#ef4444" strokeWidth={1.5}
                                            fill="url(#dwGrad)" dot={false}/>
                                        </AreaChart>
                                      </ResponsiveContainer>
                                      <div style={{display:"flex",gap:"0.75rem",marginTop:"0.4rem",flexWrap:"wrap"}}>
                                        {[
                                          {label:"Peak drowsy", val:`${Math.round(sh.max_prob*100)}%`, color:"#ef4444"},
                                          {label:"Avg drowsy",  val:`${Math.round(sh.avg_prob*100)}%`, color:"#f59e0b"},
                                          {label:"Alerts",      val:sh.alert_count,                    color:"#f97316"},
                                          {label:"Drowsy %",    val:`${sh.drowsy_pct}%`,               color:"#a78bfa"},
                                        ].map(s=>(
                                          <div key={s.label} style={{background:"#071828",borderRadius:7,padding:"0.3rem 0.6rem",border:"1px solid #1e293b"}}>
                                            <div style={{fontSize:"0.58rem",color:"#475569"}}>{s.label}</div>
                                            <div style={{fontSize:"0.82rem",fontWeight:700,color:s.color}}>{s.val}</div>
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                  {!tlLoading && timeline?.length === 0 && (
                                    <p style={{fontSize:"0.75rem",color:"#334155",padding:"0.5rem 0",margin:0}}>
                                      No timeline readings recorded for this shift.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!dwLoading && dwAnalysis.shifts?.length === 0 && dwAnalysis.hourly?.length === 0 && (
                    <div style={{textAlign:"center",padding:"1.5rem",color:"#334155"}}>
                      <div style={{fontSize:"1.8rem",marginBottom:8}}>😴</div>
                      <p style={{fontSize:"0.82rem",margin:0}}>No drowsiness data yet.</p>
                      <p style={{fontSize:"0.72rem",margin:"4px 0 0",color:"#475569"}}>
                        Data is collected automatically every 30 s during active shifts.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

          </section>
        </div>
      </main>
    </div>
  );
}

/* ── Drowsiness helpers ──────────────────────────────────────────────────── */

// Fill in missing hours with 0 so the bar chart is always 24 bars
function buildHourly(hourlyData) {
  const map = {};
  for (const h of hourlyData) map[h.hour] = h;
  return Array.from({ length: 24 }, (_, i) => ({
    label:  `${i}h`,
    prob:   map[i] ? Math.round(map[i].avg_prob * 100) : 0,
    alerts: map[i]?.alert_count ?? 0,
  }));
}

function fmtElapsed(sec) {
  if (!sec && sec !== 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

function DwRing({ prob }) {
  const pct  = Math.round((prob || 0) * 100);
  const col  = pct >= 60 ? "#ef4444" : pct >= 30 ? "#f59e0b" : "#22c55e";
  const r    = 18, cx = 22, cy = 22;
  const circ = 2 * Math.PI * r;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={{flexShrink:0}}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="5"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
        style={{transition:"stroke-dashoffset 0.5s ease"}}/>
      <text x={cx} y={cy + 4} textAnchor="middle" fill={col}
        fontSize="9" fontWeight="700" fontFamily="Inter,sans-serif">{pct}%</text>
    </svg>
  );
}

/* ── Small info row ────────────────────────────────────────────────────────── */
function InfoRow({ icon, label, value }) {
  return (
    <div className="dd-info-row">
      <span className="dd-info-icon">{icon}</span>
      <span className="dd-info-label">{label}</span>
      <span className="dd-info-value">{value || "—"}</span>
    </div>
  );
}
