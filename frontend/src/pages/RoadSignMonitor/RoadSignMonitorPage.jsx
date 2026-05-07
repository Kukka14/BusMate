import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import Sidebar from "../../components/common/Sidebar";
import { getSignInstruction, PRIORITY_COLORS } from "../../utils/roadSignInstructions";
import "./RoadSignMonitor.css";

const API        = import.meta.env.VITE_API_URL || "http://localhost:5000";
const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Audio helpers ──────────────────────────────────────────────────────────────
function playBeep(freq = 880, duration = 0.2, vol = 0.35) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type            = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt    = new SpeechSynthesisUtterance(text);
  utt.lang     = "en-US";
  utt.rate     = 0.95;
  utt.pitch    = 1;
  utt.volume   = 1;
  window.speechSynthesis.speak(utt);
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const formatLabel = (v) =>
  typeof v === "string" ? v.replace(/_/g, " ") : (v == null ? "—" : String(v).replace(/_/g, " "));

const formatDist = (m) => {
  if (m === null || m === undefined || Number.isNaN(Number(m))) return "—";
  return `${Number(m).toFixed(2)} m`;
};

const RISK_COLOR = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#22c55e" };
const CONG_COLOR = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#22c55e" };

// ── Icons ──────────────────────────────────────────────────────────────────────
const IcoCapture = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3"/>
    <path d="M20 7h-2.5l-1-2h-9l-1 2H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
  </svg>
);
const IcoPlay = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);
const IcoStop = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>
);

