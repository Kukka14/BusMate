import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import "./DrowsinessMonitor.css";

const API        = import.meta.env.VITE_API_URL || "http://localhost:5000";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "";

const CONSECUTIVE_THRESHOLD = 5; // 5 frames @ 10fps = 500ms

// ── Color helpers ─────────────────────────────────────────────────────────────
function verdictColor(v) {
  if (v === "Drowsy") return "#ef4444";
  if (v === "Alert")  return "#22c55e";
  return "#475569";
}
function confColor(p) {
  if (p == null)  return "#475569";
  if (p < 0.30)   return "#22c55e";
  if (p < 0.60)   return "#f59e0b";
  return "#ef4444";
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoHome     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IcoEye      = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoMonitor  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoRoadSign = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>;
const IcoScene    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20"/><path d="M4 20L9 9l4 6 3-3 4 8"/><circle cx="17" cy="6" r="2"/></svg>;
const IcoUser     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IcoLogout   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IcoCam      = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
const IcoStop     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;
const IcoAlert    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ onLogout }) {
  const navigate = useNavigate();
  const [openKey, setOpenKey] = useState(null);

  const items = [
    { key: "dashboard",  label: "Dashboard",             Icon: IcoHome,     path: "/driver/dashboard" },
    { key: "drowsiness", label: "Drowsiness Monitor",    Icon: IcoEye,      path: null, isActive: true },
    { key: "monitor",    label: "Emotion Shift Analysis", Icon: IcoMonitor,  path: "/driver/monitor" },
    {
      key: "roadsign", label: "Road Sign Detection", Icon: IcoRoadSign, path: null,
      sub: [
        { key: "rs-image",  label: "🖼  Image",  path: "/road-sign?mode=image" },
        { key: "rs-video",  label: "🎥  Video",  path: "/road-sign?mode=video" },
        { key: "rs-webcam", label: "📷  Webcam", path: "/road-sign/live"       },
      ],
    },
    {
      key: "roadscene", label: "Road Scene Analysis", Icon: IcoScene, path: null,
      sub: [
        { key: "rsa-image",  label: "🖼  Image",  path: "/road-scene?mode=image" },
        { key: "rsa-video",  label: "🎥  Video",  path: "/road-scene?mode=video" },
        { key: "rsa-hazard", label: "🗺  Hazard", path: "/road-scene/hazard"     },
      ],
    },
    { key: "profile", label: "Profile", Icon: IcoUser, path: "/driver/profile" },
  ];

  return (
    <aside className="dw-sidebar">
      <div className="dw-logo">
        <div className="dw-logo-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <span>DriveGuard</span>
      </div>
      <nav className="dw-nav">
        {items.map(({ key, label, Icon, path, sub, isActive }) => (
          <div key={key}>
            <button
              className={`dw-nav-btn ${isActive ? "active" : ""}`}
              onClick={() => {
                if (sub) setOpenKey(k => k === key ? null : key);
                else if (path) navigate(path);
              }}
            >
              <Icon /><span>{label}</span>
              {sub && <span className="dw-nav-arrow">{openKey === key ? "▾" : "▸"}</span>}
            </button>
            {sub && openKey === key && (
              <div className="dw-nav-sub">
                {sub.map(s => (
                  <button key={s.key} className="dw-nav-sub-btn"
                    onClick={() => setTimeout(() => navigate(s.path), 150)}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="dw-sidebar-foot">
        <div className="dw-tip-box">
          <span className="dw-tip-label">MONITOR TIP</span>
          <p className="dw-tip-text">Good lighting + face centred in camera gives best accuracy.</p>
        </div>
        <button className="dw-signout" onClick={onLogout}><IcoLogout />Sign Out</button>
      </div>
    </aside>
  );
}

// ── Confidence gauge (SVG arc) ────────────────────────────────────────────────
function ConfGauge({ value, label, color }) {
  const cx = 60, cy = 60, r = 48;
  const circ = 2 * Math.PI * r;
  const pct  = value != null ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="9"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="9"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s" }}
      />
      <text x={cx} y={cy - 5} textAnchor="middle" fill="#f1f5f9" fontSize="17" fontWeight="700" fontFamily="Inter,sans-serif">
        {value != null ? `${Math.round(value * 100)}%` : "—"}
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="Inter,sans-serif">
        {label ?? "Waiting…"}
      </text>
    </svg>
  );
}

// ── Model prediction bar ──────────────────────────────────────────────────────
function ModelBar({ name, weight, drowsyProb, available }) {
  const pct   = Math.round((drowsyProb ?? 0) * 100);
  const color = confColor(drowsyProb);
  return (
    <div className="dw-model-row">
      <div className="dw-model-head">
        <span className="dw-model-name">{name}</span>
        <span className="dw-model-weight">weight ×{weight}</span>
        {!available && <span className="dw-model-warmup">warm-up</span>}
      </div>
      <div className="dw-model-track">
        <div className="dw-model-fill"
          style={{ width: `${pct}%`, background: color, opacity: available ? 1 : 0.35 }}/>
      </div>
      <span className="dw-model-pct" style={{ color }}>
        {available ? `${pct}%` : "—"}
      </span>
    </div>
  );
}

// ── Facial feature chip ───────────────────────────────────────────────────────
function FeatChip({ label, value, unit, warn }) {
  return (
    <div className={`dw-feat-chip ${warn ? "warn" : ""}`}>
      <span className="dw-feat-label">{label}</span>
      <span className="dw-feat-val">{value != null ? `${value}${unit}` : "—"}</span>
    </div>
  );
}

// ── Alert streak segment bar ──────────────────────────────────────────────────
function StreakBar({ count, threshold }) {
  const color = count >= threshold ? "#ef4444" : count >= Math.ceil(threshold * 0.6) ? "#f59e0b" : "#22c55e";
  return (
    <div className="dw-streak-wrap">
      <div className="dw-streak-track">
        {Array.from({ length: threshold }).map((_, i) => (
          <div key={i} className="dw-streak-seg"
            style={{ background: i < count ? color : "#1e293b" }}/>
        ))}
      </div>
      <span className="dw-streak-label" style={{ color }}>
        {count}/{threshold} frames
      </span>
    </div>
  );
}

// ── Canvas face-box draw helper ───────────────────────────────────────────────
function drawFaceBox(ctx, bbox, srcW, srcH, canvasW, canvasH, label, color) {
  if (!bbox) return;
  const sx = canvasW / srcW, sy = canvasH / srcH;
  const bw = bbox.w * sx, bh = bbox.h * sy;
  const bx = canvasW - (bbox.x * sx) - bw;   // mirror x to match CSS scaleX(-1)
  const by = bbox.y * sy;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.font = "bold 12px Inter, system-ui, sans-serif";
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(bx, Math.max(0, by - 26), tw + 14, 24);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, bx + 7, Math.max(17, by - 8));
  ctx.restore();
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DrowsinessMonitorPage() {
  const navigate   = useNavigate();
  const videoRef   = useRef(null);
  const captureRef = useRef(null);   // hidden canvas for frame capture
  const overlayRef = useRef(null);   // visible bbox canvas
  const socketRef   = useRef(null);
  const sendIvRef   = useRef(null);
  const rafRef      = useRef(null);
  const inFlightRef = useRef(false);  // true while server is processing a frame

  const user  = JSON.parse(localStorage.getItem("user")  || "{}");
  const token = localStorage.getItem("token");

  const [activeTab,      setActiveTab]      = useState("live");
  const [connected,      setConnected]      = useState(false);
  const [result,         setResult]         = useState(null);
  const [fps,            setFps]            = useState(10);
  const [camError,       setCamError]       = useState("");

  // session
  const [sessionId,      setSessionId]      = useState(null);
  const [sessionStart,   setSessionStart]   = useState(null);
  const [sessionFrames,  setSessionFrames]  = useState(0);
  const [sessionAlerts,  setSessionAlerts]  = useState(0);
  const [sessionBusy,    setSessionBusy]    = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [elapsed,        setElapsed]        = useState("00:00");

  // alert log (last 20)
  const [alertLog, setAlertLog] = useState([]);

  // video tab
  const [videoFile,    setVideoFile]    = useState(null);
  const [videoResult,  setVideoResult]  = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError,   setVideoError]   = useState("");

  // auth guard
  useEffect(() => { if (!token) navigate("/login"); }, [token, navigate]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  // ── Webcam ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let stream;
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false })
      .then(s => {
        if (!active) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setCamError("Camera permission denied or not available."));
    return () => {
      active = false;
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  // ── Socket.IO ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["polling", "websocket"] });
    socketRef.current = socket;
    socket.on("connect",    () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("drowsiness_result", payload => {
      inFlightRef.current = false;   // server responded — ready to send next frame
      if (!payload?.ok) return;
      setResult(payload);

      // fire alert log + session counter when streak threshold is crossed
      if (payload.alert) {
        const ts = new Date().toLocaleTimeString();
        setAlertLog(prev => [
          { time: ts, confidence: payload.confidence, ear: payload.features?.ear },
          ...prev.slice(0, 19),
        ]);
        setSessionAlerts(c => c + 1);
      }
      setSessionFrames(c => c + 1);
    });

    return () => {
      if (sendIvRef.current) clearInterval(sendIvRef.current);
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Frame send loop ────────────────────────────────────────────────────────
  // Runs at user-selected FPS but caps to 1 frame in-flight at a time so
  // frames never pile up regardless of inference speed or transport type.
  useEffect(() => {
    const ms = Math.max(100, Math.round(1000 / fps));
    sendIvRef.current = setInterval(() => {
      const video  = videoRef.current;
      const canvas = captureRef.current;
      const socket = socketRef.current;
      if (!video || !canvas || !socket || !socket.connected || video.readyState < 2) return;
      if (inFlightRef.current) return;   // previous frame still processing — skip this tick
      const ctx = canvas.getContext("2d");
      canvas.width = 640; canvas.height = 480;
      ctx.drawImage(video, 0, 0, 640, 480);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.80);
      inFlightRef.current = true;
      socket.emit("drowsiness_frame", {
        image:     dataUrl,
        session_id: sessionId,
        client_ts: Date.now(),
      });
    }, ms);
    return () => {
      clearInterval(sendIvRef.current);
      inFlightRef.current = false;
    };
  }, [fps, sessionId]);

  // ── Bounding-box overlay rAF loop ─────────────────────────────────────────
  useEffect(() => {
    const overlay = overlayRef.current;
    const video   = videoRef.current;
    if (!overlay || !video) return;
    const ctx = overlay.getContext("2d");

    function draw() {
      const w = video.clientWidth  || 640;
      const h = video.clientHeight || 480;
      if (overlay.width  !== w) overlay.width  = w;
      if (overlay.height !== h) overlay.height = h;
      ctx.clearRect(0, 0, w, h);

      if (result?.face_detected && result.bbox && video.videoWidth) {
        const color = result.verdict === "Drowsy" ? "#ef4444" : "#22c55e";
        const label = `${result.verdict ?? "—"} · ${Math.round((result.confidence ?? 0) * 100)}%`;
        // Source frame size matches capture canvas (640×480 now)
        drawFaceBox(ctx, result.bbox, 640, 480, w, h, label, color);
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [result]);

  // ── Session management ────────────────────────────────────────────────────
  async function startSession() {
    setSessionBusy(true); setSessionSummary(null); setAlertLog([]);
    try {
      const r = await fetch(`${API}/api/driver/session/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: "BUS-001", route: "Drowsiness Monitor" }),
      });
      const d = await r.json();
      if (r.ok) {
        setSessionId(d.session_id);
        setSessionStart(new Date());
        setSessionFrames(0);
        setSessionAlerts(0);
      }
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
        if (r.ok) setSessionSummary({ ...d.summary, total_alerts: sessionAlerts });
      }
    } catch (e) { console.error(e); }
    finally {
      setSessionId(null); setSessionStart(null);
      setSessionFrames(0); setResult(null);
      setSessionBusy(false);
    }
  }

  // elapsed timer
  useEffect(() => {
    if (!sessionStart) { setElapsed("00:00"); return; }
    const iv = setInterval(() => {
      const diff = Math.floor((Date.now() - sessionStart.getTime()) / 1000);
      setElapsed(
        `${String(Math.floor(diff / 60)).padStart(2, "0")}:${String(diff % 60).padStart(2, "0")}`
      );
    }, 1000);
    return () => clearInterval(iv);
  }, [sessionStart]);

  // ── Video upload ──────────────────────────────────────────────────────────
  async function uploadVideo() {
    if (!videoFile) return;
    setVideoLoading(true); setVideoError(""); setVideoResult(null);
    try {
      const fd = new FormData();
      fd.append("video", videoFile);
      const res = await fetch(`${API}/analyze-drowsiness-video`, { method: "POST", body: fd });
      if (!res.ok) { setVideoError("Server error — check backend logs."); return; }
      const data = await res.json();
      if (data.error) { setVideoError(data.error); return; }
      setVideoResult(data);
    } catch {
      setVideoError("Network error — is the server running?");
    } finally {
      setVideoLoading(false);
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const verdict    = result?.verdict;
  const confidence = result?.confidence;
  const isAlert    = result?.alert;
  const streak     = result?.consecutive_frames ?? 0;
  const models     = result?.models    ?? {};
  const features   = result?.features  ?? {};
  const faceOk     = result?.face_detected;
  const vColor     = verdictColor(verdict);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="dw-root">
      <Sidebar onLogout={logout} />

      <main className="dw-main">
        {/* Topbar */}
        <header className="dw-topbar">
          <span className="dw-topbar-title">Drowsiness Detection Monitor</span>
          <div className="dw-topbar-right">
            <div className="dw-driver-info">
              <span className="dw-driver-name">{user.username || "Driver"}</span>
              <span className="dw-driver-id">Real-time Analysis</span>
            </div>
            <div className={`dw-status-pill ${connected ? "active" : ""}`}>
              <span className="dw-status-dot"/>
              {connected ? "MODEL LIVE" : "CONNECTING…"}
            </div>
            {sessionId && (
              <div className="dw-status-pill active" style={{ marginLeft: 4 }}>
                <span className="dw-status-dot"/>SESSION · {elapsed}
              </div>
            )}
            <div className="dw-avatar">{(user.username || "D")[0].toUpperCase()}</div>
          </div>
        </header>

        <div className="dw-content">

          {/* Tab switcher */}
          <div className="dw-tabs">
            <button className={`dw-tab-btn ${activeTab === "live" ? "active" : ""}`}
              onClick={() => setActiveTab("live")}>
              <IcoEye /> Live Monitor
            </button>
            <button className={`dw-tab-btn ${activeTab === "video" ? "active" : ""}`}
              onClick={() => setActiveTab("video")}>
              <IcoCam /> Video Analysis
            </button>
          </div>

          {/* ══════════════════ LIVE TAB ══════════════════════ */}
          {activeTab === "live" && (<>

            {/* Drowsiness alert banner */}
            {isAlert && (
              <div className="dw-alert-banner">
                <IcoAlert />
                <strong>DROWSINESS ALERT</strong>&nbsp;— Sustained drowsiness detected! Pull over safely.
              </div>
            )}

            {/* Session banner */}
            <div className={`dw-session-banner ${sessionId ? "active" : ""}`}>
              <div className="dw-session-left">
                {sessionId ? (
                  <>
                    <div className="dw-session-title">Session Active — AI monitoring every frame in real-time</div>
                    <div className="dw-session-meta">
                      <span>⏱ {elapsed}</span>
                      <span>📸 {sessionFrames} frames</span>
                      <span>🚨 {sessionAlerts} alerts</span>
                      <span className="dw-session-id">ID: {sessionId.slice(-8)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="dw-session-title">Start a Drowsiness Monitoring Session</div>
                    <div className="dw-session-meta">
                      LSTM (60%) + RGB CNN (25%) + IR CNN (15%) · {CONSECUTIVE_THRESHOLD}-frame streak filter
                    </div>
                  </>
                )}
              </div>
              <div className="dw-session-controls">
                <label className="dw-fps-label">
                  FPS
                  <input type="number" min={1} max={10} value={fps}
                    onChange={e => setFps(Math.max(1, Math.min(10, Number(e.target.value) || 10)))}
                    className="dw-fps-input"/>
                </label>
                <button
                  className={`dw-session-btn ${sessionId ? "stop" : "start"}`}
                  onClick={sessionId ? stopSession : startSession}
                  disabled={sessionBusy}>
                  {sessionBusy
                    ? <span className="dw-spinner-sm"/>
                    : sessionId
                      ? <><IcoStop/> STOP SESSION</>
                      : <><IcoCam/> START SESSION</>}
                </button>
              </div>
            </div>

            {/* Main 2-col grid */}
            <div className="dw-grid">

              {/* ── Left: Camera feed ── */}
              <div className="dw-card dw-cam-card">
                <div className="dw-card-head">
                  <div>
                    <span className="dw-card-title">Camera Feed</span>
                    <span className="dw-card-hint">Face detection overlay · verdict badge updates every frame</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    {connected && <span className="dw-live-badge"><span className="dw-live-dot"/>LIVE</span>}
                    {verdict && (
                      <span className="dw-verdict-pill" style={{ borderColor: vColor, color: vColor }}>
                        {verdict.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                {camError && <div className="dw-cam-error">{camError}</div>}

                <div className="dw-cam-wrap">
                  <video ref={videoRef} autoPlay playsInline muted className="dw-cam-video"
                    style={{ transform: "scaleX(-1)" }}/>
                  <canvas ref={overlayRef} className="dw-cam-overlay"/>
                  <canvas ref={captureRef} style={{ display: "none" }}/>

                  {/* Big verdict overlay on the video */}
                  {verdict && (
                    <div className={`dw-cam-verdict ${verdict.toLowerCase()}`}>
                      {verdict === "Drowsy" ? "😴" : "✅"} {verdict}
                    </div>
                  )}

                  {!connected && (
                    <div className="dw-cam-placeholder">
                      <IcoEye/>
                      <p>Connecting to model server…</p>
                    </div>
                  )}

                  {/* Show guide when connected but no session started */}
                  {connected && !sessionId && (
                    <div className="dw-cam-placeholder" style={{ background: "rgba(0,0,0,0.55)" }}>
                      <svg width="120" height="150" viewBox="0 0 120 150" style={{ opacity: 0.5 }}>
                        <ellipse cx="60" cy="65" rx="40" ry="52" fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 4"/>
                      </svg>
                      <p style={{ marginTop: "-40px", color: "#94a3b8", fontSize: "0.78rem", textAlign: "center" }}>
                        Press <strong style={{ color: "#f1f5f9" }}>Start Session</strong><br/>and centre your face
                      </p>
                    </div>
                  )}

                  {connected && sessionId && result && !faceOk && (
                    <div className="dw-cam-no-face">
                      <svg width="60" height="72" viewBox="0 0 120 150" style={{ opacity: 0.6, marginBottom: "6px" }}>
                        <ellipse cx="60" cy="65" rx="40" ry="52" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="6 4"/>
                      </svg>
                      <span>Move face into frame & face camera directly</span>
                    </div>
                  )}
                </div>

                <div className="dw-cam-footer">
                  <span>Stream: {fps} fps · 640×480</span>
                  <span>Frames analyzed: {sessionFrames}</span>
                  <span style={{ color: isAlert ? "#ef4444" : "#22c55e" }}>
                    {isAlert ? "⚠ ALERT ACTIVE" : sessionId ? "✓ Monitoring" : "— Not started"}
                  </span>
                </div>
              </div>


              {/* ── Right: Analysis column ── */}
              <div className="dw-analysis-col">

                {/* Confidence gauge + streak */}
                <div className="dw-card">
                  <div className="dw-card-head">
                    <div>
                      <span className="dw-card-title">Drowsiness Confidence</span>
                      <span className="dw-card-hint">
                        Local ensemble · LSTM (60%) + RGB CNN (25%) + IR CNN (15%)
                      </span>
                    </div>
                    {verdict && (
                      <span className={`dw-verdict-badge ${verdict.toLowerCase()}`}>
                        {verdict.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="dw-conf-body">
                    <ConfGauge value={confidence} label={verdict} color={vColor}/>
                    <div className="dw-conf-right">
                      <div className="dw-conf-pct" style={{ color: vColor }}>
                        {confidence != null ? `${Math.round(confidence * 100)}%` : "—"}
                      </div>
                      <div className="dw-conf-sublabel">Drowsy probability</div>
                      <div className="dw-conf-divider"/>
                      <div className="dw-conf-sublabel" style={{ marginTop: 8 }}>Alert streak</div>
                      <StreakBar count={streak} threshold={CONSECUTIVE_THRESHOLD}/>
                      <p className="dw-streak-note">
                        Alert fires after {CONSECUTIVE_THRESHOLD} consecutive drowsy frames (500ms)
                      </p>
                    </div>
                  </div>
                  {!result && <p className="dw-no-data">Waiting — start session and face the camera…</p>}
                </div>

                {/* Per-model predictions */}
                <div className="dw-card">
                  <div className="dw-card-head">
                    <div>
                      <span className="dw-card-title">Model Predictions</span>
                      <span className="dw-card-hint">Three models fused by accuracy weight</span>
                    </div>
                  </div>
                  <div className="dw-models">
                    <ModelBar name="LSTM (Temporal · 30 frames)" weight="0.60"
                      drowsyProb={models.lstm?.drowsy_prob}
                      available={models.lstm?.available ?? false}/>
                    <ModelBar name="RGB CNN (Color · MobileNetV3)" weight="0.25"
                      drowsyProb={models.rgb?.drowsy_prob}
                      available={models.rgb?.available ?? false}/>
                    <ModelBar name="IR CNN (Grayscale · Eye state)" weight="0.15"
                      drowsyProb={models.ir?.drowsy_prob}
                      available={models.ir?.available ?? false}/>
                  </div>
                  {!result && <p className="dw-no-data">Predictions appear after first frame arrives…</p>}
                </div>

                {/* Facial features */}
                <div className="dw-card">
                  <div className="dw-card-head">
                    <div>
                      <span className="dw-card-title">Facial Features</span>
                      <span className="dw-card-hint">MediaPipe 478-landmark extraction · LSTM input</span>
                    </div>
                    {faceOk != null && (
                      <span className={`dw-card-badge ${faceOk ? "green" : "red"}`}>
                        {faceOk ? "Face OK" : "No Face"}
                      </span>
                    )}
                  </div>
                  <div className="dw-feats-grid">
                    <FeatChip label="EAR"       value={features.ear?.toFixed(3)}        unit=""  warn={features.ear        != null && features.ear < 0.25}/>
                    <FeatChip label="MAR"       value={features.mar?.toFixed(3)}        unit=""  warn={features.mar        != null && features.mar > 0.60}/>
                    <FeatChip label="Pitch"     value={features.pitch?.toFixed(1)}      unit="°" warn={features.pitch      != null && Math.abs(features.pitch) > 20}/>
                    <FeatChip label="Yaw"       value={features.yaw?.toFixed(1)}        unit="°" warn={features.yaw        != null && Math.abs(features.yaw) > 30}/>
                    <FeatChip label="Eye Blink" value={features.eye_closure?.toFixed(2)} unit="" warn={features.eye_closure != null && features.eye_closure > 0.45}/>
                    <FeatChip label="PERCLOS"   value={features.perclos   != null ? String(Math.round(features.perclos   * 100)) : null} unit="%" warn={features.perclos   != null && features.perclos   > 0.30}/>
                    <FeatChip label="Yawn"      value={features.yawn_freq != null ? String(Math.round(features.yawn_freq * 100)) : null} unit="%" warn={features.yawn_freq != null && features.yawn_freq > 0.20}/>
                  </div>
                  <div className="dw-feat-legend">
                    <span>EAR &lt;0.25 → eyes closing</span>
                    <span>PERCLOS &gt;30% → sustained closure</span>
                    <span>Yawn &gt;20% → frequent yawning</span>
                  </div>
                </div>

              </div>{/* end analysis col */}
            </div>{/* end grid */}

            {/* Alert log */}
            {alertLog.length > 0 && (
              <div className="dw-card dw-alert-log-card">
                <div className="dw-card-head">
                  <span className="dw-card-title">Alert Log — This Session</span>
                  <span className="dw-card-badge red">{alertLog.length} Alerts</span>
                </div>
                <div className="dw-alert-log">
                  {alertLog.map((a, i) => (
                    <div key={i} className="dw-alert-log-row">
                      <span className="dw-al-time">{a.time}</span>
                      <span className="dw-al-conf" style={{ color: "#ef4444" }}>
                        {Math.round((a.confidence ?? 0) * 100)}% drowsy
                      </span>
                      {a.ear != null && (
                        <span className="dw-al-ear">EAR: {a.ear.toFixed(3)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Session summary */}
            {sessionSummary && (
              <div className="dw-card dw-summary-card">
                <div className="dw-card-head">
                  <span className="dw-card-title">Session Summary</span>
                  <span className="dw-card-badge green">Completed</span>
                </div>
                <div className="dw-summary-grid">
                  {[
                    ["Frames Analyzed",  sessionSummary.total_frames,                    null],
                    ["Avg BVI",          sessionSummary.avg_bvi?.toFixed(3)  ?? "—",     null],
                    ["Peak BVI",         sessionSummary.peak_bvi?.toFixed(3) ?? "—",     "#ef4444"],
                    ["Dominant Emotion", sessionSummary.dominant_emotion     || "—",     null],
                    ["Drowsy Alerts",    sessionSummary.total_alerts         ?? 0,
                      (sessionSummary.total_alerts ?? 0) > 0 ? "#ef4444" : "#22c55e"],
                  ].map(([lbl, val, clr]) => (
                    <div key={lbl} className="dw-sum-stat">
                      <span className="dw-sum-val" style={clr ? { color: clr } : {}}>{val}</span>
                      <span className="dw-sum-lbl">{lbl}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </>)}{/* end live tab */}

          {/* ══════════════════ VIDEO TAB ══════════════════════ */}
          {activeTab === "video" && (
            <div className="dw-video-tab">

              {/* Upload card */}
              <div className="dw-card dw-video-upload-card">
                <div className="dw-card-head">
                  <div>
                    <span className="dw-card-title">Video Drowsiness Analysis</span>
                    <span className="dw-card-hint">
                      Upload a driving video · Every 3rd frame processed · First 30 frames excluded (LSTM warm-up)
                    </span>
                  </div>
                </div>
                <div className="dw-upload-row">
                  <label className="dw-file-label">
                    <input type="file" accept="video/*"
                      onChange={e => { setVideoFile(e.target.files[0]); setVideoResult(null); setVideoError(""); }}/>
                    <span className="dw-file-text">
                      {videoFile ? videoFile.name : "Choose a video file…"}
                    </span>
                  </label>
                  <button className="dw-session-btn start"
                    onClick={uploadVideo} disabled={!videoFile || videoLoading}>
                    {videoLoading
                      ? <><span className="dw-spinner-sm"/> Analysing…</>
                      : <><IcoCam/> Analyse Video</>}
                  </button>
                </div>
                {videoLoading && (
                  <p className="dw-upload-hint">Processing frames — LSTM warms up after 30 frames, results then become reliable…</p>
                )}
                {videoError && <p className="dw-upload-error">{videoError}</p>}
              </div>

              {/* Results */}
              {videoResult && (<>

                {/* Summary stat cards */}
                <div className="dw-video-summary">
                  {[
                    { label: "Total Frames",  value: videoResult.total_frames                                                             },
                    { label: "Processed",     value: videoResult.analyzed                                                                 },
                    { label: "Drowsy %",      value: `${(videoResult.drowsy_pct ?? 0).toFixed(1)}%`,
                      color: (videoResult.drowsy_pct ?? 0) > 30 ? "#ef4444" : "#22c55e"                                                  },
                    { label: "Alert Events",  value: videoResult.alert_events?.length ?? 0,
                      color: (videoResult.alert_events?.length ?? 0) > 0 ? "#f59e0b" : "#22c55e"                                          },
                    { label: "Drowsy Frames", value: videoResult.drowsy_frames ?? 0,
                      color: (videoResult.drowsy_frames ?? 0) > 0 ? "#ef4444" : "#22c55e"                                                 },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="dw-vs-card">
                      <span className="dw-vs-val" style={color ? { color } : {}}>{value ?? "—"}</span>
                      <span className="dw-vs-lbl">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Overall verdict banner */}
                {videoResult.summary && (
                  <div className="dw-card" style={{
                    borderLeft: `4px solid ${videoResult.summary.verdict === "Drowsy" ? "#ef4444" : "#22c55e"}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0.85rem 1.1rem"
                  }}>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Overall Verdict</div>
                      <div style={{
                        fontSize: "1.3rem", fontWeight: 700,
                        color: videoResult.summary.verdict === "Drowsy" ? "#ef4444" : "#22c55e",
                        marginTop: "0.15rem"
                      }}>
                        {videoResult.summary.verdict === "Drowsy" ? "😴 Drowsy" : "✅ Alert"}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                        {videoResult.summary.drowsy_pct?.toFixed(1)}% of analyzed frames were drowsy
                        {videoResult.summary.duration_sec ? ` · Duration: ${videoResult.summary.duration_sec}s` : ""}
                        {videoResult.summary.fps_source ? ` @ ${videoResult.summary.fps_source} fps` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase" }}>Alert Events</div>
                      <div style={{
                        fontSize: "2rem", fontWeight: 800,
                        color: (videoResult.summary.alert_count ?? 0) > 0 ? "#f59e0b" : "#22c55e"
                      }}>
                        {videoResult.summary.alert_count ?? 0}
                      </div>
                    </div>
                  </div>
                )}

                {/* Timeline bar */}
                {videoResult.timeline?.length > 0 && (
                  <div className="dw-card dw-timeline-card">
                    <div className="dw-card-head">
                      <span className="dw-card-title">Drowsiness Timeline</span>
                      <div className="dw-timeline-legend">
                        <span><span className="dw-tl-dot" style={{ background: "#22c55e" }}/>Alert</span>
                        <span><span className="dw-tl-dot" style={{ background: "#ef4444" }}/>Drowsy</span>
                        <span><span className="dw-tl-dot" style={{ background: "#f59e0b" }}/>⚠ Alarm</span>
                      </div>
                    </div>

                    {/* Confidence sparkline — one bar per frame */}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "64px",
                                  background: "#0f172a", borderRadius: "8px", padding: "6px 8px",
                                  overflow: "hidden", marginBottom: "6px" }}>
                      {videoResult.timeline.map((f, i) => {
                        const conf = f.confidence ?? 0;
                        const color = f.alert ? "#f59e0b" : f.verdict === "Drowsy" ? "#ef4444" : "#22c55e";
                        return (
                          <div key={i}
                            title={`Frame ${f.frame} @${f.ts}s · ${f.verdict} · ${Math.round(conf * 100)}%`}
                            style={{
                              flex: 1, minWidth: "2px", maxWidth: "14px",
                              height: `${Math.max(6, Math.round(conf * 52))}px`,
                              background: color, borderRadius: "2px 2px 0 0",
                              opacity: 0.9, cursor: "pointer",
                              transition: "height 0.2s"
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Timestamp axis labels */}
                    <div style={{ display: "flex", justifyContent: "space-between",
                                  fontSize: "0.65rem", color: "#475569", marginBottom: "1rem" }}>
                      <span>0s</span>
                      {videoResult.timeline[Math.floor(videoResult.timeline.length / 2)] &&
                        <span>{videoResult.timeline[Math.floor(videoResult.timeline.length / 2)].ts}s</span>}
                      <span>{videoResult.timeline[videoResult.timeline.length - 1]?.ts}s</span>
                    </div>

                    {/* Alert event list */}
                    {videoResult.alert_events?.length > 0 && (
                      <div className="dw-vid-alerts">
                        <div className="dw-card-head" style={{ marginTop: "0.75rem" }}>
                          <span className="dw-card-title">⚠ Alert Events</span>
                          <span className="dw-card-badge red">{videoResult.alert_events.length}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                          {videoResult.alert_events.map((a, i) => (
                            <div key={i} className="dw-alert-log-row">
                              <span className="dw-al-time">⏱ {a.ts}s (frame {a.frame})</span>
                              <span className="dw-al-conf" style={{ color: "#f59e0b" }}>
                                {Math.round((a.confidence ?? 0) * 100)}% drowsy confidence
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Per-frame detail table */}
                    <div style={{ marginTop: "1.2rem" }}>
                      <div className="dw-card-head">
                        <span className="dw-card-title">Per-frame Results</span>
                        <span style={{ fontSize: "0.7rem", color: "#64748b" }}>{videoResult.timeline.length} frames analyzed</span>
                      </div>
                      <div style={{ overflowX: "auto", maxHeight: "260px", overflowY: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem", color: "#cbd5e1" }}>
                          <thead>
                            <tr style={{ background: "#0f172a", position: "sticky", top: 0 }}>
                              {["Frame","Time","Verdict","Confidence","LSTM","RGB","IR","EAR","MAR","Pitch","Yaw"].map(h => (
                                <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "#64748b",
                                                     fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                                                     borderBottom: "1px solid #1e293b" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {videoResult.timeline.map((f, i) => {
                              const conf = f.confidence ?? 0;
                              const vColor = f.alert ? "#f59e0b" : f.verdict === "Drowsy" ? "#ef4444" : "#22c55e";
                              return (
                                <tr key={i} style={{ borderBottom: "1px solid #1e293b",
                                  background: f.alert ? "rgba(245,158,11,0.06)" : f.verdict === "Drowsy" ? "rgba(239,68,68,0.04)" : "transparent" }}>
                                  <td style={{ padding: "5px 8px" }}>{f.frame}</td>
                                  <td style={{ padding: "5px 8px", color: "#94a3b8" }}>{f.ts}s</td>
                                  <td style={{ padding: "5px 8px", color: vColor, fontWeight: 600 }}>
                                    {f.alert ? "⚠ " : ""}{f.verdict ?? "—"}
                                  </td>
                                  <td style={{ padding: "5px 8px", color: vColor }}>{Math.round(conf * 100)}%</td>
                                  <td style={{ padding: "5px 8px", color: "#94a3b8" }}>
                                    {f.models?.lstm?.available ? `${Math.round((f.models.lstm.drowsy_prob ?? 0) * 100)}%` : "—"}
                                  </td>
                                  <td style={{ padding: "5px 8px", color: "#94a3b8" }}>
                                    {f.models?.rgb?.available ? `${Math.round((f.models.rgb.drowsy_prob ?? 0) * 100)}%` : "—"}
                                  </td>
                                  <td style={{ padding: "5px 8px", color: "#94a3b8" }}>
                                    {f.models?.ir?.available ? `${Math.round((f.models.ir.drowsy_prob ?? 0) * 100)}%` : "—"}
                                  </td>
                                  <td style={{ padding: "5px 8px", color: f.features?.ear != null && f.features.ear < 0.25 ? "#ef4444" : "#94a3b8" }}>
                                    {f.features?.ear?.toFixed(3) ?? "—"}
                                  </td>
                                  <td style={{ padding: "5px 8px", color: f.features?.mar != null && f.features.mar > 0.6 ? "#f59e0b" : "#94a3b8" }}>
                                    {f.features?.mar?.toFixed(3) ?? "—"}
                                  </td>
                                  <td style={{ padding: "5px 8px", color: "#94a3b8" }}>{f.features?.pitch?.toFixed(1) ?? "—"}°</td>
                                  <td style={{ padding: "5px 8px", color: "#94a3b8" }}>{f.features?.yaw?.toFixed(1) ?? "—"}°</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

              </>)}

            </div>
          )}{/* end video tab */}

        </div>{/* .dw-content */}
      </main>
    </div>
  );
}
