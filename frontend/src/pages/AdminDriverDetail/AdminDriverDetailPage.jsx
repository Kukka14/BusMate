import React, { useState, useEffect, useRef } from "react";
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
const IcoDownload = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

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

/* ── Drowsiness helpers ─────────────────────────────────────────────────── */
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

/* ── Small info row ─────────────────────────────────────────────────────── */
function InfoRow({ icon, label, value }) {
  return (
    <div className="dd-info-row">
      <span className="dd-info-icon">{icon}</span>
      <span className="dd-info-label">{label}</span>
      <span className="dd-info-value">{value || "—"}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function AdminDriverDetailPage() {
  const navigate        = useNavigate();
  const { id }          = useParams();
  const { state }       = useLocation();

  const token = localStorage.getItem("token");
  const admin = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();

  const [driver,        setDriver       ] = useState(state?.driver || null);
  const [driverLoading, setDriverLoading] = useState(!state?.driver);
  const [scores,        setScores       ] = useState(null);
  const [scoresLoading, setScoresLoading ] = useState(true);
  const [scoresError,   setScoresError  ] = useState("");
  const [expandedIdx,   setExpandedIdx  ] = useState(null);
  const [dwAnalysis,    setDwAnalysis   ] = useState(null);
  const [dwLoading,     setDwLoading    ] = useState(false);
  const [selShiftId,    setSelShiftId   ] = useState(null);
  const [timeline,      setTimeline     ] = useState(null);
  const [tlLoading,     setTlLoading    ] = useState(false);
  const [pdfExporting,    setPdfExporting  ] = useState(false);
  const [bviAnalysis,     setBviAnalysis   ] = useState(null);
  const [bviLoading,      setBviLoading    ] = useState(false);
  const [bviPdfExporting, setBviPdfExporting] = useState(false);
  const [rsdAnalysis,     setRsdAnalysis   ] = useState(null);
  const [rsdLoading,      setRsdLoading    ] = useState(false);
  const [hazardAnalysis,  setHazardAnalysis] = useState(null);
  const [hazardLoading,   setHazardLoading ] = useState(false);
  const [reportExporting, setReportExporting] = useState(false);

  /* auth guard */
  useEffect(() => {
    if (!token || admin.role !== "admin") navigate("/login", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* fetch driver details */
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

  function loadBviAnalysis() {
    if (!id || !token) return;
    setBviLoading(true);
    fetch(`${API}/api/admin/drivers/${id}/bvi-analysis`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setBviAnalysis(data))
      .catch(() => {})
      .finally(() => setBviLoading(false));
  }

  useEffect(() => { loadBviAnalysis(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadRsdAnalysis() {
    if (!id || !token) return;
    setRsdLoading(true);
    fetch(`${API}/api/admin/drivers/${id}/road-sign-analysis`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setRsdAnalysis(data))
      .catch(() => {})
      .finally(() => setRsdLoading(false));
  }
  useEffect(() => { loadRsdAnalysis(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadHazardAnalysis() {
    if (!id || !token) return;
    setHazardLoading(true);
    fetch(`${API}/api/admin/drivers/${id}/hazard-analysis`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setHazardAnalysis(data))
      .catch(() => {})
      .finally(() => setHazardLoading(false));
  }
  useEffect(() => { loadHazardAnalysis(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── PDF Export ─────────────────────────────────────────────────────────── */
  async function exportDrowsinessPDF() {
    if (!dwAnalysis || pdfExporting) return;
    setPdfExporting(true);

    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const W = 210;
      const MARGIN = 15;
      const CW = W - MARGIN * 2;   // content width
      let y = 0;

      /* ── helpers ── */
      const setFont  = (size, style = "normal", color = [30, 40, 60]) => {
        doc.setFontSize(size);
        doc.setFont("helvetica", style);
        doc.setTextColor(...color);
      };
      const fillRect = (x, fy, w, h, rgb) => {
        doc.setFillColor(...rgb);
        doc.rect(x, fy, w, h, "F");
      };
      const hLine = (fy, rgb = [220, 228, 240]) => {
        doc.setDrawColor(...rgb);
        doc.setLineWidth(0.3);
        doc.line(MARGIN, fy, W - MARGIN, fy);
      };

      /* ══ PAGE 1 ══════════════════════════════════════════════════════════ */

      /* Header banner */
      fillRect(0, 0, W, 40, [13, 25, 55]);

      /* BusMate wordmark */
      setFont(8, "bold", [56, 189, 248]);
      doc.text("BusMate", MARGIN, 11);

      /* Report title */
      setFont(16, "bold", [241, 245, 249]);
      doc.text("Drowsiness Analysis Report", MARGIN, 22);

      /* Driver name & ID */
      const driverName = driver?.username || "Unknown Driver";
      const driverId   = `BM-${id?.slice(-5).toUpperCase() || "?????"}`;
      setFont(9, "normal", [148, 163, 184]);
      doc.text(`Driver: ${driverName}   ·   ID: ${driverId}`, MARGIN, 30);
      doc.text(
        `Generated: ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`,
        MARGIN, 36
      );

      y = 50;

      /* ── Summary stats ── */
      const shifts     = dwAnalysis.shifts || [];
      const hourlyData = buildHourly(dwAnalysis.hourly || []);

      const totalShifts  = shifts.length;
      const avgProb      = totalShifts > 0
        ? Math.round(shifts.reduce((s, r) => s + r.avg_prob, 0) / totalShifts * 100)
        : 0;
      const totalAlerts  = shifts.reduce((s, r) => s + r.alert_count, 0);
      const avgDrowsyPct = totalShifts > 0
        ? Math.round(shifts.reduce((s, r) => s + r.drowsy_pct, 0) / totalShifts)
        : 0;

      const stats = [
        { label: "Total Shifts",    value: String(totalShifts),     color: [56, 189, 248] },
        { label: "Avg Drowsy Prob", value: `${avgProb}%`,           color: avgProb >= 60 ? [239,68,68] : avgProb >= 30 ? [245,158,11] : [34,197,94] },
        { label: "Total Alerts",    value: String(totalAlerts),     color: totalAlerts > 10 ? [239,68,68] : [249,115,22] },
        { label: "Avg Drowsy Rate", value: `${avgDrowsyPct}%`,      color: [167, 139, 250] },
      ];

      const boxW = (CW - 9) / 4;
      stats.forEach((stat, i) => {
        const bx = MARGIN + i * (boxW + 3);
        fillRect(bx, y, boxW, 20, [13, 21, 38]);
        doc.setDrawColor(30, 55, 95);
        doc.setLineWidth(0.4);
        doc.rect(bx, y, boxW, 20);

        setFont(14, "bold", stat.color);
        doc.text(stat.value, bx + boxW / 2, y + 10, { align: "center" });

        setFont(6.5, "normal", [100, 116, 139]);
        doc.text(stat.label.toUpperCase(), bx + boxW / 2, y + 16, { align: "center" });
      });

      y += 26;

      /* ── Hourly drowsiness chart ── */
      setFont(8, "bold", [100, 116, 139]);
      doc.text("DROWSINESS BY HOUR OF DAY", MARGIN, y);
      y += 5;

      const chartH   = 42;
      const yAxisW   = 10;
      const chartX   = MARGIN + yAxisW;
      const chartW   = CW - yAxisW;

      /* chart background */
      fillRect(chartX, y, chartW, chartH, [9, 14, 26]);
      doc.setDrawColor(26, 39, 68);
      doc.setLineWidth(0.3);
      doc.rect(chartX, y, chartW, chartH);

      /* reference lines at 30% and 60% */
      const yAt = (pct) => y + chartH - (pct / 100) * chartH;

      doc.setDrawColor(245, 158, 11);
      doc.setLineWidth(0.25);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(chartX, yAt(30), chartX + chartW, yAt(30));

      doc.setDrawColor(239, 68, 68);
      doc.line(chartX, yAt(60), chartX + chartW, yAt(60));
      doc.setLineDashPattern([], 0);

      /* bars */
      const barW  = chartW / 24 - 1;
      hourlyData.forEach((h, i) => {
        if (h.prob === 0) return;
        const bx   = chartX + i * (chartW / 24) + 0.5;
        const bh   = (h.prob / 100) * chartH;
        const by   = y + chartH - bh;
        const rgb  = h.prob >= 60 ? [239,68,68] : h.prob >= 30 ? [245,158,11] : [34,197,94];
        fillRect(bx, by, barW, bh, rgb);
      });

      /* x-axis hour labels (every 4 hours) */
      setFont(6, "normal", [71, 85, 105]);
      [0, 4, 8, 12, 16, 20, 23].forEach(hr => {
        const lx = chartX + hr * (chartW / 24) + (chartW / 24) / 2;
        doc.text(`${hr}h`, lx, y + chartH + 4, { align: "center" });
      });

      /* y-axis labels */
      [0, 30, 60, 100].forEach(pct => {
        setFont(6, "normal", [71, 85, 105]);
        doc.text(`${pct}%`, MARGIN + yAxisW - 1, yAt(pct) + 1.5, { align: "right" });
      });

      y += chartH + 10;

      /* legend */
      const legendItems = [
        { color: [34,197,94],   label: "Alert (<30%)"       },
        { color: [245,158,11],  label: "Caution (30–60%)"   },
        { color: [239,68,68],   label: "Drowsy (>60%)"      },
        { color: [245,158,11],  label: "— 30% threshold", dash: true },
        { color: [239,68,68],   label: "— 60% threshold", dash: true },
      ];
      let lx = MARGIN;
      legendItems.forEach(item => {
        fillRect(lx, y - 2.5, 4, 3, item.color);
        setFont(6.5, "normal", [100, 116, 139]);
        doc.text(item.label, lx + 5.5, y);
        lx += doc.getTextWidth(item.label) + 10;
        if (lx > W - MARGIN - 30) { lx = MARGIN; y += 5; }
      });

      y += 8;
      hLine(y);
      y += 6;

      /* ══ SHIFT HISTORY TABLE ════════════════════════════════════════════ */
      if (shifts.length > 0) {
        setFont(8, "bold", [100, 116, 139]);
        doc.text("SHIFT DROWSINESS HISTORY", MARGIN, y);
        y += 5;

        /* table columns */
        const cols = [
          { label: "Date / Time",  key: "started_at",  w: 38, fmt: v => v ? new Date(v).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—" },
          { label: "Route",        key: "route_name",  w: 35, fmt: v => v || "—" },
          { label: "Duration",     key: "duration_sec",w: 22, fmt: v => fmtDuration(v) },
          { label: "Avg %",        key: "avg_prob",    w: 18, fmt: v => `${Math.round(v*100)}%` },
          { label: "Peak %",       key: "max_prob",    w: 18, fmt: v => `${Math.round(v*100)}%` },
          { label: "Alerts",       key: "alert_count", w: 16, fmt: v => String(v) },
          { label: "Drowsy Rate",  key: "drowsy_pct",  w: 23, fmt: v => `${v}%` },
        ];
        // Ensure col widths sum to CW
        const totalColW = cols.reduce((s, c) => s + c.w, 0);
        const scaleF    = CW / totalColW;
        cols.forEach(c => { c.w = c.w * scaleF; });

        const ROW_H = 7;

        /* header row */
        fillRect(MARGIN, y, CW, ROW_H, [13, 25, 55]);
        let cx2 = MARGIN;
        cols.forEach(col => {
          setFont(6.5, "bold", [148, 163, 184]);
          doc.text(col.label.toUpperCase(), cx2 + col.w / 2, y + 4.5, { align: "center" });
          cx2 += col.w;
        });

        y += ROW_H;

        /* data rows */
        shifts.forEach((sh, rowIdx) => {
          /* page break check — leave 20mm for footer */
          if (y + ROW_H > 277) {
            doc.addPage();
            y = MARGIN;
          }

          const rowBg = rowIdx % 2 === 0 ? [9, 14, 26] : [11, 18, 33];
          fillRect(MARGIN, y, CW, ROW_H, rowBg);

          cx2 = MARGIN;
          cols.forEach(col => {
            const raw   = sh[col.key];
            const str   = col.fmt(raw);
            let   color = [148, 163, 184];

            /* colour-code risk columns */
            if (col.key === "avg_prob") {
              const pct = Math.round((raw || 0) * 100);
              color = pct >= 60 ? [239,68,68] : pct >= 30 ? [245,158,11] : [34,197,94];
            } else if (col.key === "max_prob") {
              const pct = Math.round((raw || 0) * 100);
              color = pct >= 60 ? [239,68,68] : pct >= 30 ? [249,115,22] : [148,163,184];
            } else if (col.key === "alert_count") {
              color = raw > 5 ? [239,68,68] : raw > 2 ? [245,158,11] : [148,163,184];
            } else if (col.key === "drowsy_pct") {
              color = raw >= 30 ? [167,139,250] : [148,163,184];
            }

            setFont(6.5, "normal", color);
            /* truncate long strings */
            const maxW = col.w - 2;
            const fitted = doc.getTextWidth(str) > maxW
              ? str.substring(0, Math.floor(str.length * maxW / doc.getTextWidth(str)) - 1) + "…"
              : str;
            doc.text(fitted, cx2 + col.w / 2, y + 4.5, { align: "center" });
            cx2 += col.w;
          });

          /* row bottom border */
          doc.setDrawColor(22, 35, 60);
          doc.setLineWidth(0.2);
          doc.line(MARGIN, y + ROW_H, MARGIN + CW, y + ROW_H);

          y += ROW_H;
        });

        /* outer table border */
        doc.setDrawColor(30, 55, 95);
        doc.setLineWidth(0.5);
        doc.rect(MARGIN, y - ROW_H * shifts.length - ROW_H,
                 CW, ROW_H * (shifts.length + 1));

        y += 8;
      }

      /* ══ FOOTER on every page ══════════════════════════════════════════ */
      const totalPages = doc.getNumberOfPages();
      for (let pg = 1; pg <= totalPages; pg++) {
        doc.setPage(pg);
        fillRect(0, 287, W, 10, [8, 12, 22]);
        setFont(6.5, "normal", [71, 85, 105]);
        doc.text("BusMate Fleet Management — Confidential", MARGIN, 293);
        doc.text(`Page ${pg} / ${totalPages}`, W - MARGIN, 293, { align: "right" });
      }

      /* ── Save ── */
      const safeName = (driver?.username || "driver").replace(/\s+/g, "_").toLowerCase();
      doc.save(`drowsiness-report-${safeName}-${new Date().toISOString().slice(0,10)}.pdf`);

    } catch (err) {
      console.error("PDF export error:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setPdfExporting(false);
    }
  }

  /* ── BVI PDF Export ─────────────────────────────────────────────────────── */
  async function exportBviPDF() {
    if (!bviAnalysis || bviPdfExporting) return;
    setBviPdfExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210, MARGIN = 15, CW = W - MARGIN * 2;
      let y = 0;

      const setFont = (size, style = "normal", color = [30, 40, 60]) => {
        doc.setFontSize(size); doc.setFont("helvetica", style); doc.setTextColor(...color);
      };
      const fillRect = (x, fy, w, h, rgb) => {
        doc.setFillColor(...rgb); doc.rect(x, fy, w, h, "F");
      };
      const hLine = (fy, rgb = [220, 228, 240]) => {
        doc.setDrawColor(...rgb); doc.setLineWidth(0.3);
        doc.line(MARGIN, fy, W - MARGIN, fy);
      };

      /* ── Header banner ── */
      fillRect(0, 0, W, 40, [13, 25, 55]);
      setFont(8, "bold", [56, 189, 248]);
      doc.text("BusMate", MARGIN, 11);
      setFont(16, "bold", [241, 245, 249]);
      doc.text("BVI Analysis Report", MARGIN, 22);
      const driverName = driver?.username || "Unknown Driver";
      const driverId   = `BM-${id?.slice(-5).toUpperCase() || "?????"}`;
      setFont(9, "normal", [148, 163, 184]);
      doc.text(`Driver: ${driverName}   ·   ID: ${driverId}`, MARGIN, 30);
      doc.text(
        `Generated: ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`,
        MARGIN, 36
      );
      y = 50;

      /* ── Summary stats ── */
      const sc  = bviAnalysis.state_counts || {};
      const tot = bviAnalysis.total_shifts || 1;
      const bviColor3 = (pct) =>
        pct == null ? [100,116,139] : pct >= 60 ? [239,68,68] : pct >= 30 ? [245,158,11] : [34,197,94];

      const stats = [
        { label: "Total Shifts",    value: String(bviAnalysis.total_shifts), color: [56,189,248] },
        { label: "Avg BVI",         value: bviAnalysis.avg_bvi != null ? `${bviAnalysis.avg_bvi}%` : "—", color: bviColor3(bviAnalysis.avg_bvi) },
        { label: "Stable Shifts",   value: `${sc.stable||0} (${Math.round((sc.stable||0)/tot*100)}%)`,   color: [34,197,94] },
        { label: "Erratic Shifts",  value: `${sc.erratic||0} (${Math.round((sc.erratic||0)/tot*100)}%)`, color: [239,68,68] },
      ];
      const boxW = (CW - 9) / 4;
      stats.forEach((stat, i) => {
        const bx = MARGIN + i * (boxW + 3);
        fillRect(bx, y, boxW, 20, [13, 21, 38]);
        doc.setDrawColor(30, 55, 95); doc.setLineWidth(0.4); doc.rect(bx, y, boxW, 20);
        setFont(12, "bold", stat.color);
        doc.text(stat.value, bx + boxW / 2, y + 10, { align: "center" });
        setFont(6.5, "normal", [100, 116, 139]);
        doc.text(stat.label.toUpperCase(), bx + boxW / 2, y + 16, { align: "center" });
      });
      y += 28;

      /* ── Peak hour callout ── */
      if (bviAnalysis.peak_hour) {
        const ph = bviAnalysis.peak_hour;
        fillRect(MARGIN, y, CW, 10, [30, 18, 10]);
        doc.setDrawColor(245,158,11); doc.setLineWidth(0.4); doc.rect(MARGIN, y, CW, 10);
        setFont(8, "bold", [245,158,11]);
        doc.text(`⚑  Peak volatility hour: ${ph.label}  —  avg BVI ${ph.avg_bvi}%`, MARGIN + 3, y + 6.5);
        y += 14;
      }

      /* ── State distribution bar ── */
      setFont(8, "bold", [100, 116, 139]);
      doc.text("VOLATILITY STATE DISTRIBUTION", MARGIN, y); y += 5;
      const barH = 8;
      let bx2 = MARGIN;
      [{ key:"stable",color:[34,197,94]},{key:"unstable",color:[245,158,11]},{key:"erratic",color:[239,68,68]}].forEach(({key,color}) => {
        const pct = (sc[key]||0)/tot;
        const bw  = CW * pct;
        if (bw > 0) { fillRect(bx2, y, bw, barH, color); bx2 += bw; }
      });
      if (bx2 < MARGIN + CW) fillRect(bx2, y, MARGIN + CW - bx2, barH, [13,21,38]);
      y += barH + 3;
      setFont(6.5, "normal", [100,116,139]);
      doc.text(`Stable: ${sc.stable||0}  ·  Unstable: ${sc.unstable||0}  ·  Erratic: ${sc.erratic||0}`, MARGIN, y);
      y += 8;
      hLine(y); y += 6;

      /* ── BVI by Hour of Day ── */
      const activeHourly = (bviAnalysis.hourly || []).filter(h => h.count > 0);
      if (activeHourly.length > 0) {
        setFont(8, "bold", [100,116,139]); doc.text("BVI BY HOUR OF DAY", MARGIN, y); y += 5;
        const chartH = 40, yAxisW = 10;
        const chartX = MARGIN + yAxisW, chartW = CW - yAxisW;
        fillRect(chartX, y, chartW, chartH, [9,14,26]);
        doc.setDrawColor(26,39,68); doc.setLineWidth(0.3); doc.rect(chartX, y, chartW, chartH);
        const yAt = (pct) => y + chartH - (pct / 100) * chartH;
        doc.setDrawColor(245,158,11); doc.setLineWidth(0.25); doc.setLineDashPattern([1,1],0);
        doc.line(chartX, yAt(30), chartX+chartW, yAt(30));
        doc.setDrawColor(239,68,68);
        doc.line(chartX, yAt(60), chartX+chartW, yAt(60));
        doc.setLineDashPattern([],0);
        const bw24 = chartW / 24 - 1;
        (bviAnalysis.hourly || []).forEach((h, i) => {
          if (h.avg_bvi === 0 && h.count === 0) return;
          const bxh = chartX + i * (chartW / 24) + 0.5;
          const bh  = (h.avg_bvi / 100) * chartH;
          const by  = y + chartH - bh;
          const rgb = h.avg_bvi >= 60 ? [239,68,68] : h.avg_bvi >= 30 ? [245,158,11] : [34,197,94];
          fillRect(bxh, by, bw24, bh, rgb);
        });
        setFont(6, "normal", [71,85,105]);
        [0,4,8,12,16,20,23].forEach(hr => {
          const lx = chartX + hr*(chartW/24)+(chartW/24)/2;
          doc.text(`${hr}h`, lx, y+chartH+4, {align:"center"});
        });
        [0,30,60,100].forEach(pct => {
          setFont(6,"normal",[71,85,105]);
          doc.text(`${pct}%`, MARGIN+yAxisW-1, yAt(pct)+1.5, {align:"right"});
        });
        y += chartH + 10;
      }

      /* ── BVI by Day of Week ── */
      const activeDow = (bviAnalysis.by_day || []).filter(d => d.count > 0);
      if (activeDow.length > 0) {
        hLine(y); y += 6;
        setFont(8, "bold", [100,116,139]); doc.text("BVI BY DAY OF WEEK", MARGIN, y); y += 5;
        const chartH2 = 35, barW2 = CW / 7 - 3;
        fillRect(MARGIN, y, CW, chartH2, [9,14,26]);
        doc.setDrawColor(26,39,68); doc.setLineWidth(0.3); doc.rect(MARGIN, y, CW, chartH2);
        (bviAnalysis.by_day || []).forEach((d, i) => {
          const bxd = MARGIN + i*(CW/7) + 2;
          const bh  = (d.avg_bvi / 100) * chartH2;
          const by  = y + chartH2 - bh;
          const rgb = d.avg_bvi >= 60 ? [239,68,68] : d.avg_bvi >= 30 ? [245,158,11] : d.count > 0 ? [56,189,248] : [20,30,50];
          fillRect(bxd, by, barW2, bh, rgb);
          setFont(6, "normal", [71,85,105]);
          doc.text(d.day, bxd + barW2/2, y+chartH2+4, {align:"center"});
          if (d.avg_bvi > 0) {
            setFont(5.5, "bold", [148,163,184]);
            doc.text(`${d.avg_bvi}%`, bxd+barW2/2, by-1.5, {align:"center"});
          }
        });
        y += chartH2 + 10;
      }

      /* ── Recent shifts table ── */
      const shifts = bviAnalysis.shifts || [];
      if (shifts.length > 0) {
        if (y + 60 > 277) { doc.addPage(); y = MARGIN; }
        hLine(y); y += 6;
        setFont(8, "bold", [100,116,139]); doc.text("SHIFT BVI HISTORY (RECENT)", MARGIN, y); y += 5;
        const cols = [
          {label:"Date",     w:30, fn: s => s.date || s.scored_at?.slice(0,10) || "—"},
          {label:"Shift",    w:28, fn: s => s.shift_time || "—"},
          {label:"Route",    w:52, fn: s => s.route_name || "—"},
          {label:"BVI %",    w:22, fn: s => s.bvi_pct != null ? `${s.bvi_pct}%` : "—"},
          {label:"State",    w:22, fn: s => s.state || "—"},
          {label:"Duration", w:26, fn: s => {
            if (!s.duration_sec) return "—";
            const h = Math.floor(s.duration_sec/3600), m = Math.floor((s.duration_sec%3600)/60);
            return h > 0 ? `${h}h ${m}m` : `${m}m`;
          }},
        ];
        const scaleF2 = CW / cols.reduce((s,c)=>s+c.w,0);
        cols.forEach(c => { c.w *= scaleF2; });
        const ROW_H = 7;
        fillRect(MARGIN, y, CW, ROW_H, [13,25,55]);
        let cx3 = MARGIN;
        cols.forEach(col => {
          setFont(6.5,"bold",[148,163,184]);
          doc.text(col.label.toUpperCase(), cx3+col.w/2, y+4.5, {align:"center"});
          cx3 += col.w;
        });
        y += ROW_H;
        shifts.forEach((sh, ri) => {
          if (y + ROW_H > 277) { doc.addPage(); y = MARGIN; }
          fillRect(MARGIN, y, CW, ROW_H, ri%2===0?[9,14,26]:[11,18,33]);
          cx3 = MARGIN;
          cols.forEach(col => {
            const str = col.fn(sh);
            let color = [148,163,184];
            if (col.label==="BVI %" && sh.bvi_pct != null)
              color = bviColor3(sh.bvi_pct);
            if (col.label==="State")
              color = sh.state==="erratic"?[239,68,68]:sh.state==="unstable"?[245,158,11]:[34,197,94];
            setFont(6.5,"normal",color);
            const maxW = col.w - 2;
            const fitted = doc.getTextWidth(str) > maxW
              ? str.substring(0, Math.floor(str.length*maxW/doc.getTextWidth(str))-1)+"…" : str;
            doc.text(fitted, cx3+col.w/2, y+4.5, {align:"center"});
            cx3 += col.w;
          });
          doc.setDrawColor(22,35,60); doc.setLineWidth(0.2);
          doc.line(MARGIN, y+ROW_H, MARGIN+CW, y+ROW_H);
          y += ROW_H;
        });
        doc.setDrawColor(30,55,95); doc.setLineWidth(0.5);
        doc.rect(MARGIN, y-ROW_H*shifts.length-ROW_H, CW, ROW_H*(shifts.length+1));
      }

      /* ── Footer ── */
      const totalPages = doc.getNumberOfPages();
      for (let pg = 1; pg <= totalPages; pg++) {
        doc.setPage(pg);
        fillRect(0, 287, W, 10, [8,12,22]);
        setFont(6.5,"normal",[71,85,105]);
        doc.text("BusMate Fleet Management — Confidential", MARGIN, 293);
        doc.text(`Page ${pg} / ${totalPages}`, W-MARGIN, 293, {align:"right"});
      }

      const safeName = (driver?.username||"driver").replace(/\s+/g,"_").toLowerCase();
      doc.save(`bvi-report-${safeName}-${new Date().toISOString().slice(0,10)}.pdf`);

    } catch (err) {
      console.error("BVI PDF export error:", err);
      alert("Failed to generate BVI PDF. Please try again.");
    } finally {
      setBviPdfExporting(false);
    }
  }

  /* ── Overall Full Report PDF Export ─────────────────────────────────────── */
  async function exportFullReport() {
    if (reportExporting) return;
    setReportExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210, MARGIN = 15, CW = W - MARGIN * 2;
      let y = 0;

      const driverName = driver?.username || "Unknown Driver";
      const driverId   = `BM-${id?.slice(-5).toUpperCase() || "?????"}`;
      const p          = driver?.profile || {};
      const genDate    = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });

      const sf = (size, style = "normal", color = [148,163,184]) => {
        doc.setFontSize(size); doc.setFont("helvetica", style); doc.setTextColor(...color);
      };
      const fr = (x, fy, w, h, rgb) => { doc.setFillColor(...rgb); doc.rect(x, fy, w, h, "F"); };
      const hl = (fy) => { doc.setDrawColor(30,55,95); doc.setLineWidth(0.3); doc.line(MARGIN, fy, W-MARGIN, fy); };

      const newPage = () => { doc.addPage(); y = MARGIN; };
      const checkY  = (need = 20) => { if (y + need > 277) newPage(); };

      /* ══ COVER PAGE ═══════════════════════════════════════════════════════ */
      fr(0, 0, W, 297, [7, 13, 28]);
      fr(0, 0, W, 65, [13, 25, 55]);
      sf(9, "bold", [56,189,248]);
      doc.text("BusMate Fleet Management", MARGIN, 14);
      sf(22, "bold", [241,245,249]);
      doc.text("Driver Safety Report", MARGIN, 30);
      sf(10, "normal", [148,163,184]);
      doc.text(`Driver: ${driverName}   ·   ID: ${driverId}`, MARGIN, 40);
      doc.text(`Generated: ${genDate}`, MARGIN, 48);
      doc.text(`Company: ${driver?.company || "—"}`, MARGIN, 56);

      /* cover info grid */
      const infoItems = [
        { label: "Vehicle",   val: p.vehicle || "—" },
        { label: "Route",     val: p.route   || "—" },
        { label: "Shift",     val: p.shift   || "—" },
        { label: "Exp. Yrs",  val: p.experience_years ? `${p.experience_years} yrs` : "—" },
        { label: "License",   val: p.license_number  || "—" },
        { label: "Phone",     val: p.phone           || "—" },
      ];
      const colW = (CW - 5) / 3;
      infoItems.forEach((it, i) => {
        const bx = MARGIN + (i % 3) * (colW + 2.5);
        const by = 74 + Math.floor(i / 3) * 22;
        fr(bx, by, colW, 18, [13,21,38]);
        doc.setDrawColor(30,55,95); doc.setLineWidth(0.4); doc.rect(bx, by, colW, 18);
        sf(7, "normal", [100,116,139]);
        doc.text(it.label.toUpperCase(), bx + colW/2, by + 6, { align: "center" });
        sf(10, "bold", [241,245,249]);
        const maxW = colW - 4;
        const txt = doc.getTextWidth(it.val) > maxW
          ? it.val.substring(0, Math.floor(it.val.length * maxW / doc.getTextWidth(it.val)) - 1) + "…"
          : it.val;
        doc.text(txt, bx + colW/2, by + 14, { align: "center" });
      });

      /* Sections overview */
      y = 125;
      sf(8, "bold", [100,116,139]);
      doc.text("REPORT SECTIONS", MARGIN, y); y += 6;
      const sections = [
        { n: "1", title: "Shift Scores Summary",         color: [56,189,248]   },
        { n: "2", title: "BVI (Behaviour Volatility Index)", color: [167,139,250]},
        { n: "3", title: "Drowsiness Analysis",          color: [239,68,68]    },
        { n: "4", title: "Road Sign Detection",          color: [34,197,94]    },
        { n: "5", title: "Route Hazard Risk Prediction", color: [245,158,11]   },
      ];
      sections.forEach(s => {
        fr(MARGIN, y, CW, 11, [13,21,38]);
        doc.setDrawColor(s.color[0], s.color[1], s.color[2]); doc.setLineWidth(0.5);
        doc.line(MARGIN, y, MARGIN + 2, y + 11);
        sf(9, "bold", s.color);
        doc.text(s.n, MARGIN + 6, y + 7.5);
        sf(9, "normal", [241,245,249]);
        doc.text(s.title, MARGIN + 14, y + 7.5);
        y += 14;
      });

      /* footer */
      fr(0, 287, W, 10, [8,12,22]);
      sf(6.5, "normal", [71,85,105]);
      doc.text("BusMate Fleet Management — Confidential", MARGIN, 293);
      doc.text(`Page 1`, W - MARGIN, 293, { align: "right" });

      /* ══ PAGE 2 — SHIFT SCORES ════════════════════════════════════════════ */
      newPage();
      fr(0, 0, W, 20, [13,25,55]);
      sf(13, "bold", [241,245,249]);
      doc.text("1. Shift Scores Summary", MARGIN, 13);
      y = 28;

      const latestScore = scores?.length ? scores[scores.length - 1] : null;
      const avgTotal    = scores?.length
        ? Math.round(scores.reduce((s, r) => s + (r.score?.total_score ?? 0), 0) / scores.length)
        : null;
      const scoreStats = [
        { label: "Total Shifts",  val: String(scores?.length ?? 0),       color: [56,189,248] },
        { label: "Avg Score",     val: avgTotal != null ? `${avgTotal}` : "—", color: avgTotal >= 75 ? [34,197,94] : avgTotal >= 50 ? [245,158,11] : [239,68,68] },
        { label: "Latest Score",  val: latestScore?.score?.total_score != null ? `${Math.round(latestScore.score.total_score)}` : "—", color: [167,139,250] },
        { label: "Latest Tier",   val: latestScore?.score?.tier || "—",   color: [249,115,22] },
      ];
      const bW = (CW - 9) / 4;
      scoreStats.forEach((st, i) => {
        const bx = MARGIN + i * (bW + 3);
        fr(bx, y, bW, 20, [13,21,38]);
        doc.setDrawColor(30,55,95); doc.setLineWidth(0.4); doc.rect(bx, y, bW, 20);
        sf(13, "bold", st.color);
        doc.text(st.val, bx + bW/2, y + 11, { align: "center" });
        sf(6.5, "normal", [100,116,139]);
        doc.text(st.label.toUpperCase(), bx + bW/2, y + 17, { align: "center" });
      });
      y += 28;

      if (scores?.length) {
        sf(8, "bold", [100,116,139]);
        doc.text("RECENT SHIFTS (last 10)", MARGIN, y); y += 5;
        const sCols = [
          { label: "Date",    w: 32, fn: r => r.date || r.scored_at?.slice(0,10) || "—" },
          { label: "Route",   w: 45, fn: r => r.route_name || "—" },
          { label: "Score",   w: 20, fn: r => r.score?.total_score != null ? `${Math.round(r.score.total_score)}` : "—" },
          { label: "Tier",    w: 28, fn: r => r.score?.tier || "—" },
          { label: "Status",  w: 22, fn: r => r.status || "—" },
          { label: "Dur.",    w: 18, fn: r => r.duration_sec ? fmtDuration(r.duration_sec) : "—" },
          { label: "Emotion", w: 15, fn: r => r.score?.components?.emotion?.score != null ? `${Math.round(r.score.components.emotion.score)}` : "—" },
        ];
        const scale = CW / sCols.reduce((s, c) => s + c.w, 0);
        sCols.forEach(c => { c.w *= scale; });
        const RH = 7;
        fr(MARGIN, y, CW, RH, [13,25,55]);
        let cx = MARGIN;
        sCols.forEach(c => {
          sf(6, "bold", [148,163,184]);
          doc.text(c.label.toUpperCase(), cx + c.w/2, y + 4.5, { align: "center" });
          cx += c.w;
        });
        y += RH;
        scores.slice(-10).reverse().forEach((r, ri) => {
          checkY(RH);
          fr(MARGIN, y, CW, RH, ri%2===0?[9,14,26]:[11,18,33]);
          cx = MARGIN;
          sCols.forEach(c => {
            const str = c.fn(r);
            sf(6.5, "normal", [148,163,184]);
            doc.text(str.length > 12 ? str.substring(0,11)+"…" : str, cx + c.w/2, y + 4.5, { align: "center" });
            cx += c.w;
          });
          doc.setDrawColor(22,35,60); doc.setLineWidth(0.2);
          doc.line(MARGIN, y + RH, MARGIN + CW, y + RH);
          y += RH;
        });
        y += 4;
      }

      /* ══ PAGE 3 — BVI ════════════════════════════════════════════════════ */
      newPage();
      fr(0, 0, W, 20, [13,25,55]);
      sf(13, "bold", [241,245,249]);
      doc.text("2. BVI Score Analysis", MARGIN, 13);
      y = 28;

      if (bviAnalysis && bviAnalysis.total_shifts > 0) {
        const sc2  = bviAnalysis.state_counts || {};
        const tot2 = bviAnalysis.total_shifts || 1;
        const bviC = (pct) => pct == null ? [100,116,139] : pct >= 60 ? [239,68,68] : pct >= 30 ? [245,158,11] : [34,197,94];
        const bviStats = [
          { label: "Total Shifts",   val: `${bviAnalysis.total_shifts}`,                                  color: [56,189,248] },
          { label: "Avg BVI",        val: bviAnalysis.avg_bvi != null ? `${bviAnalysis.avg_bvi}%` : "—",  color: bviC(bviAnalysis.avg_bvi) },
          { label: "Stable Shifts",  val: `${sc2.stable||0} (${Math.round((sc2.stable||0)/tot2*100)}%)`,  color: [34,197,94] },
          { label: "Erratic Shifts", val: `${sc2.erratic||0} (${Math.round((sc2.erratic||0)/tot2*100)}%)`, color: [239,68,68] },
        ];
        bviStats.forEach((st, i) => {
          const bx = MARGIN + i * (bW + 3);
          fr(bx, y, bW, 20, [13,21,38]);
          doc.setDrawColor(30,55,95); doc.setLineWidth(0.4); doc.rect(bx, y, bW, 20);
          sf(11, "bold", st.color);
          doc.text(st.val, bx + bW/2, y + 11, { align: "center" });
          sf(6.5, "normal", [100,116,139]);
          doc.text(st.label.toUpperCase(), bx + bW/2, y + 17, { align: "center" });
        });
        y += 28;

        /* state distribution bar */
        sf(7, "bold", [100,116,139]);
        doc.text("VOLATILITY STATE DISTRIBUTION", MARGIN, y); y += 4;
        const barData = [
          { key:"stable",   color:[34,197,94],   count: sc2.stable||0   },
          { key:"unstable", color:[245,158,11],  count: sc2.unstable||0 },
          { key:"erratic",  color:[239,68,68],   count: sc2.erratic||0  },
        ];
        barData.forEach(b => {
          const pct = Math.round(b.count / tot2 * 100);
          if (pct > 0) {
            fr(MARGIN, y, CW * pct / 100, 6, b.color);
            MARGIN; // keep MARGIN reference
          }
        });
        let xOff = MARGIN;
        barData.forEach(b => {
          const pct = Math.round(b.count / tot2 * 100);
          if (pct > 0) { xOff += CW * pct / 100; }
        });
        y += 10;
        sf(6.5, "normal", [100,116,139]);
        doc.text(`Stable: ${sc2.stable||0}  Unstable: ${sc2.unstable||0}  Erratic: ${sc2.erratic||0}`, MARGIN, y);
        y += 8;
        if (bviAnalysis.peak_hour) {
          fr(MARGIN, y, CW, 10, [30,18,10]);
          doc.setDrawColor(245,158,11); doc.setLineWidth(0.4); doc.rect(MARGIN, y, CW, 10);
          sf(8, "bold", [245,158,11]);
          doc.text(`Peak volatility hour: ${bviAnalysis.peak_hour.label}  —  avg BVI ${bviAnalysis.peak_hour.avg_bvi}%`, MARGIN + 4, y + 6.5);
          y += 14;
        }
      } else {
        sf(10, "normal", [100,116,139]);
        doc.text("No BVI data available for this driver.", MARGIN, y); y += 10;
      }

      /* ══ PAGE 4 — DROWSINESS ═════════════════════════════════════════════ */
      newPage();
      fr(0, 0, W, 20, [13,25,55]);
      sf(13, "bold", [241,245,249]);
      doc.text("3. Drowsiness Analysis", MARGIN, 13);
      y = 28;

      if (dwAnalysis?.shifts?.length) {
        const dw = dwAnalysis.shifts;
        const avgPr  = Math.round(dw.reduce((s, r) => s + r.avg_prob, 0) / dw.length * 100);
        const alerts = dw.reduce((s, r) => s + r.alert_count, 0);
        const avgDr  = Math.round(dw.reduce((s, r) => s + r.drowsy_pct, 0) / dw.length);
        const dwStats = [
          { label:"Total Shifts",    val: String(dw.length),  color:[56,189,248]  },
          { label:"Avg Drowsy Prob", val: `${avgPr}%`,         color: avgPr>=60?[239,68,68]:avgPr>=30?[245,158,11]:[34,197,94] },
          { label:"Total Alerts",    val: String(alerts),      color: alerts>10?[239,68,68]:[249,115,22] },
          { label:"Avg Drowsy Rate", val: `${avgDr}%`,         color:[167,139,250] },
        ];
        dwStats.forEach((st, i) => {
          const bx = MARGIN + i * (bW + 3);
          fr(bx, y, bW, 20, [13,21,38]);
          doc.setDrawColor(30,55,95); doc.setLineWidth(0.4); doc.rect(bx, y, bW, 20);
          sf(13, "bold", st.color);
          doc.text(st.val, bx + bW/2, y + 11, { align: "center" });
          sf(6.5, "normal", [100,116,139]);
          doc.text(st.label.toUpperCase(), bx + bW/2, y + 17, { align: "center" });
        });
        y += 28;
        sf(8, "bold", [100,116,139]);
        doc.text("RECENT DROWSINESS SHIFTS (last 10)", MARGIN, y); y += 5;
        const dwCols = [
          { label:"Date",   w:38, fn: r => r.started_at ? new Date(r.started_at).toLocaleDateString() : "—" },
          { label:"Route",  w:45, fn: r => r.route_name || "—" },
          { label:"Avg %",  w:20, fn: r => `${Math.round(r.avg_prob*100)}%` },
          { label:"Peak %", w:20, fn: r => `${Math.round(r.max_prob*100)}%` },
          { label:"Alerts", w:18, fn: r => String(r.alert_count) },
          { label:"Drowsy", w:19, fn: r => `${r.drowsy_pct}%` },
        ];
        const dwScale = CW / dwCols.reduce((s, c) => s + c.w, 0);
        dwCols.forEach(c => { c.w *= dwScale; });
        const DH = 7;
        fr(MARGIN, y, CW, DH, [13,25,55]);
        let dxC = MARGIN;
        dwCols.forEach(c => {
          sf(6, "bold", [148,163,184]);
          doc.text(c.label.toUpperCase(), dxC + c.w/2, y + 4.5, { align: "center" });
          dxC += c.w;
        });
        y += DH;
        dw.slice(0, 10).forEach((r, ri) => {
          checkY(DH);
          fr(MARGIN, y, CW, DH, ri%2===0?[9,14,26]:[11,18,33]);
          dxC = MARGIN;
          dwCols.forEach(c => {
            sf(6.5, "normal", [148,163,184]);
            const str = c.fn(r);
            doc.text(str, dxC + c.w/2, y + 4.5, { align: "center" });
            dxC += c.w;
          });
          doc.setDrawColor(22,35,60); doc.setLineWidth(0.2);
          doc.line(MARGIN, y + DH, MARGIN + CW, y + DH);
          y += DH;
        });
        y += 4;
      } else {
        sf(10, "normal", [100,116,139]);
        doc.text("No drowsiness data available for this driver.", MARGIN, y); y += 10;
      }

      /* ══ PAGE 5 — ROAD SIGN DETECTION ════════════════════════════════════ */
      newPage();
      fr(0, 0, W, 20, [13,25,55]);
      sf(13, "bold", [241,245,249]);
      doc.text("4. Road Sign Detection Analysis", MARGIN, 13);
      y = 28;

      if (rsdAnalysis && rsdAnalysis.total_detections > 0) {
        const rsdStats = [
          { label:"Total Detections",  val: String(rsdAnalysis.total_detections), color:[34,197,94]   },
          { label:"Avg Confidence",    val: `${rsdAnalysis.avg_confidence}%`,     color:[56,189,248]  },
          { label:"Avg Distance",      val: rsdAnalysis.avg_distance != null ? `${rsdAnalysis.avg_distance}m` : "—", color:[167,139,250] },
          { label:"Shifts w/ Signs",   val: String(rsdAnalysis.by_shift?.length || 0), color:[249,115,22] },
        ];
        rsdStats.forEach((st, i) => {
          const bx = MARGIN + i * (bW + 3);
          fr(bx, y, bW, 20, [13,21,38]);
          doc.setDrawColor(30,55,95); doc.setLineWidth(0.4); doc.rect(bx, y, bW, 20);
          sf(13, "bold", st.color);
          doc.text(st.val, bx + bW/2, y + 11, { align: "center" });
          sf(6.5, "normal", [100,116,139]);
          doc.text(st.label.toUpperCase(), bx + bW/2, y + 17, { align: "center" });
        });
        y += 28;

        if (rsdAnalysis.sign_types?.length) {
          sf(8, "bold", [100,116,139]);
          doc.text("TOP DETECTED SIGN TYPES", MARGIN, y); y += 5;
          const topN    = rsdAnalysis.sign_types.slice(0, 8);
          const maxCnt  = topN[0]?.count || 1;
          topN.forEach(st => {
            checkY(12);
            const barLen = (st.count / maxCnt) * (CW - 50);
            fr(MARGIN, y, barLen + 2, 7, [13,48,94]);
            sf(7, "normal", [148,163,184]);
            doc.text(st.class_name, MARGIN + 2, y + 5.2);
            sf(7, "bold", [56,189,248]);
            doc.text(`${st.count}`, MARGIN + CW - 10, y + 5.2, { align: "right" });
            y += 9;
          });
          y += 4;
        }

        if (rsdAnalysis.status_breakdown) {
          sf(7, "bold", [100,116,139]);
          doc.text("SIGN STATUS: " +
            Object.entries(rsdAnalysis.status_breakdown)
              .map(([k, v]) => `${k}: ${v}`)
              .join("   "), MARGIN, y);
          y += 6;
        }
        if (rsdAnalysis.traffic_congestion_breakdown) {
          sf(7, "bold", [100,116,139]);
          doc.text("TRAFFIC CONGESTION: " +
            Object.entries(rsdAnalysis.traffic_congestion_breakdown)
              .map(([k, v]) => `${k}: ${v}`)
              .join("   "), MARGIN, y);
          y += 8;
        }
      } else {
        sf(10, "normal", [100,116,139]);
        doc.text("No road sign detection data available for this driver.", MARGIN, y); y += 10;
      }

      /* ══ PAGE 6 — HAZARD ANALYSIS ════════════════════════════════════════ */
      newPage();
      fr(0, 0, W, 20, [13,25,55]);
      sf(13, "bold", [241,245,249]);
      doc.text("5. Route Hazard Risk Prediction", MARGIN, 13);
      y = 28;

      if (hazardAnalysis && hazardAnalysis.total_routes > 0) {
        const hzStats = [
          { label:"Total Routes",     val: String(hazardAnalysis.total_routes),     color:[245,158,11] },
          { label:"Avg Risk Score",   val: `${hazardAnalysis.avg_risk_score}/100`,  color: hazardAnalysis.avg_risk_score>=70?[239,68,68]:hazardAnalysis.avg_risk_score>=50?[249,115,22]:[34,197,94] },
          { label:"High Risk Routes", val: String(hazardAnalysis.high_risk_routes?.length || 0), color:[239,68,68] },
          { label:"Most Common",      val: hazardAnalysis.most_common_route?.route?.slice(0,14) || "—", color:[56,189,248] },
        ];
        hzStats.forEach((st, i) => {
          const bx = MARGIN + i * (bW + 3);
          fr(bx, y, bW, 20, [13,21,38]);
          doc.setDrawColor(30,55,95); doc.setLineWidth(0.4); doc.rect(bx, y, bW, 20);
          sf(9, "bold", st.color);
          doc.text(st.val, bx + bW/2, y + 11, { align: "center" });
          sf(6.5, "normal", [100,116,139]);
          doc.text(st.label.toUpperCase(), bx + bW/2, y + 17, { align: "center" });
        });
        y += 28;

        if (hazardAnalysis.risk_distribution) {
          sf(8, "bold", [100,116,139]);
          doc.text("RISK DISTRIBUTION", MARGIN, y); y += 5;
          const riskColors = { "Low Risk":[34,197,94], "Medium Risk":[245,158,11], "High Risk":[249,115,22], "Critical Risk":[239,68,68] };
          const total3 = Object.values(hazardAnalysis.risk_distribution).reduce((s, v) => s + v, 0) || 1;
          Object.entries(hazardAnalysis.risk_distribution).forEach(([label, count]) => {
            checkY(10);
            const pct = Math.round(count / total3 * 100);
            const barLen = pct / 100 * (CW - 55);
            const col = riskColors[label] || [100,116,139];
            fr(MARGIN + 45, y, barLen, 6, col);
            sf(7, "normal", [148,163,184]);
            doc.text(`${label}:`, MARGIN, y + 5);
            sf(7, "bold", col);
            doc.text(`${count} (${pct}%)`, MARGIN + 45 + barLen + 3, y + 5);
            y += 9;
          });
          y += 4;
        }

        if (hazardAnalysis.routes_summary?.length) {
          sf(8, "bold", [100,116,139]);
          doc.text("ROUTES DRIVEN (by frequency)", MARGIN, y); y += 5;
          hazardAnalysis.routes_summary.slice(0, 8).forEach((r, ri) => {
            checkY(10);
            fr(MARGIN, y, CW, 8, ri%2===0?[9,14,26]:[11,18,33]);
            sf(7, "normal", [148,163,184]);
            const rName = r.route.length > 40 ? r.route.substring(0,39)+"…" : r.route;
            doc.text(rName, MARGIN + 2, y + 5.5);
            sf(7, "bold", [100,116,139]);
            doc.text(`×${r.count}`, MARGIN + CW*0.7, y + 5.5);
            const rc = { "Low Risk":[34,197,94], "Medium Risk":[245,158,11], "High Risk":[249,115,22], "Critical Risk":[239,68,68] };
            sf(7, "bold", rc[r.risk_label] || [100,116,139]);
            doc.text(r.risk_label, MARGIN + CW - 2, y + 5.5, { align: "right" });
            y += 9;
          });
          y += 4;
        }
      } else {
        sf(10, "normal", [100,116,139]);
        doc.text("No route/schedule data available for hazard analysis.", MARGIN, y); y += 10;
      }

      /* ══ FOOTER on all pages ══════════════════════════════════════════════ */
      const totalPg = doc.getNumberOfPages();
      for (let pg = 1; pg <= totalPg; pg++) {
        doc.setPage(pg);
        fr(0, 287, W, 10, [8,12,22]);
        sf(6.5, "normal", [71,85,105]);
        doc.text("BusMate Fleet Management — Confidential Driver Safety Report", MARGIN, 293);
        doc.text(`Page ${pg} / ${totalPg}`, W - MARGIN, 293, { align: "right" });
      }

      const safeName = (driver?.username || "driver").replace(/\s+/g, "_").toLowerCase();
      doc.save(`full-safety-report-${safeName}-${new Date().toISOString().slice(0,10)}.pdf`);

    } catch (err) {
      console.error("Full report export error:", err);
      alert("Failed to generate report. Please try again.");
    } finally {
      setReportExporting(false);
    }
  }

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

              {scoresLoading && (
                <div className="dd-shift-loading">
                  <div className="dd-spinner"/>
                  <span>Loading shift scores…</span>
                </div>
              )}

              {scoresError && !scoresLoading && (
                <div className="dd-err-bar">
                  <span>{scoresError}</span>
                  <button className="dd-retry-btn" onClick={loadScores}>↺ Retry</button>
                </div>
              )}

              {scores && !scoresLoading && scores.shifts.length === 0 && (
                <div className="dd-empty-shifts">
                  <span style={{ fontSize: "2rem" }}>📋</span>
                  <p>No completed shifts found for this driver.</p>
                  <span>Scores will appear here once the driver completes a shift.</span>
                </div>
              )}

              {scores && !scoresLoading && scores.shifts.length > 0 && (
                <div className="dd-shift-list">
                  {scores.shifts.map((shift, idx) => {
                    const tColor = shift.tier_color || TIER_COLOR[shift.tier] || "#64748b";
                    const isOpen = expandedIdx === idx;
                    return (
                      <div key={idx} className={`dd-shift-row ${isOpen ? "open" : ""}`}>
                        <div className="dd-shift-head"
                          onClick={() => setExpandedIdx(isOpen ? null : idx)}>
                          <ScoreRing score={shift.total_score} size={64}/>
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

              {/* Card header with export button */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
                <p className="dd-card-title" style={{margin:0}}>😴 Drowsiness Analytics</p>
                <div style={{display:"flex",gap:"0.5rem",alignItems:"center"}}>
                  <button className="dd-retry-btn" onClick={loadDwAnalysis}
                    style={{fontSize:"0.72rem"}}>
                    ↺ Refresh
                  </button>
                  {dwAnalysis && (dwAnalysis.shifts?.length > 0 || dwAnalysis.hourly?.length > 0) && (
                    <button
                      className={`dd-export-pdf-btn ${pdfExporting ? "loading" : ""}`}
                      onClick={exportDrowsinessPDF}
                      disabled={pdfExporting}
                      title="Export drowsiness report as PDF"
                    >
                      {pdfExporting ? (
                        <>
                          <span className="dd-export-spin"/>
                          Generating…
                        </>
                      ) : (
                        <>
                          <IcoDownload />
                          Export PDF
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {dwLoading && (
                <div className="dd-shift-loading">
                  <div className="dd-spinner"/>
                  <span>Loading analytics…</span>
                </div>
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
                                <DwRing prob={sh.avg_prob}/>
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
                                          t:    fmtElapsed(r.shift_elapsed_seconds),
                                          prob: Math.round((r.drowsy_prob||0)*100),
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

            {/* ── BVI Time Analysis ── */}
            <div className="dd-card" style={{marginTop:"1rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
                <p className="dd-card-title" style={{margin:0}}>🧠 BVI Score Time Analysis</p>
                <div style={{display:"flex",gap:"0.5rem",alignItems:"center"}}>
                  <button className="dd-retry-btn" onClick={loadBviAnalysis} style={{fontSize:"0.72rem"}}>↺ Refresh</button>
                  {bviAnalysis && bviAnalysis.total_shifts > 0 && (
                    <button
                      className={`dd-export-pdf-btn ${bviPdfExporting ? "loading" : ""}`}
                      onClick={exportBviPDF}
                      disabled={bviPdfExporting}
                      title="Export BVI analysis as PDF"
                    >
                      {bviPdfExporting ? (
                        <><span className="dd-export-spin"/>Generating…</>
                      ) : (
                        <><IcoDownload />Export PDF</>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {bviLoading && (
                <div className="dd-shift-loading">
                  <div className="dd-spinner"/>
                  <span>Loading BVI analysis…</span>
                </div>
              )}

              {!bviLoading && bviAnalysis && bviAnalysis.total_shifts === 0 && (
                <div style={{textAlign:"center",padding:"1.5rem",color:"#334155"}}>
                  <div style={{fontSize:"1.8rem",marginBottom:8}}>🧠</div>
                  <p style={{fontSize:"0.82rem",margin:0}}>No BVI data yet.</p>
                  <p style={{fontSize:"0.72rem",margin:"4px 0 0",color:"#475569"}}>
                    BVI scores are collected automatically during active driving shifts.
                  </p>
                </div>
              )}

              {!bviLoading && bviAnalysis && bviAnalysis.total_shifts > 0 && (() => {
                const sc  = bviAnalysis.state_counts || {};
                const tot = bviAnalysis.total_shifts || 1;
                const bviColor = (pct) =>
                  pct == null ? "#475569" : pct >= 60 ? "#ef4444" : pct >= 30 ? "#f59e0b" : "#22c55e";

                return (
                  <>
                    {/* ── Summary stat row ── */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.5rem",marginBottom:"1.25rem"}}>
                      {[
                        {
                          label: "Avg BVI",
                          value: bviAnalysis.avg_bvi != null ? `${bviAnalysis.avg_bvi}%` : "—",
                          color: bviColor(bviAnalysis.avg_bvi),
                        },
                        {
                          label: "Peak Hour",
                          value: bviAnalysis.peak_hour ? bviAnalysis.peak_hour.label : "—",
                          color: "#f97316",
                          sub: bviAnalysis.peak_hour ? `${bviAnalysis.peak_hour.avg_bvi}% avg` : null,
                        },
                        {
                          label: "Stable Shifts",
                          value: `${sc.stable || 0}`,
                          color: "#22c55e",
                          sub: `${Math.round((sc.stable||0)/tot*100)}%`,
                        },
                        {
                          label: "Erratic Shifts",
                          value: `${sc.erratic || 0}`,
                          color: "#ef4444",
                          sub: `${Math.round((sc.erratic||0)/tot*100)}%`,
                        },
                      ].map(s => (
                        <div key={s.label} style={{background:"#071828",border:"1px solid #1e293b",borderRadius:10,padding:"0.6rem 0.75rem",textAlign:"center"}}>
                          <div style={{fontSize:"1.1rem",fontWeight:800,color:s.color}}>{s.value}</div>
                          {s.sub && <div style={{fontSize:"0.6rem",color:"#475569"}}>{s.sub}</div>}
                          <div style={{fontSize:"0.62rem",color:"#64748b",marginTop:2}}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* ── State distribution bar ── */}
                    {tot > 0 && (
                      <div style={{marginBottom:"1.25rem"}}>
                        <p style={{fontSize:"0.72rem",color:"#64748b",fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"0.4rem"}}>
                          Volatility State Distribution
                        </p>
                        <div style={{display:"flex",borderRadius:6,overflow:"hidden",height:12,background:"#0d1b2e"}}>
                          {[
                            {key:"stable",   color:"#22c55e"},
                            {key:"unstable", color:"#f59e0b"},
                            {key:"erratic",  color:"#ef4444"},
                          ].map(({key, color}) => {
                            const pct = Math.round((sc[key]||0)/tot*100);
                            return pct > 0 ? (
                              <div key={key} title={`${key}: ${sc[key]} shifts (${pct}%)`}
                                style={{width:`${pct}%`,background:color,transition:"width 0.5s"}}/>
                            ) : null;
                          })}
                        </div>
                        <div style={{display:"flex",gap:"1rem",marginTop:"0.3rem",fontSize:"0.65rem",color:"#475569",justifyContent:"flex-end"}}>
                          <span style={{color:"#22c55e"}}>■ Stable ({sc.stable||0})</span>
                          <span style={{color:"#f59e0b"}}>■ Unstable ({sc.unstable||0})</span>
                          <span style={{color:"#ef4444"}}>■ Erratic ({sc.erratic||0})</span>
                        </div>
                      </div>
                    )}

                    {/* ── BVI Trend over recent shifts ── */}
                    {bviAnalysis.shifts?.length > 1 && (
                      <div style={{marginBottom:"1.25rem"}}>
                        <p style={{fontSize:"0.72rem",color:"#64748b",fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"0.5rem"}}>
                          BVI Trend — Recent Shifts
                          <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,color:"#475569",marginLeft:6}}>
                            (lower = calmer driver)
                          </span>
                        </p>
                        <ResponsiveContainer width="100%" height={140}>
                          <AreaChart
                            data={bviAnalysis.shifts.map((s, i) => ({
                              name:  s.date || `Shift ${i+1}`,
                              bvi:   s.bvi_pct ?? 0,
                              state: s.state,
                            }))}
                            margin={{top:4, right:4, left:-20, bottom:0}}
                          >
                            <defs>
                              <linearGradient id="bviGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.35}/>
                                <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.02}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="name" tick={{fill:"#475569",fontSize:9}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                            <YAxis tick={{fill:"#475569",fontSize:10}} tickLine={false} axisLine={false} domain={[0,100]} tickFormatter={v=>`${v}%`}/>
                            <Tooltip
                              formatter={(v, n, p) => [`${v}% (${p.payload.state || "—"})`, "BVI"]}
                              contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,fontSize:"0.75rem"}}
                            />
                            <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1}/>
                            <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1}/>
                            <Area type="monotone" dataKey="bvi" stroke="#a78bfa" strokeWidth={1.5}
                              fill="url(#bviGrad)" dot={{r:2,fill:"#a78bfa"}}/>
                          </AreaChart>
                        </ResponsiveContainer>
                        <div style={{display:"flex",gap:"1rem",fontSize:"0.65rem",color:"#475569",marginTop:2,justifyContent:"flex-end"}}>
                          <span style={{color:"#22c55e"}}>■ Stable (&lt;30%)</span>
                          <span style={{color:"#f59e0b"}}>— 30% threshold</span>
                          <span style={{color:"#ef4444"}}>— 60% threshold</span>
                        </div>
                      </div>
                    )}

                    {/* ── BVI by Hour of Day ── */}
                    {bviAnalysis.hourly?.some(h => h.count > 0) && (
                      <div style={{marginBottom:"1.25rem"}}>
                        <p style={{fontSize:"0.72rem",color:"#64748b",fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"0.5rem"}}>
                          BVI by Hour of Day
                          <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,color:"#475569",marginLeft:6}}>
                            (when is the driver most volatile?)
                          </span>
                        </p>
                        <ResponsiveContainer width="100%" height={130}>
                          <BarChart
                            data={bviAnalysis.hourly}
                            barSize={10}
                            margin={{top:4, right:4, left:-20, bottom:0}}
                          >
                            <XAxis dataKey="label" tick={{fill:"#475569",fontSize:9}} tickLine={false} axisLine={false}
                              tickFormatter={(v,i) => i % 3 === 0 ? v : ""}/>
                            <YAxis tick={{fill:"#475569",fontSize:10}} tickLine={false} axisLine={false} domain={[0,100]} tickFormatter={v=>`${v}%`}/>
                            <Tooltip
                              formatter={(v, n, p) => [`${v}% avg BVI · ${p.payload.count} shifts`, p.payload.label]}
                              contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,fontSize:"0.75rem"}}
                              labelStyle={{display:"none"}}
                            />
                            <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1}/>
                            <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1}/>
                            <Bar dataKey="avg_bvi" radius={[3,3,0,0]}>
                              {bviAnalysis.hourly.map((h, i) => (
                                <Cell key={i} fill={h.avg_bvi >= 60 ? "#ef4444" : h.avg_bvi >= 30 ? "#f59e0b" : h.count > 0 ? "#22c55e" : "#1e293b"}/>
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* ── BVI by Day of Week ── */}
                    {bviAnalysis.by_day?.some(d => d.count > 0) && (
                      <div>
                        <p style={{fontSize:"0.72rem",color:"#64748b",fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"0.5rem"}}>
                          BVI by Day of Week
                        </p>
                        <ResponsiveContainer width="100%" height={110}>
                          <BarChart
                            data={bviAnalysis.by_day}
                            barSize={24}
                            margin={{top:4, right:4, left:-20, bottom:0}}
                          >
                            <XAxis dataKey="day" tick={{fill:"#475569",fontSize:10}} tickLine={false} axisLine={false}/>
                            <YAxis tick={{fill:"#475569",fontSize:10}} tickLine={false} axisLine={false} domain={[0,100]} tickFormatter={v=>`${v}%`}/>
                            <Tooltip
                              formatter={(v, n, p) => [`${v}% avg BVI · ${p.payload.count} shifts`, p.payload.day]}
                              contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,fontSize:"0.75rem"}}
                              labelStyle={{display:"none"}}
                            />
                            <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1}/>
                            <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1}/>
                            <Bar dataKey="avg_bvi" radius={[4,4,0,0]}>
                              {bviAnalysis.by_day.map((d, i) => (
                                <Cell key={i} fill={d.avg_bvi >= 60 ? "#ef4444" : d.avg_bvi >= 30 ? "#f59e0b" : d.count > 0 ? "#38bdf8" : "#1e293b"}/>
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* ── Road Sign Detection Analysis ── */}
            <div className="dd-card" style={{marginTop:"1rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
                <p className="dd-card-title" style={{margin:0}}>🚦 Road Sign Detection Analysis</p>
                <button className="dd-retry-btn" onClick={loadRsdAnalysis} style={{fontSize:"0.72rem"}}>↺ Refresh</button>
              </div>

              {rsdLoading && (
                <div className="dd-shift-loading"><div className="dd-spinner"/><span>Loading road sign data…</span></div>
              )}

              {!rsdLoading && rsdAnalysis && rsdAnalysis.total_detections === 0 && (
                <div style={{textAlign:"center",padding:"1.5rem",color:"#334155"}}>
                  <div style={{fontSize:"1.8rem",marginBottom:8}}>🚦</div>
                  <p style={{fontSize:"0.82rem",margin:0}}>No road sign detection data yet.</p>
                  <p style={{fontSize:"0.72rem",margin:"4px 0 0",color:"#475569"}}>
                    Sign detections are captured automatically during active shifts.
                  </p>
                </div>
              )}

              {!rsdLoading && rsdAnalysis && rsdAnalysis.total_detections > 0 && (
                <>
                  {/* Summary stat row */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.5rem",marginBottom:"1.25rem"}}>
                    {[
                      { label:"Total Detections", value: rsdAnalysis.total_detections, color:"#22c55e" },
                      { label:"Avg Confidence",   value: `${rsdAnalysis.avg_confidence}%`, color:"#38bdf8" },
                      { label:"Avg Distance",      value: rsdAnalysis.avg_distance != null ? `${rsdAnalysis.avg_distance}m` : "—", color:"#a78bfa" },
                      { label:"Shifts w/ Signs",   value: rsdAnalysis.by_shift?.length || 0, color:"#f97316" },
                    ].map(s=>(
                      <div key={s.label} style={{background:"#071828",border:"1px solid #1e293b",borderRadius:10,padding:"0.6rem 0.75rem",textAlign:"center"}}>
                        <div style={{fontSize:"1.1rem",fontWeight:800,color:s.color}}>{s.value}</div>
                        <div style={{fontSize:"0.62rem",color:"#64748b",marginTop:2}}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"1rem"}}>
                    {/* Top sign types bar chart */}
                    {rsdAnalysis.sign_types?.length > 0 && (
                      <div>
                        <p style={{fontSize:"0.72rem",color:"#64748b",fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"0.5rem"}}>
                          Top Sign Types
                        </p>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={rsdAnalysis.sign_types.slice(0,8)} layout="vertical"
                            margin={{top:0,right:20,left:5,bottom:0}}>
                            <XAxis type="number" tick={{fill:"#475569",fontSize:9}} tickLine={false} axisLine={false}/>
                            <YAxis dataKey="class_name" type="category" width={90}
                              tick={{fill:"#94a3b8",fontSize:9}} tickLine={false} axisLine={false}/>
                            <Tooltip
                              formatter={(v)=>[`${v} detections`,"Count"]}
                              contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,fontSize:"0.72rem"}}
                            />
                            <Bar dataKey="count" radius={[0,4,4,0]}>
                              {rsdAnalysis.sign_types.slice(0,8).map((_, i)=>(
                                <Cell key={i} fill={["#22c55e","#38bdf8","#a78bfa","#f59e0b","#f97316","#ef4444","#06b6d4","#84cc16"][i%8]}/>
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Status + congestion breakdown */}
                    <div>
                      {rsdAnalysis.status_breakdown && Object.keys(rsdAnalysis.status_breakdown).length > 0 && (
                        <>
                          <p style={{fontSize:"0.72rem",color:"#64748b",fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"0.4rem"}}>
                            Sign Status
                          </p>
                          <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",marginBottom:"0.75rem"}}>
                            {Object.entries(rsdAnalysis.status_breakdown).map(([k, v])=>{
                              const color = k==="Normal"?"#22c55e":k==="Damaged"?"#ef4444":"#f59e0b";
                              return (
                                <div key={k} style={{background:"#071828",border:`1px solid ${color}33`,borderRadius:8,padding:"0.35rem 0.7rem",textAlign:"center"}}>
                                  <div style={{fontSize:"0.95rem",fontWeight:700,color}}>{v}</div>
                                  <div style={{fontSize:"0.6rem",color:"#64748b"}}>{k}</div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                      {rsdAnalysis.traffic_congestion_breakdown && Object.keys(rsdAnalysis.traffic_congestion_breakdown).length > 0 && (
                        <>
                          <p style={{fontSize:"0.72rem",color:"#64748b",fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"0.4rem"}}>
                            Traffic Congestion During Detections
                          </p>
                          <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                            {Object.entries(rsdAnalysis.traffic_congestion_breakdown).map(([k, v])=>{
                              const color = k==="LOW"?"#22c55e":k==="MEDIUM"?"#f59e0b":"#ef4444";
                              return (
                                <div key={k} style={{background:"#071828",border:`1px solid ${color}33`,borderRadius:8,padding:"0.35rem 0.7rem",textAlign:"center"}}>
                                  <div style={{fontSize:"0.95rem",fontWeight:700,color}}>{v}</div>
                                  <div style={{fontSize:"0.6rem",color:"#64748b"}}>{k}</div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Per-shift detection history */}
                  {rsdAnalysis.by_shift?.length > 0 && (
                    <div>
                      <p style={{fontSize:"0.72rem",color:"#64748b",fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"0.4rem"}}>
                        Detection History by Shift
                      </p>
                      <div style={{display:"flex",flexDirection:"column",gap:"0.3rem",maxHeight:200,overflowY:"auto"}}>
                        {rsdAnalysis.by_shift.map((sh, idx)=>(
                          <div key={idx} style={{display:"flex",alignItems:"center",gap:"0.75rem",
                            background:"#071828",borderRadius:8,padding:"0.35rem 0.75rem",
                            border:"1px solid #1e293b",fontSize:"0.75rem"}}>
                            <div style={{color:"#475569",minWidth:80,fontSize:"0.68rem"}}>
                              {sh.date ? new Date(sh.date).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "—"}
                            </div>
                            <div style={{flex:1,color:"#94a3b8",fontSize:"0.68rem"}}>{sh.route_name || sh.status || "—"}</div>
                            <div style={{fontWeight:700,color:"#22c55e"}}>{sh.detection_count} signs</div>
                            <div style={{color:"#64748b",fontSize:"0.68rem"}}>{sh.avg_confidence}% conf</div>
                            {sh.top_sign && <div style={{background:"#0d1b2e",borderRadius:5,padding:"0.15rem 0.45rem",color:"#38bdf8",fontSize:"0.65rem"}}>{sh.top_sign}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Route Hazard Risk Analysis ── */}
            <div className="dd-card" style={{marginTop:"1rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
                <p className="dd-card-title" style={{margin:0}}>🗺 Route Hazard Risk Analysis</p>
                <button className="dd-retry-btn" onClick={loadHazardAnalysis} style={{fontSize:"0.72rem"}}>↺ Refresh</button>
              </div>

              {hazardLoading && (
                <div className="dd-shift-loading"><div className="dd-spinner"/><span>Loading hazard data…</span></div>
              )}

              {!hazardLoading && hazardAnalysis && hazardAnalysis.total_routes === 0 && (
                <div style={{textAlign:"center",padding:"1.5rem",color:"#334155"}}>
                  <div style={{fontSize:"1.8rem",marginBottom:8}}>🗺</div>
                  <p style={{fontSize:"0.82rem",margin:0}}>No route data available.</p>
                  <p style={{fontSize:"0.72rem",margin:"4px 0 0",color:"#475569"}}>
                    Hazard risk is derived from the driver's scheduled routes.
                  </p>
                </div>
              )}

              {!hazardLoading && hazardAnalysis && hazardAnalysis.total_routes > 0 && (
                <>
                  {/* Summary stats */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.5rem",marginBottom:"1.25rem"}}>
                    {[
                      { label:"Total Routes",     value: hazardAnalysis.total_routes, color:"#38bdf8" },
                      { label:"Avg Risk Score",   value: `${hazardAnalysis.avg_risk_score}/100`,
                        color: hazardAnalysis.avg_risk_score>=70?"#ef4444":hazardAnalysis.avg_risk_score>=50?"#f97316":hazardAnalysis.avg_risk_score>=30?"#f59e0b":"#22c55e" },
                      { label:"High Risk Routes", value: hazardAnalysis.high_risk_routes?.length || 0, color:"#f97316" },
                      { label:"Unique Routes",    value: hazardAnalysis.routes_summary?.length || 0, color:"#a78bfa" },
                    ].map(s=>(
                      <div key={s.label} style={{background:"#071828",border:"1px solid #1e293b",borderRadius:10,padding:"0.6rem 0.75rem",textAlign:"center"}}>
                        <div style={{fontSize:"1.1rem",fontWeight:800,color:s.color}}>{s.value}</div>
                        <div style={{fontSize:"0.62rem",color:"#64748b",marginTop:2}}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Most common route callout */}
                  {hazardAnalysis.most_common_route && (
                    <div style={{background:"#071020",border:"1px solid #1e3a5f",borderRadius:10,padding:"0.75rem 1rem",marginBottom:"1rem"}}>
                      <div style={{fontSize:"0.65rem",color:"#64748b",letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:4}}>
                        Most Frequent Route
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:"0.75rem",flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,color:"#f0f6ff",fontSize:"0.9rem"}}>
                          {hazardAnalysis.most_common_route.route}
                        </span>
                        <span style={{background:"#0d1b2e",borderRadius:6,padding:"0.2rem 0.5rem",fontSize:"0.7rem",color:"#94a3b8"}}>
                          ×{hazardAnalysis.most_common_route.count} times
                        </span>
                        <span style={{
                          background: `${hazardAnalysis.most_common_route.risk_color}22`,
                          color: hazardAnalysis.most_common_route.risk_color,
                          borderRadius:6,padding:"0.2rem 0.5rem",fontSize:"0.7rem",fontWeight:700}}>
                          {hazardAnalysis.most_common_route.risk_label}
                        </span>
                      </div>
                    </div>
                  )}

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"1rem"}}>
                    {/* Risk distribution chart */}
                    {hazardAnalysis.risk_distribution && Object.keys(hazardAnalysis.risk_distribution).length > 0 && (
                      <div>
                        <p style={{fontSize:"0.72rem",color:"#64748b",fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"0.5rem"}}>
                          Risk Distribution
                        </p>
                        <ResponsiveContainer width="100%" height={130}>
                          <BarChart
                            data={Object.entries(hazardAnalysis.risk_distribution).map(([k,v])=>({label:k,count:v}))}
                            barSize={28} margin={{top:4,right:10,left:-22,bottom:0}}>
                            <XAxis dataKey="label" tick={{fill:"#475569",fontSize:8}} tickLine={false} axisLine={false}/>
                            <YAxis tick={{fill:"#475569",fontSize:9}} tickLine={false} axisLine={false}/>
                            <Tooltip
                              formatter={(v)=>[`${v} routes`,"Count"]}
                              contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,fontSize:"0.72rem"}}
                            />
                            <Bar dataKey="count" radius={[4,4,0,0]}>
                              {Object.keys(hazardAnalysis.risk_distribution).map((k,i)=>(
                                <Cell key={i} fill={{"Low Risk":"#22c55e","Medium Risk":"#f59e0b","High Risk":"#f97316","Critical Risk":"#ef4444"}[k]||"#64748b"}/>
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Routes summary */}
                    {hazardAnalysis.routes_summary?.length > 0 && (
                      <div>
                        <p style={{fontSize:"0.72rem",color:"#64748b",fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:"0.5rem"}}>
                          Routes by Frequency
                        </p>
                        <div style={{display:"flex",flexDirection:"column",gap:"0.3rem",maxHeight:145,overflowY:"auto"}}>
                          {hazardAnalysis.routes_summary.map((r,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:"0.5rem",
                              background:"#071828",borderRadius:7,padding:"0.3rem 0.65rem",
                              border:"1px solid #1e293b",fontSize:"0.72rem"}}>
                              <div style={{flex:1,color:"#94a3b8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.route}</div>
                              <span style={{color:"#475569",minWidth:28,textAlign:"right",fontSize:"0.65rem"}}>×{r.count}</span>
                              <span style={{
                                background:`${r.risk_color}22`,color:r.risk_color,
                                borderRadius:5,padding:"0.1rem 0.4rem",fontSize:"0.62rem",fontWeight:700,whiteSpace:"nowrap"}}>
                                {r.risk_label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* High risk routes warning */}
                  {hazardAnalysis.high_risk_routes?.length > 0 && (
                    <div style={{background:"#1a0a06",border:"1px solid #7c2d12",borderRadius:10,padding:"0.75rem 1rem"}}>
                      <p style={{fontSize:"0.72rem",color:"#f97316",fontWeight:700,margin:"0 0 0.4rem",letterSpacing:"0.04em"}}>
                        ⚠ High / Critical Risk Routes Detected
                      </p>
                      <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
                        {hazardAnalysis.high_risk_routes.map((r,i)=>(
                          <span key={i} style={{background:"#2d0f06",borderRadius:6,padding:"0.2rem 0.6rem",
                            fontSize:"0.7rem",color: r.risk_score>=70?"#ef4444":"#f97316",
                            border:`1px solid ${r.risk_score>=70?"#ef444455":"#f9731655"}`}}>
                            {r.route}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Overall Report Generation ── */}
            <div className="dd-card" style={{marginTop:"1rem",background:"linear-gradient(135deg,#071828 0%,#0d1b34 100%)",border:"1px solid #1e3a5f"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"0.75rem"}}>
                <div>
                  <p className="dd-card-title" style={{margin:"0 0 0.2rem"}}>📋 Full Driver Safety Report</p>
                  <p style={{margin:0,fontSize:"0.72rem",color:"#64748b"}}>
                    Comprehensive PDF combining shift scores, BVI, drowsiness, road sign &amp; hazard analysis.
                  </p>
                </div>
                <button
                  className={`dd-export-pdf-btn ${reportExporting ? "loading" : ""}`}
                  onClick={exportFullReport}
                  disabled={reportExporting}
                  style={{background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",fontSize:"0.8rem",padding:"0.55rem 1.1rem"}}
                  title="Export comprehensive safety report as PDF"
                >
                  {reportExporting ? (
                    <><span className="dd-export-spin"/>Generating Report…</>
                  ) : (
                    <><IcoDownload /> Generate Full Report</>
                  )}
                </button>
              </div>
            </div>

          </section>
        </div>
      </main>
    </div>
  );
}
