import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
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
          </section>
        </div>
      </main>
    </div>
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