// ── Confidence bar ─────────────────────────────────────────────────────────────
function ConfBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  const col = pct > 70 ? "#22c55e" : pct > 45 ? "#f59e0b" : "#ef4444";
  return (
    <div className="rsm-conf-wrap">
      <div className="rsm-conf-labels">
        <span>Confidence</span>
        <span style={{ color: col, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div className="rsm-conf-track">
        <div className="rsm-conf-fill" style={{ width: `${pct}%`, background: col }} />
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function RoadSignMonitorPage() {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");
  const user     = JSON.parse(localStorage.getItem("user") || "{}");

  const [info,             setInfo]             = useState(null);
  const [log,              setLog]              = useState([]);
  const [audioEnabled,     setAudioEnabled]     = useState(true);
  const [capturing,        setCapturing]        = useState(false);
  const [captureErr,       setCaptureErr]       = useState("");
  const [sessionId,        setSessionId]        = useState("");
  const [sessionStarting,  setSessionStarting]  = useState(false);
  const [alertBanner,      setAlertBanner]      = useState(null);
  const [devices,          setDevices]          = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [camError,         setCamError]         = useState("");

  const videoRef        = useRef(null);
  const captureCanvasRef = useRef(null);
  const streamRef       = useRef(null);
  const socketRef       = useRef(null);
  const sendIvRef       = useRef(null);
  const inFlightRef     = useRef(false);
  const audioRef        = useRef(true);
  const sessionActiveRef = useRef(false);
  const lastSpokenRef   = useRef(null);
  const pollRef         = useRef(null);
  const bannerTimerRef  = useRef(null);

  useEffect(() => { audioRef.current = audioEnabled; }, [audioEnabled]);
  useEffect(() => { sessionActiveRef.current = Boolean(sessionId); }, [sessionId]);
  useEffect(() => { if (!token) navigate("/login"); }, [token, navigate]);

  // ── Enumerate cameras ────────────────────────────────────────────────────
  useEffect(() => {
    async function loadDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const list = await navigator.mediaDevices.enumerateDevices();
        const cams = list.filter(d => d.kind === "videoinput");
        setDevices(cams);
        if (cams.length > 0) setSelectedDeviceId(cams[0].deviceId);
      } catch { setCamError("Camera permission denied."); }
    }
    loadDevices();
  }, []);

  // ── Open camera when device selected ────────────────────────────────────
  useEffect(() => {
    if (!selectedDeviceId) return;
    let active = true;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(s => {
        if (!active) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCamError("");
      })
      .catch(() => setCamError("Cannot open selected camera."));
    return () => {
      active = false;
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [selectedDeviceId]);

  // ── Socket.IO — connect once ─────────────────────────────────────────────
  useEffect(() => {
    const sock = io(SOCKET_URL, { transports: ["websocket"], reconnectionDelayMax: 10000 });
    socketRef.current = sock;

    sock.on("road_sign_result", data => {
      inFlightRef.current = false;
      if (!sessionActiveRef.current) { setInfo(null); lastSpokenRef.current = null; return; }

      const hasSign        = typeof data?.class_name === "string" && data.class_name.trim();
      const hasVehicleMeta = data?.nearest_vehicle_distance_m !== undefined || data?.vehicle_collision_risk !== undefined;
      setInfo(hasSign || hasVehicleMeta ? data : null);

      if (hasSign && data.status === "Normal") {
        if (lastSpokenRef.current !== data.class_name) {
          lastSpokenRef.current = data.class_name;
          const instr = getSignInstruction(data.class_name);
          const pc = instr ? PRIORITY_COLORS[instr.priority] : null;
          setAlertBanner({ text: `${instr?.icon ?? "🔍"} ${formatLabel(data.class_name)}`, color: pc?.border ?? "#f59e0b" });
          clearTimeout(bannerTimerRef.current);
          bannerTimerRef.current = setTimeout(() => setAlertBanner(null), 4000);
          if (audioRef.current) {
            playBeep(880, 0.2, 0.35);
            setTimeout(() => speakText(`Road sign: ${data.class_name.replace(/_/g, " ")}`), 250);
          }
          setLog(prev => [{
            name: data.class_name, icon: instr?.icon ?? "🔍",
            confidence: data.confidence, dist: data.estimated_distance_m,
            time: new Date().toLocaleTimeString(),
          }, ...prev.slice(0, 29)]);
        }
      } else if (!hasSign) {
        lastSpokenRef.current = null;
      }
    });

    // Frame send loop — only when session active
    const canvas = document.createElement("canvas");
    captureCanvasRef.current = canvas;
    sendIvRef.current = setInterval(() => {
      if (!sessionActiveRef.current || inFlightRef.current) return;
      const video = videoRef.current;
      if (!video || !video.srcObject || video.readyState < 2) return;
      canvas.width = 320; canvas.height = 240;
      canvas.getContext("2d").drawImage(video, 0, 0, 320, 240);
      inFlightRef.current = true;
      sock.emit("road_sign_frame", { image: canvas.toDataURL("image/jpeg", 0.7) });
    }, 400);

    return () => {
      clearInterval(sendIvRef.current);
      sock.disconnect();
    };
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      fetch(`${API}/stop_webcam_session`, { method: "POST" }).catch(() => {});
    };
  }, []);

  // ── Session controls ───────────────────────────────────────────────────────
  const handleStart = async () => {
    setSessionStarting(true);
    try {
      const res  = await fetch(`${API}/start_webcam_session`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data?.webcam_session_id) {
        setSessionId(data.webcam_session_id);
        setInfo(null);
        setLog([]);
        lastSpokenRef.current = null;
      }
    } catch (_) {}
    finally { setSessionStarting(false); }
  };

  const handleStop = async () => {
    try { await fetch(`${API}/stop_webcam_session`, { method: "POST" }); } catch (_) {}
    setSessionId("");
    setInfo(null);
    setLog([]);
    lastSpokenRef.current = null;
  };

  // ── Capture & full-ensemble analysis ──────────────────────────────────────
  const handleCapture = async () => {
    setCapturing(true);
    setCaptureErr("");
    try {
      const res  = await fetch(`${API}/capture_webcam`, { method: "POST" });
      const data = await res.json();
      if (data.error || !data.detected) {
        setCaptureErr(data.error || data.message || "No road sign detected in current frame.");
        return;
      }
      await fetch(`${API}/stop_camera`).catch(() => {});
      navigate("/road-sign/results", { state: { ...data, input_type: "webcam" } });
    } catch {
      setCaptureErr("Backend not reachable — make sure app.py is running.");
    } finally {
      setCapturing(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const hasSign        = typeof info?.class_name === "string" && info.class_name.trim().length > 0;
  const hasVehicleMeta = info?.nearest_vehicle_distance_m !== undefined || info?.vehicle_collision_risk !== undefined;
  const instr          = hasSign ? getSignInstruction(info.class_name) : null;
  const pc             = instr   ? PRIORITY_COLORS[instr.priority]     : null;
  const riskColor      = RISK_COLOR[info?.vehicle_collision_risk]  ?? "#64748b";
  const congColor      = CONG_COLOR[info?.traffic_congestion]      ?? "#64748b";

  const statusLabel = hasSign ? "Detected" : hasVehicleMeta ? "Tracking" : sessionId ? "Scanning…" : "Stopped";
  const statusDot   = hasSign ? "#22c55e"  : hasVehicleMeta ? "#38bdf8"  : sessionId ? "#f59e0b"   : "#475569";

  return (
    <div className="rsm-root">
      <Sidebar activeKey="monitor" />

      <div className="rsm-main">
        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="rsm-topbar">
          <div className="rsm-topbar-left">
            <span className="rsm-topbar-icon">🚦</span>
            <div>
              <div className="rsm-topbar-title">Road Sign Monitor</div>
              <div className="rsm-topbar-sub">Live webcam detection · multi-model ensemble</div>
            </div>
          </div>
          <div className="rsm-topbar-right">
            <span className="rsm-status-dot" style={{ background: statusDot }} />
            <span className="rsm-status-label">{statusLabel}</span>
            <button
              className="rsm-btn rsm-btn-audio"
              onClick={() => setAudioEnabled(v => !v)}
              title={audioEnabled ? "Mute alerts" : "Enable alerts"}
            >
              {audioEnabled ? "🔊" : "🔇"}
            </button>
            <button className="rsm-btn rsm-btn-danger" onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("user"); navigate("/login"); }}>
              Sign out
            </button>
          </div>
        </div>

        {/* ── Alert banner ────────────────────────────────────────────────── */}
        {alertBanner && (
          <div className="rsm-alert-banner" style={{ borderColor: alertBanner.color, color: alertBanner.color }}>
            <span>{alertBanner.text}</span>
            <button onClick={() => setAlertBanner(null)}>✕</button>
          </div>
        )}

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="rsm-body">
          {/* ── Left column: stream + session controls ─────────────────── */}
          <div className="rsm-stream-col">
            {/* MJPEG stream card */}
            <div className="rsm-card rsm-stream-card">
              <div className="rsm-card-head">
                <span className="rsm-card-title">📷 Live Feed</span>
                <span className="rsm-live-badge">● LIVE</span>
              </div>

              {/* Camera selector */}
              {devices.length > 1 && (
                <div style={{padding:"0 0 0.5rem 0"}}>
                  <select
                    value={selectedDeviceId}
                    onChange={e => setSelectedDeviceId(e.target.value)}
                    style={{width:"100%",background:"#0f1c2e",color:"#e2e8f0",border:"1px solid #1e3a5f",
                      borderRadius:6,padding:"6px 10px",fontSize:"0.8rem",cursor:"pointer"}}
                  >
                    {devices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {camError && <div style={{color:"#ef4444",fontSize:"0.75rem",marginBottom:"0.5rem"}}>{camError}</div>}

              <div className="rsm-stream-wrap" style={{position:"relative"}}>
                <video
                  ref={videoRef}
                  autoPlay playsInline muted
                  className="rsm-stream-img"
                  style={{width:"100%",borderRadius:"0.5rem",display:"block"}}
                />
                {hasSign && (
                  <div className="rsm-stream-overlay">
                    <span className="rsm-stream-tag">{formatLabel(info.class_name)}</span>
                    <span className="rsm-stream-conf">{Math.round((info.confidence ?? 0) * 100)}%</span>
                  </div>
                )}
                {!sessionId && (
                  <div className="rsm-stream-idle">
                    <span>Camera paused</span>
                  </div>
                )}
              </div>

              {/* Session controls */}
              <div className="rsm-session-controls">
                {!sessionId ? (
                  <button className="rsm-btn rsm-btn-start" onClick={handleStart} disabled={sessionStarting}>
                    <IcoPlay /> {sessionStarting ? "Starting…" : "Start Session"}
                  </button>
                ) : (
                  <>
                    <button className="rsm-btn rsm-btn-stop" onClick={handleStop}>
                      <IcoStop /> Stop Session
                    </button>
                    <button className="rsm-btn rsm-btn-capture" onClick={handleCapture} disabled={capturing}>
                      <IcoCapture /> {capturing ? "Analyzing…" : "Capture & Analyze"}
                    </button>
                  </>
                )}
              </div>
              {captureErr && <div className="rsm-capture-err">{captureErr}</div>}
            </div>

            {/* Detection log card */}
            <div className="rsm-card rsm-log-card">
              <div className="rsm-card-head">
                <span className="rsm-card-title">📋 Detection Log</span>
                <span className="rsm-log-count">{log.length}</span>
              </div>
              {log.length === 0 ? (
                <div className="rsm-log-empty">No detections yet</div>
              ) : (
                <div className="rsm-log-list">
                  {log.map((entry, i) => (
                    <div key={i} className="rsm-log-row">
                      <span className="rsm-log-icon">{entry.icon}</span>
                      <span className="rsm-log-name">{formatLabel(entry.name)}</span>
                      <span className="rsm-log-conf">{Math.round((entry.confidence ?? 0) * 100)}%</span>
                      <span className="rsm-log-dist">{formatDist(entry.dist)}</span>
                      <span className="rsm-log-time">{entry.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right column: detection info + vehicle data ─────────────── */}
          <div className="rsm-results-col">
            {/* Road sign detection card */}
            <div className="rsm-card rsm-detect-card" style={pc ? { borderColor: pc.border, background: `linear-gradient(160deg, ${pc.bg} 0%, rgba(7,15,30,0.95) 60%)` } : {}}>
              <div className="rsm-card-head">
                <span className="rsm-card-title">🔍 Sign Detection</span>
                {hasSign && instr && (
                  <span className="rsm-priority-badge" style={{ background: pc?.badge ?? "#f59e0b", color: "#000" }}>
                    {instr.priorityLabel}
                  </span>
                )}
              </div>

              {hasSign ? (
                <div className="rsm-detect-body">
                  <div className="rsm-detect-main">
                    <span className="rsm-detect-icon">{instr?.icon ?? "🔍"}</span>
                    <div className="rsm-detect-text">
                      <div className="rsm-detect-name">{formatLabel(info.class_name)}</div>
                      {instr && <div className="rsm-detect-instr">{instr.instruction}</div>}
                    </div>
                  </div>

                  <ConfBar value={info.confidence} />

                  <div className="rsm-metric-grid">
                    <div className="rsm-metric-tile">
                      <div className="rsm-metric-label">Sign Status</div>
                      <div className="rsm-metric-val" style={{ color: info.status === "Normal" ? "#22c55e" : "#f59e0b" }}>
                        {info.status ?? "—"}
                      </div>
                    </div>
                    <div className="rsm-metric-tile">
                      <div className="rsm-metric-label">Sign Distance</div>
                      <div className="rsm-metric-val" style={{ color: "#38bdf8" }}>{formatDist(info.estimated_distance_m)}</div>
                    </div>
                  </div>

                  {instr?.action && (
                    <div className="rsm-action-box" style={{ borderColor: pc?.border ?? "#f59e0b" }}>
                      <span className="rsm-action-label">Action Required</span>
                      <span className="rsm-action-text">{instr.action}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rsm-no-detect">
                  <span className="rsm-no-detect-icon">👁</span>
                  <p>{sessionId ? "Scanning for road signs…" : "Start a session to begin detection"}</p>
                </div>
              )}
            </div>

            {/* Vehicle & collision card */}
            <div className="rsm-card rsm-vehicle-card">
              <div className="rsm-card-head">
                <span className="rsm-card-title">🚗 Vehicle & Collision</span>
                {hasVehicleMeta && (
                  <span className="rsm-risk-badge" style={{ color: riskColor, borderColor: riskColor }}>
                    {info?.vehicle_collision_risk ?? "—"} RISK
                  </span>
                )}
              </div>

              <div className="rsm-vehicle-grid">
                {[
                  { label: "Collision Risk",     val: info?.vehicle_collision_risk ?? "—",       color: riskColor         },
                  { label: "Nearest Vehicle",     val: formatDist(info?.nearest_vehicle_distance_m), color: riskColor     },
                  { label: "Vehicle Count",       val: info?.vehicle_count != null ? `${info.vehicle_count}` : hasVehicleMeta ? "0" : "—" },
                  { label: "Traffic Congestion",  val: info?.traffic_congestion ?? "—",           color: congColor         },
                ].map(({ label, val, color }) => (
                  <div key={label} className="rsm-vehicle-tile">
                    <div className="rsm-vehicle-tile-label">{label}</div>
                    <div className="rsm-vehicle-tile-val" style={color ? { color } : {}}>{val}</div>
                  </div>
                ))}
              </div>

              {!hasVehicleMeta && (
                <div className="rsm-no-detect" style={{ padding: "0.75rem" }}>
                  <p style={{ fontSize: "0.78rem" }}>Vehicle data will appear when the camera detects nearby vehicles</p>
                </div>
              )}
            </div>

            {/* Session info card */}
            <div className="rsm-card rsm-session-card">
              <div className="rsm-card-head">
                <span className="rsm-card-title">📊 Session Info</span>
              </div>
              <div className="rsm-metric-grid">
                <div className="rsm-metric-tile">
                  <div className="rsm-metric-label">Signs Detected</div>
                  <div className="rsm-metric-val" style={{ color: "#22c55e" }}>{log.length}</div>
                </div>
                <div className="rsm-metric-tile">
                  <div className="rsm-metric-label">Session</div>
                  <div className="rsm-metric-val" style={{ color: sessionId ? "#22c55e" : "#64748b" }}>
                    {sessionId ? "Active" : "Inactive"}
                  </div>
                </div>
              </div>
              <div className="rsm-pipeline-note">
                Pipeline: YOLOv8 detect → Crop → CLAHE → Ensemble (YOLOv8 + Custom CNN + MobileNetV2) → Distance estimate → Collision risk
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
