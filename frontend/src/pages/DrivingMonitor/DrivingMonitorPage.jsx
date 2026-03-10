import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import "./DrivingMonitor.css";

const API        = import.meta.env.VITE_API_URL || "http://localhost:5000";
const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const CHEATING_LABELS = new Set(["phone", "hand raise", "extra person", "cell phone", "laptop"]);

const EMOTION_COLOR = {
  happy:    "#22c55e",
  neutral:  "#64748b",
  sad:      "#a78bfa",
  angry:    "#ef4444",
  fearful:  "#f97316",
  surprised:"#f59e0b",
  disgust:  "#84cc16",
  disgusted:"#84cc16",
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
const IcoSched   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IcoStats   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const IcoUser    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IcoLogout  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IcoCam     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
const IcoStop    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;
const IcoAlert    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const IcoRoadSign = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18M10.5 10.677a2 2 0 002.828 2.828"/><path d="M13.161 6.843A2 2 0 0015 9a2 2 0 00.8-.167m1.99 1.99C18.954 12.099 20 13.927 20 16a8 8 0 01-8 8 8 8 0 01-8-8c0-4.42 3.579-8 8-8 .786 0 1.547.113 2.268.322"/><path d="M12 4V2"/></svg>;
const IcoScene    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20"/><path d="M4 20L9 9l4 6 3-3 4 8"/><circle cx="17" cy="6" r="2"/></svg>;

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ onLogout }) {
  const navigate = useNavigate();
  const [openKey, setOpenKey] = useState(null);

  const items = [
    
    { key: "dashboard", label: "Dashboard",      Icon: IcoHome,    path: "/driver/dashboard" },
    { key: "section1",  label: "section 1",      Icon: IcoSched,   path: null                },
    { key: "monitor",   label: "Emotion Shift Profile Analysis",               Icon: IcoMonitor,  path: "/driver/monitor" },
    
    {
      key: "roadsign",
      label: "Road Sign Detection",
      Icon: IcoRoadSign,
      path: null,
      sub: [
        { key: "rs-image",  label: "🖼  Image",  path: "/road-sign?mode=image" },
        { key: "rs-video",  label: "🎥  Video",  path: "/road-sign?mode=video" },
        { key: "rs-webcam", label: "📷  Webcam", path: "/road-sign/live"       },
      ],
    },
    {
      key: "roadscene",
      label: "Road Scene Analysis",
      Icon: IcoScene,
      path: null,
      sub: [
        { key: "rsa-image",  label: "🖼  Image",   path: "/road-scene?mode=image" },
        { key: "rsa-video",  label: "🎥  Video",   path: "/road-scene?mode=video" },
        { key: "rsa-hazard", label: "🗺  Hazard",  path: "/road-scene/hazard"    },
      ],
    },
    { key: "profile",   label: "Profile",                         Icon: IcoUser,     path: "/driver/profile",   sub: null },


    // { key: "dashboard", label: "Dashboard",      Icon: IcoHome,    path: "/driver/dashboard" },
    // { key: "section1",  label: "section 1",      Icon: IcoSched,   path: null                },
    // { key: "monitor",   label: "Emotion Shift Profile Analysis",Icon: IcoMonitor, path: "/driver/monitor"   },
    // { key: "section3",  label: "section 3",      Icon: IcoStats,   path: null                },
    // { key: "section4",  label: "section 4",      Icon: IcoStats,   path: null                },
    // { key: "profile",   label: "Profile",        Icon: IcoUser,    path: "/driver/profile"   },
  ];

  return (
    <aside className="dm-sidebar">
      <div className="dm-logo">
        <div className="dm-logo-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <span>DriveGuard</span>
      </div>
      <nav className="dm-nav">
        {items.map(({ key, label, Icon, path, sub }) => (
          <div key={key}>
            <button
              className={`dm-nav-btn ${key === "monitor" ? "active" : ""}`}
              onClick={() => {
                if (sub) setOpenKey(k => k === key ? null : key);
                else if (path) navigate(path);
              }}
            >
              <Icon />
              <span>{label}</span>
              {sub && <span className="dm-nav-arrow">{openKey === key ? "▾" : "▸"}</span>}
            </button>
            {sub && openKey === key && (
              <div className="dm-nav-sub">
                {sub.map(s => (
                  <button key={s.key} className="dm-nav-sub-btn" onClick={() => setTimeout(() => navigate(s.path), 150)}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="dm-sidebar-foot">
        <div className="dm-tip-box">
          <span className="dm-tip-label">MONITOR TIP</span>
          <p className="dm-tip-text">Face the camera in good lighting for best accuracy.</p>
        </div>
        <button className="dm-signout" onClick={onLogout}><IcoLogout />Sign Out</button>
      </div>
    </aside>
  );
}

// ── BVI Gauge ─────────────────────────────────────────────────────────────────
function BVIGauge({ score }) {
  const cx = 60, cy = 60, r = 50;
  const circ = 2 * Math.PI * r;
  const pct  = score != null ? Math.min(1, Math.max(0, score)) : 0;
  const color = bviColor(score);
  const sub   = score == null ? "Waiting…" : pct < 0.30 ? "Stable" : pct < 0.60 ? "Caution" : "Erratic";
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="9" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="9"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.35s" }}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#f1f5f9" fontSize="17" fontWeight="700" fontFamily="Inter,sans-serif">
        {score != null ? score.toFixed(3) : "—"}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="Inter,sans-serif">
        {sub}
      </text>
    </svg>
  );
}

// ── Probability bar ───────────────────────────────────────────────────────────
function ProbBar({ label, value, color }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="dm-prob-row">
      <span className="dm-prob-label">{label}</span>
      <div className="dm-prob-track">
        <div className="dm-prob-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="dm-prob-pct">{pct}%</span>
    </div>
  );
}

// ── Canvas chip label helper ───────────────────────────────────────────────────
function drawChip(ctx, x, y, text, borderColor) {
  ctx.save();
  ctx.font = "bold 12px Inter, system-ui, sans-serif";
  const padX = 7, padY = 5;
  const tw = ctx.measureText(text).width;
  const cw = tw + padX * 2, ch = 22;
  const cy2 = Math.max(2, y - ch - 4);
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(x, cy2, cw, ch);
  ctx.strokeStyle = borderColor || "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, cy2, cw, ch);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x + padX, cy2 + ch - padY);
  ctx.restore();
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DrivingMonitorPage() {
  const navigate   = useNavigate();
  const videoRef   = useRef(null);
  const captureRef = useRef(null);  // hidden 320×240 capture canvas
  const overlayRef = useRef(null);  // visible bbox overlay canvas
  const socketRef  = useRef(null);
  const sendIvRef  = useRef(null);
  const rafRef     = useRef(null);
  const sessionIdRef = useRef(null);

  const user     = JSON.parse(localStorage.getItem("user")  || "{}");
  const token    = localStorage.getItem("token");
  const driverId = user.id || user._id || "driver";

  // tab state
  const [activeTab, setActiveTab] = useState("live"); // "live" | "video"

  // video analysis state
  const [videoFile,    setVideoFile]    = useState(null);
  const [videoFrames,  setVideoFrames]  = useState([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError,   setVideoError]   = useState("");

  // live model state
  const [connected,  setConnected]  = useState(false);
  const [result,     setResult]     = useState(null);
  const [fps,        setFps]        = useState(4);
  const [quality,    setQuality]    = useState(0.75);
  const [camError,   setCamError]   = useState("");

  // session state
  const [sessionId,      setSessionId]      = useState(null);
  const [sessionStart,   setSessionStart]   = useState(null);
  const [sessionFrames,  setSessionFrames]  = useState(0);
  const [sessionBusy,    setSessionBusy]    = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [elapsed,        setElapsed]        = useState("00:00");

  // auth guard
  useEffect(() => { if (!token) navigate("/login"); }, [token, navigate]);
  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  // keep sessionIdRef in sync (avoids stale closure in socket handler)
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── Webcam ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let stream;
    let active = true; // prevents state update / stream leak after unmount
    navigator.mediaDevices
      .getUserMedia({ video: { width: 960, height: 720, facingMode: "user" }, audio: false })
      .then((s) => {
        if (!active) {
          // navigated away before camera finished initialising — release immediately
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setCamError("Camera permission denied or not available."));
    return () => {
      active = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      // clear srcObject so the browser releases the camera indicator light
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  // ── Socket.IO — connect once on mount ───────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["polling", "websocket"] });
    socketRef.current = socket;
    socket.on("connect",    () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("prediction", (payload) => {
      if (!payload?.ok) return;
      setResult(payload);
      // persist frame to MongoDB
      if (sessionIdRef.current && token) {
        const bvi = payload.bvi || {};
        fetch(`${API}/api/driver/session/frame`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id:       sessionIdRef.current,
            emotion:          payload.emotion,
            confidence:       payload.confidence,
            probabilities:    payload.probabilities || {},
            bvi_score:        bvi.bvi_score,
            bvi_state:        bvi.state,
            transition_rate:  bvi.transition_rate,
            entropy:          bvi.entropy,
            objects_detected: payload.objects?.labels || [],
          }),
        }).catch(() => {});
        setSessionFrames((c) => c + 1);
      }
    });

    return () => {
      if (sendIvRef.current) clearInterval(sendIvRef.current);
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Frame send loop — rebuild when fps/quality change ───────────────────
  useEffect(() => {
    const ms = Math.max(80, Math.round(1000 / fps));
    sendIvRef.current = setInterval(() => {
      const video  = videoRef.current;
      const canvas = captureRef.current;
      const socket = socketRef.current;
      if (!video || !canvas || !socket || video.readyState < 2) return;
      const ctx = canvas.getContext("2d");
      canvas.width = 320; canvas.height = 240;
      ctx.drawImage(video, 0, 0, 320, 240);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      socket.emit("frame", { driver_id: driverId, image: dataUrl, client_ts: Date.now() });
    }, ms);
    return () => clearInterval(sendIvRef.current);
  }, [fps, quality, driverId]);

  // ── BBox overlay — rAF loop restarted when result changes ───────────────
  useEffect(() => {
    const overlay = overlayRef.current;
    const video   = videoRef.current;
    if (!overlay || !video) return;

    const ctx  = overlay.getContext("2d");
    const dets = Array.isArray(result?.objects?.detections) ? result.objects.detections : [];
    const isCheating = Boolean(result?.objects?.cheating);

    function draw() {
      const w = video.clientWidth  || 640;
      const h = video.clientHeight || 480;
      if (overlay.width  !== w) overlay.width  = w;
      if (overlay.height !== h) overlay.height = h;
      ctx.clearRect(0, 0, w, h);

      // face bbox  (video is CSS-mirrored, so flip x to match)
      const bbox = result?.bbox;
      if (bbox && video.videoWidth) {
        const sx = w / 320, sy = h / 240;
        const bw = bbox.w * sx, bh = bbox.h * sy;
        const bx = w - (bbox.x * sx) - bw;   // mirror x
        const by = bbox.y * sy;
        ctx.save();
        ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(255,255,255,0.92)";
        ctx.strokeRect(bx, by, bw, bh);
        ctx.restore();
        drawChip(ctx, bx, by,
          `${result?.emotion ?? "—"} · ${((result?.confidence ?? 0) * 100).toFixed(0)}%`,
          "rgba(255,255,255,0.75)");
      }

      // object detections
      if (dets.length && video.videoWidth) {
        let maxX2 = 0, maxY2 = 0;
        for (const d of dets) { maxX2 = Math.max(maxX2, d?.box?.x2 ?? 0); maxY2 = Math.max(maxY2, d?.box?.y2 ?? 0); }
        const srcW = maxX2 > 320 || maxY2 > 240 ? video.videoWidth  : 320;
        const srcH = maxX2 > 320 || maxY2 > 240 ? video.videoHeight : 240;
        const sx = w / srcW, sy = h / srcH;
        const stroke = isCheating ? "rgba(239,68,68,0.95)" : "rgba(34,197,94,0.88)";
        const fill   = isCheating ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.06)";
        for (const d of dets) {
          const b = d?.box; if (!b) continue;
          const dw = (b.x2 - b.x1) * sx, dh = (b.y2 - b.y1) * sy;
          const dx = w - (b.x1 * sx) - dw;   // mirror x
          const dy = b.y1 * sy;
          ctx.save();
          ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2.5;
          ctx.fillRect(dx, dy, dw, dh); ctx.strokeRect(dx, dy, dw, dh);
          ctx.restore();
          drawChip(ctx, dx, dy,
            `${d?.label ?? "obj"} · ${((d?.confidence ?? 0) * 100).toFixed(0)}%`,
            stroke);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [result]);

  // ── Session management ───────────────────────────────────────────────────
  async function startSession() {
    setSessionBusy(true); setSessionSummary(null);
    try {
      const r = await fetch(`${API}/api/driver/session/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: "BUS-001", route: "Active Route" }),
      });
      const d = await r.json();
      if (r.ok) { setSessionId(d.session_id); setSessionStart(new Date()); setSessionFrames(0); }
    } catch (e) { console.error(e); }
    finally { setSessionBusy(false); }
  }

  async function stopSession() {
    setSessionBusy(true);
    try {
      if (sessionId) {
        const r = await fetch(`${API}/api/driver/session/stop`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const d = await r.json();
        if (r.ok) setSessionSummary(d.summary);
      }
    } catch (e) { console.error(e); }
    finally {
      setSessionId(null); setSessionStart(null); setSessionFrames(0);
      setResult(null); setSessionBusy(false);
    }
  }

  // elapsed timer
  useEffect(() => {
    if (!sessionStart) { setElapsed("00:00"); return; }
    const iv = setInterval(() => {
      const diff = Math.floor((Date.now() - sessionStart.getTime()) / 1000);
      setElapsed(`${String(Math.floor(diff / 60)).padStart(2, "0")}:${String(diff % 60).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [sessionStart]);

  // ── Derived values ───────────────────────────────────────────────────────
  const emotion  = result?.emotion;
  const emoColor = EMOTION_COLOR[(emotion || "").toLowerCase()] || "#64748b";
  const bvi      = result?.bvi;
  const bviScore = bvi?.bvi_score ?? null;
  const bviState = bvi?.state ?? null;
  const probs    = result?.probabilities || {};
  const objDets  = useMemo(() =>
    Array.isArray(result?.objects?.detections) ? result.objects.detections : [],
    [result]);
  const objLabels = useMemo(() =>
    Array.isArray(result?.objects?.labels)
      ? result.objects.labels
      : objDets.map((d) => d?.label).filter(Boolean),
    [result, objDets]);
  const cheating = Boolean(result?.objects?.cheating);

  // ── Video upload analysis ─────────────────────────────────────────────────
  async function uploadVideo() {
    if (!videoFile) return;
    setVideoLoading(true);
    setVideoError("");
    setVideoFrames([]);
    try {
      const fd = new FormData();
      fd.append("video", videoFile);
      const res = await fetch(`${API}/analyze-video-frames`, { method: "POST", body: fd });
      if (!res.ok) { setVideoError("Server error — check backend logs."); return; }
      const data = await res.json();
      if (data.error) { setVideoError(data.error); return; }
      setVideoFrames(data);
    } catch {
      setVideoError("Network error — is the server running?");
    } finally {
      setVideoLoading(false);
    }
  }

  function emoChipStyle(emotion) {
    const c = EMOTION_COLOR[(emotion || "").toLowerCase()] || "#64748b";
    return { background: c + "22", color: c, border: `1px solid ${c}55` };
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="dm-root">
      <Sidebar onLogout={logout} />

      <main className="dm-main">
        {/* Topbar */}
        <header className="dm-topbar">
          <span className="dm-topbar-title">Emotion Shift Profile Analysis</span>
          <div className="dm-topbar-right">
            <div className="dm-driver-info">
              <span className="dm-driver-name">{user.username || "Driver"}</span>
              <span className="dm-driver-id">Realtime Session</span>
            </div>
            <div className={`dm-status-pill ${connected ? "active" : ""}`}>
              <span className="dm-status-dot" />
              {connected ? "MODEL LIVE" : "CONNECTING…"}
            </div>
            {sessionId && (
              <div className="dm-status-pill active" style={{ marginLeft: 4 }}>
                <span className="dm-status-dot" />
                SESSION · {elapsed}
              </div>
            )}
            <div className="dm-avatar">{(user.username || "D")[0].toUpperCase()}</div>
          </div>
        </header>

        <div className="dm-content">

          {/* ── Tab switcher ──────────────────────────────────────────── */}
          <div className="dm-tabs">
            <button
              className={`dm-tab-btn ${activeTab === "live" ? "active" : ""}`}
              onClick={() => setActiveTab("live")}
            >
              <IcoMonitor /> Live Monitor
            </button>
            <button
              className={`dm-tab-btn ${activeTab === "video" ? "active" : ""}`}
              onClick={() => setActiveTab("video")}
            >
              <IcoCam /> Video Analysis
            </button>
          </div>

          {/* ══════════════════ LIVE MONITOR TAB ══════════════════════ */}
          {activeTab === "live" && (<>

          {/* Session banner */}
          <div className={`dm-session-banner ${sessionId ? "active" : ""}`}>
            <div className="dm-session-left">
              {sessionId ? (
                <>
                  <div className="dm-session-title">Session in Progress — model analyzing every frame in real-time</div>
                  <div className="dm-session-meta">
                    <span>⏱ {elapsed}</span>
                    <span>📸 {sessionFrames} frames saved</span>
                    <span>🔗 Socket: {connected ? "live" : "reconnecting…"}</span>
                    <span className="dm-session-id">ID: {sessionId.slice(-8)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="dm-session-title">Start a Monitoring Session</div>
                  <div className="dm-session-meta">
                    Socket.IO streaming · Emotion detection + YOLO object detection · BVI computed live · Saved to MongoDB
                  </div>
                </>
              )}
            </div>
            <div className="dm-session-controls">
              <div className="dm-fps-row">
                <label className="dm-fps-label">
                  FPS
                  <input type="number" min={1} max={10} value={fps}
                    onChange={(e) => setFps(Math.max(1, Math.min(10, Number(e.target.value) || 4)))}
                    className="dm-fps-input" />
                </label>
                <label className="dm-fps-label">
                  Quality
                  <input type="number" min={0.3} max={0.95} step={0.05} value={quality}
                    onChange={(e) => setQuality(Math.max(0.3, Math.min(0.95, Number(e.target.value) || 0.75)))}
                    className="dm-fps-input" />
                </label>
              </div>
              <button
                className={`dm-session-btn ${sessionId ? "stop" : "start"}`}
                onClick={sessionId ? stopSession : startSession}
                disabled={sessionBusy}
              >
                {sessionBusy
                  ? <span className="dm-spinner-sm" />
                  : sessionId
                    ? <><IcoStop /> STOP SESSION</>
                    : <><IcoCam /> START SESSION</>}
              </button>
            </div>
          </div>

          {/* Cheating alert */}
          {cheating && (
            <div className="dm-alert-banner">
              <IcoAlert />
              <strong>DISTRACTION ALERT:</strong>&nbsp;{objLabels.join(", ")} detected
            </div>
          )}

          {/* Main grid */}
          <div className="dm-grid">

            {/* Camera card */}
            <div className="dm-card dm-cam-card">
              <div className="dm-card-head">
                <div>
                  <span className="dm-card-title">Camera Feed</span>
                  <span className="dm-card-hint">Face + object detection overlay (bounding boxes)</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {connected && <span className="dm-live-badge"><span className="dm-live-dot" />LIVE</span>}
                  {emotion && (
                    <span className="dm-emo-pill" style={{ borderColor: emoColor, color: emoColor }}>
                      {emotion.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {camError && <div className="dm-cam-error">{camError}</div>}

              <div className="dm-cam-wrap">
                <video ref={videoRef} autoPlay playsInline muted className="dm-cam-video"
                  style={{ transform: "scaleX(-1)" }} />
                <canvas ref={overlayRef} className="dm-cam-overlay" />
                <canvas ref={captureRef} style={{ display: "none" }} />
                {!connected && (
                  <div className="dm-cam-placeholder">
                    <IcoCam />
                    <p>Connecting to model server…</p>
                  </div>
                )}
              </div>

              <div className="dm-cam-footer">
                <span>Stream: {fps} fps · q={quality}</span>
                <span>Saved frames: {sessionFrames}</span>
                <span style={{ color: cheating ? "#ef4444" : "#22c55e" }}>
                  {cheating ? "⚠ Distracted" : "✓ Normal"}
                </span>
              </div>
            </div>

            {/* Metrics column */}
            <div className="dm-analysis-col">

              {/* BVI */}
              <div className="dm-card">
                <div className="dm-card-head">
                  <div>
                    <span className="dm-card-title">Behavioral Volatility Index</span>
                    <span className="dm-card-hint">Computed from last {bvi?.window_size ?? "—"} frames</span>
                  </div>
                  {bviState && (
                    <span className={`dm-bvi-badge ${bviState}`}>{bviState.toUpperCase()}</span>
                  )}
                </div>
                <div className="dm-bvi-body">
                  <BVIGauge score={bviScore} />
                  <div className="dm-bvi-metrics">
                    {[
                      ["BVI Score",       bviScore?.toFixed(3)         ?? "—", bviColor(bviScore)],
                      ["Transition Rate", bvi?.transition_rate?.toFixed(3) ?? "—", null],
                      ["Emotion Entropy", bvi?.entropy?.toFixed(3)     ?? "—", null],
                      ["E-Variance",      bvi?.emotion_variance?.toFixed(4) ?? "—", null],
                      ["Window",          bvi ? `${bvi.window_size} frames` : "—", null],
                    ].map(([lbl, val, clr]) => (
                      <div className="dm-metric-row" key={lbl}>
                        <span className="dm-metric-lbl">{lbl}</span>
                        <span className="dm-metric-val" style={clr ? { color: clr } : {}}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {!bvi && <p className="dm-no-data">BVI appears after 5+ frames. Start the session and wait…</p>}
              </div>

              {/* Emotion probabilities */}
              <div className="dm-card">
                <div className="dm-card-head">
                  <div>
                    <span className="dm-card-title">Emotion Breakdown</span>
                    <span className="dm-card-hint">Model output probabilities per class</span>
                  </div>
                  {emotion && (
                    <span className="dm-emo-pill" style={{ borderColor: emoColor, color: emoColor }}>
                      {emotion} · {((result?.confidence ?? 0) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                {Object.keys(probs).length > 0 ? (
                  <div className="dm-probs">
                    {Object.entries(probs)
                      .sort(([, a], [, b]) => b - a)
                      .map(([lbl, val]) => (
                        <ProbBar
                          key={lbl}
                          label={lbl.charAt(0).toUpperCase() + lbl.slice(1)}
                          value={val}
                          color={EMOTION_COLOR[lbl.toLowerCase()] || "#64748b"}
                        />
                      ))}
                  </div>
                ) : (
                  <p className="dm-no-data">Waiting for predictions…</p>
                )}
              </div>

              {/* Object detections */}
              <div className="dm-card">
                <div className="dm-card-head">
                  <div>
                    <span className="dm-card-title">Objects Detected</span>
                    <span className="dm-card-hint">YOLO cheating-object model output</span>
                  </div>
                  <span className={`dm-card-badge ${cheating ? "red" : "green"}`}>
                    {result?.objects != null ? (cheating ? "⚠ Distracted" : "✓ Clear") : "—"}
                  </span>
                </div>
                {objDets.length > 0 ? (
                  <div className="dm-obj-list">
                    {objDets.slice(0, 8).map((d, i) => (
                      <div key={i}
                        className={`dm-obj-row ${CHEATING_LABELS.has((d?.label || "").toLowerCase()) ? "danger" : ""}`}>
                        <div className="dm-obj-left">
                          <span className="dm-obj-name">{d?.label ?? "—"}</span>
                          <span className="dm-obj-box">
                            ({d?.box?.x1 ?? 0},{d?.box?.y1 ?? 0}) → ({d?.box?.x2 ?? 0},{d?.box?.y2 ?? 0})
                          </span>
                        </div>
                        <span className="dm-obj-conf">{((d?.confidence ?? 0) * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="dm-no-data">{connected ? "No objects detected" : "Connecting…"}</p>
                )}
              </div>

            </div>{/* end .dm-analysis-col */}
          </div>{/* end .dm-grid */}

          {/* Session summary */}
          {sessionSummary && (
            <div className="dm-card dm-summary-card">
              <div className="dm-card-head">
                <span className="dm-card-title">Session Summary</span>
                <span className="dm-card-badge green">Completed</span>
              </div>
              <div className="dm-summary-grid">
                {[
                  ["Frames Analyzed",  sessionSummary.total_frames,                   null],
                  ["Avg BVI",          sessionSummary.avg_bvi?.toFixed(3) ?? "—",     bviColor(sessionSummary.avg_bvi)],
                  ["Peak BVI",         sessionSummary.peak_bvi?.toFixed(3) ?? "—",    "#ef4444"],
                  ["Dominant Emotion", sessionSummary.dominant_emotion || "—",        EMOTION_COLOR[sessionSummary.dominant_emotion] || "#f1f5f9"],
                  ["Erratic Frames",   sessionSummary.erratic_count ?? 0,             (sessionSummary.erratic_count ?? 0) > 0 ? "#ef4444" : "#22c55e"],
                ].map(([lbl, val, clr]) => (
                  <div key={lbl} className="dm-sum-stat">
                    <span className="dm-sum-val" style={clr ? { color: clr } : {}}>{val}</span>
                    <span className="dm-sum-lbl">{lbl}</span>
                  </div>
                ))}
              </div>
              <p className="dm-summary-note">
                Session saved to your driver profile. View historical BVI trends on Dashboard → Analytics.
              </p>
            </div>
          )}

          </>)}{/* end live tab */}

          {/* ══════════════════ VIDEO ANALYSIS TAB ════════════════════ */}
          {activeTab === "video" && (
            <div className="dm-video-tab">

              {/* Upload card */}
              <div className="dm-card dm-video-upload-card">
                <div className="dm-card-head">
                  <div>
                    <span className="dm-card-title">Video Emotion Intelligence</span>
                    <span className="dm-card-hint">Upload a driving video — AI analyses emotion, BVI and cheating per frame</span>
                  </div>
                </div>
                <div className="dm-upload-row">
                  <label className="dm-file-label">
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => { setVideoFile(e.target.files[0]); setVideoFrames([]); setVideoError(""); }}
                    />
                    <span className="dm-file-text">
                      {videoFile ? videoFile.name : "Choose a video file…"}
                    </span>
                  </label>
                  <button
                    className="dm-session-btn start"
                    onClick={uploadVideo}
                    disabled={!videoFile || videoLoading}
                  >
                    {videoLoading ? <><span className="dm-spinner-sm" /> Analysing…</> : <><IcoCam /> Analyse Video</>}
                  </button>
                </div>
                {videoLoading && (
                  <p className="dm-upload-hint">Processing frames with AI — this may take a moment…</p>
                )}
                {videoError && (
                  <p className="dm-upload-error">{videoError}</p>
                )}
              </div>

              {/* Frame grid */}
              {videoFrames.length > 0 && (
                <>
                  <div className="dm-video-grid-header">
                    <span>{videoFrames.length} frames analysed</span>
                  </div>
                  <div className="dm-video-grid">
                    {videoFrames.map((f, i) => {
                      const isCheating = f.objects?.labels?.some(
                        (l) => !["person", ""].includes(l.toLowerCase())
                      );
                      return (
                        <div key={i} className="dm-vframe-card">
                          <img
                            src={`data:image/jpeg;base64,${f.image}`}
                            className="dm-vframe-img"
                            alt={`frame ${f.frame}`}
                          />
                          <div className="dm-vframe-body">
                            <div className="dm-vframe-title">Frame {f.frame}</div>

                            {/* Emotion */}
                            <div className="dm-vframe-row">
                              <span className="dm-vframe-lbl">Emotion</span>
                              <span className="dm-emo-chip" style={emoChipStyle(f.emotion)}>
                                {f.emotion || "—"}
                              </span>
                            </div>

                            {/* Confidence */}
                            <div className="dm-vframe-row">
                              <span className="dm-vframe-lbl">Confidence</span>
                              <span className="dm-vframe-val">{f.confidence != null ? (f.confidence * 100).toFixed(1) + "%" : "—"}</span>
                            </div>

                            {/* Cheating */}
                            <div className="dm-vframe-row">
                              <span className="dm-vframe-lbl">Cheating</span>
                              <span style={{ fontWeight: 600, color: isCheating ? "#ef4444" : "#22c55e" }}>
                                {isCheating ? "⚠ Detected" : "✓ Clear"}
                              </span>
                            </div>

                            {/* Objects */}
                            {f.objects?.labels?.length > 0 && (
                              <div className="dm-vframe-row dm-vframe-objects">
                                <span className="dm-vframe-lbl">Objects</span>
                                <span className="dm-vframe-val">{f.objects.labels.join(", ")}</span>
                              </div>
                            )}

                            {/* BVI */}
                            {f.bvi && (
                              <div className="dm-vframe-bvi">
                                <div className="dm-vframe-bvi-title">BVI Stability</div>
                                <div className="dm-vframe-bvi-grid">
                                  {[
                                    ["State",      f.bvi.state,                  bviColor(f.bvi.bvi_score)],
                                    ["Score",      f.bvi.bvi_score?.toFixed(3),  bviColor(f.bvi.bvi_score)],
                                    ["Entropy",    f.bvi.entropy?.toFixed(3),    null],
                                    ["Transition", f.bvi.transition_rate?.toFixed(3), null],
                                  ].map(([lbl, val, clr]) => (
                                    <div key={lbl} className="dm-vframe-bvi-item">
                                      <span className="dm-vframe-lbl">{lbl}</span>
                                      <span style={clr ? { color: clr, fontWeight: 600 } : { fontWeight: 600 }}>{val ?? "—"}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

            </div>
          )}{/* end video tab */}

        </div>{/* .dm-content */}
      </main>
    </div>
  );
}
