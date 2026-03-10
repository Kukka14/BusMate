import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Road_sign_LivePage.css";

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
  const utt  = new SpeechSynthesisUtterance(text);
  utt.lang   = "en-US";
  utt.rate   = 0.95;
  utt.pitch  = 1;
  utt.volume = 1;
  window.speechSynthesis.speak(utt);
}

// ── Status color helper ────────────────────────────────────────────────────────
const statusColor = (s) => {
  if (!s)                                              return "#6366f1";
  if (s === "Normal")                                  return "#22c55e";
  if (s.includes("Damaged") || s.includes("Unclear")) return "#ef4444";
  return "#f59e0b";
};

// ── Icons ──────────────────────────────────────────────────────────────────────
const IcoHome     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IcoMonitor  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoSched    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IcoUser     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IcoLogout   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IcoRoadSign = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18M10.5 10.677a2 2 0 002.828 2.828"/><path d="M13.161 6.843A2 2 0 0115 9a2 2 0 00.8-.167m1.99 1.99C18.954 12.099 20 13.927 20 16a8 8 0 01-8 8 8 8 0 01-8-8c0-4.42 3.579-8 8-8 .786 0 1.547.113 2.268.322"/><path d="M12 4V2"/></svg>;
const IcoCapture  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M20 7h-2.5l-1-2h-9l-1 2H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/></svg>;
const IcoAlert    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;

// ── Sidebar ────────────────────────────────────────────────────────────────────
function Sidebar({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [rsOpen, setRsOpen] = useState(true); // keep open — we're on webcam page
  const [roadSceneOpen, setRoadSceneOpen] = useState(
    location.pathname.startsWith("/road-scene")
  );

  const items = [
    { key: "dashboard", label: "Dashboard",                      Icon: IcoHome,    path: "/driver/dashboard", sub: null },
    { key: "section1",  label: "Section 1",                      Icon: IcoSched,   path: null,                sub: null },
    { key: "monitor",   label: "Emotion Shift Profile Analysis",  Icon: IcoMonitor, path: "/driver/monitor",   sub: null },
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
      Icon: IcoMonitor,
      path: null,
      sub: [
        { key: "rsc-image",  label: "🖼  Image",  path: "/road-scene?mode=image" },
        { key: "rsc-video",  label: "🎥  Video",  path: "/road-scene?mode=video" },
        { key: "rsc-hazard", label: "🗺  Hazard", path: "/road-scene/hazard"     },
      ],
    },
    { key: "profile",   label: "Profile",                        Icon: IcoUser,    path: "/driver/profile",   sub: null },
  ];

  return (
    <aside className="rsl-sidebar">
      <div className="rsl-logo">
        <div className="rsl-logo-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <span>DriveGuard</span>
      </div>

      <nav className="rsl-nav">
        {items.map(({ key, label, Icon, path, sub }) => (
          <div key={key + label}>
            <button
              className={`rsl-nav-btn ${(key === "roadsign" || key === "roadscene") ? "active" : ""}`}
              onClick={() => {
                if (sub && key === "roadsign") setRsOpen(o => !o);
                else if (sub && key === "roadscene") setRoadSceneOpen(o => !o);
                else if (path) navigate(path);
              }}
            >
              <Icon />
              <span>{label}</span>
              {sub && (
                <span className="rsl-nav-arrow">
                  {(key === "roadsign" ? rsOpen : roadSceneOpen) ? "▾" : "▸"}
                </span>
              )}
            </button>

            {sub && (key === "roadsign" ? rsOpen : roadSceneOpen) && (
              <div className="rsl-nav-sub">
                {sub.map(s => (
                  <button
                    key={s.key}
                    className={`rsl-nav-sub-btn ${s.path === "/road-sign/live" ? "active" : ""}`}
                    onClick={() => setTimeout(() => navigate(s.path), 150)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="rsl-sidebar-foot">
        <div className="rsl-tip-box">
          <span className="rsl-tip-label">DETECTION TIP</span>
          <p className="rsl-tip-text">Hold the camera steady facing the sign for best accuracy.</p>
        </div>
        <button className="rsl-signout" onClick={onLogout}><IcoLogout />Sign Out</button>
      </div>
    </aside>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Road_sign_LivePage() {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");
  const user     = JSON.parse(localStorage.getItem("user") || "{}");

  const [info,         setInfo]         = useState(null);   // {class_name, confidence, status}
  const [capturing,    setCapturing]    = useState(false);
  const [captureErr,   setCaptureErr]   = useState("");
  const [log,          setLog]          = useState([]);     // detection history
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [streamError,  setStreamError]  = useState(false);

  // Refs to avoid stale closures inside the polling interval
  const audioEnabledRef = useRef(true);
  const lastSpokenRef   = useRef(null);
  const pollRef         = useRef(null);

  // Keep audioEnabledRef in sync with state
  useEffect(() => { audioEnabledRef.current = audioEnabled; }, [audioEnabled]);

  // Auth guard
  useEffect(() => { if (!token) navigate("/login"); }, [token, navigate]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  // ── Poll detection info (mount only — stop camera on unmount) ──────────────
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetch("/road-sign/get_detection_info")
        .then(r => r.json())
        .then(data => {
          const hasSign = data?.class_name;
          setInfo(hasSign ? data : null);

          if (hasSign && data.status === "Normal") {
            // Only trigger alert when the sign name changes
            if (lastSpokenRef.current !== data.class_name) {
              lastSpokenRef.current = data.class_name;

              if (audioEnabledRef.current) {
                const name = data.class_name.replace(/_/g, " ");
                playBeep(880, 0.2, 0.35);
                // Short delay so beep finishes before speech starts
                setTimeout(() => speakText(`Road sign detected: ${name}`), 250);
              }

              // Add to detection log
              setLog(prev => [
                {
                  class_name: data.class_name,
                  confidence: data.confidence,
                  status:     data.status,
                  time:       new Date().toLocaleTimeString(),
                },
                ...prev.slice(0, 29), // keep last 30 entries
              ]);
            }
          } else if (!hasSign) {
            // Reset so next appearance of same sign triggers alert again
            lastSpokenRef.current = null;
          }
        })
        .catch(() => {});
    }, 400);

    return () => {
      clearInterval(pollRef.current);
      // Stop server-side camera on page leave
      fetch("/road-sign/stop_camera").catch(() => {});
    };
  }, []); // intentionally empty — runs once on mount/unmount

  // ── Capture & full-ensemble analysis ──────────────────────────────────────
  const handleCapture = async () => {
    setCapturing(true);
    setCaptureErr("");
    try {
      const res  = await fetch("/road-sign/capture_webcam", { method: "POST" });
      const data = await res.json();

      if (data.error || !data.detected) {
        setCaptureErr(data.error || data.message || "No road sign in current frame.");
        return;
      }
      // Stop camera then navigate to full results page
      await fetch("/road-sign/stop_camera").catch(() => {});
      navigate("/road-sign/results", { state: { ...data, input_type: "webcam" } });
    } catch {
      setCaptureErr("Server not reachable — is the road-sign server running on port 5001?");
    } finally {
      setCapturing(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="rsl-root">
      <Sidebar onLogout={logout} />

      <main className="rsl-main">
        {/* ── Topbar ── */}
        <header className="rsl-topbar">
          <span className="rsl-topbar-title">🚦 Road Sign Detection — Live Webcam</span>
          <div className="rsl-topbar-right">
            <div className="rsl-driver-info">
              <span className="rsl-driver-name">{user.username || "Driver"}</span>
              <span className="rsl-driver-id">Live Detection Mode</span>
            </div>

            {/* Audio toggle button */}
            <button
              className={`rsl-audio-toggle ${audioEnabled ? "on" : "off"}`}
              onClick={() => setAudioEnabled(a => !a)}
              title={audioEnabled ? "Mute audio alerts" : "Enable audio alerts"}
            >
              {audioEnabled ? "🔊 Audio ON" : "🔇 Audio OFF"}
            </button>

            <div className={`rsl-status-pill ${info ? "active" : ""}`}>
              <span className="rsl-status-dot" />
              {info ? "DETECTING" : "SCANNING…"}
            </div>
          </div>
        </header>

        <div className="rsl-content">

          {/* ── Normal sign alert banner ── */}
          {info?.status === "Normal" && (
            <div className="rsl-alert-banner normal">
              <IcoRoadSign />
              <strong>ROAD SIGN DETECTED:</strong>&nbsp;
              {info.class_name.replace(/_/g, " ")}&nbsp;
              <span className="rsl-conf-chip">{(info.confidence * 100).toFixed(1)}%</span>
              <span className="rsl-audio-hint">🔊 Audio alert triggered</span>
            </div>
          )}

          {/* ── Damaged / unclear sign banner ── */}
          {info?.status && info.status !== "Normal" && (
            <div className="rsl-alert-banner warn">
              <IcoAlert />
              <strong>{info.status.toUpperCase()}:</strong>&nbsp;
              {info.class_name.replace(/_/g, " ")}&nbsp;
              <span className="rsl-conf-chip">{(info.confidence * 100).toFixed(1)}%</span>
            </div>
          )}

          <div className="rsl-grid">

            {/* ── Camera feed card ── */}
            <div className="rsl-card rsl-cam-card">
              <div className="rsl-card-head">
                <div>
                  <span className="rsl-card-title">Live Camera Feed</span>
                  <span className="rsl-card-hint">YOLO detection with bounding boxes drawn server-side (green = Normal, red = Damaged)</span>
                </div>
                <div className="rsl-head-right">
                  <span className="rsl-live-badge">
                    <span className="rsl-live-dot" />LIVE
                  </span>
                </div>
              </div>

              {/* MJPEG stream — bounding boxes rendered by the Flask server */}
              <div className="rsl-stream-wrap">
                <img
                  src="/road-sign/video_feed"
                  alt="Live road sign detection"
                  className="rsl-stream"
                  onError={() => setStreamError(true)}
                />
                {streamError && (
                  <div className="rsl-stream-error">
                    <span style={{ fontSize: 32 }}>🚫</span>
                    <p>Cannot reach video stream.</p>
                    <p>Is the road-sign server running on port 5001?</p>
                  </div>
                )}

                {/* Overlay chip showing current detection info */}
                {info?.class_name && (
                  <div
                    className="rsl-overlay-chip"
                    style={{ borderColor: statusColor(info.status), color: statusColor(info.status) }}
                  >
                    <span className="rsl-overlay-name">{info.class_name.replace(/_/g, " ")}</span>
                    <span className="rsl-overlay-sep">·</span>
                    <span className="rsl-overlay-conf">{(info.confidence * 100).toFixed(1)}%</span>
                    <span className="rsl-overlay-sep">·</span>
                    <span className="rsl-overlay-status">{info.status}</span>
                  </div>
                )}
              </div>

              {/* Capture button */}
              <div className="rsl-capture-row">
                <button
                  className="rsl-capture-btn"
                  onClick={handleCapture}
                  disabled={capturing}
                >
                  {capturing
                    ? <><span className="rsl-spinner" /> Running full ensemble…</>
                    : <><IcoCapture /> Capture & Full Ensemble Analysis</>}
                </button>
                {captureErr && <div className="rsl-capture-err">{captureErr}</div>}
                <p className="rsl-note">
                  Live view uses YOLO only (fast). Capture runs the full MobileNetV2 + Custom + YOLOv8 ensemble.
                </p>
              </div>
            </div>

            {/* ── Right column ── */}
            <div className="rsl-right-col">

              {/* Current detection card */}
              <div className="rsl-card">
                <div className="rsl-card-head">
                  <div>
                    <span className="rsl-card-title">Current Detection</span>
                    <span className="rsl-card-hint">Live YOLO output</span>
                  </div>
                  <span
                    className="rsl-card-badge"
                    style={{
                      background: statusColor(info?.status) + "22",
                      color:      statusColor(info?.status),
                    }}
                  >
                    {info?.status || "No Sign"}
                  </span>
                </div>

                {info?.class_name ? (
                  <div className="rsl-det-body">
                    <div className="rsl-sign-icon">🚦</div>
                    <div className="rsl-det-name">{info.class_name.replace(/_/g, " ")}</div>

                    {/* Confidence bar */}
                    <div className="rsl-det-conf-bar-wrap">
                      <div
                        className="rsl-det-conf-bar"
                        style={{
                          width:      `${(info.confidence * 100).toFixed(1)}%`,
                          background: statusColor(info.status),
                        }}
                      />
                    </div>
                    <div className="rsl-det-conf-label">
                      Confidence: {(info.confidence * 100).toFixed(1)}%
                    </div>

                    <div className="rsl-det-metrics">
                      {[
                        ["Status",       info.status,                              statusColor(info.status)],
                        ["Sign Class",   info.class_name.replace(/_/g, " "),       null],
                        ["Audio Alert",  audioEnabled ? "Enabled ✓" : "Muted",    audioEnabled ? "#22c55e" : "#64748b"],
                        ["Log Entries",  log.length,                               null],
                      ].map(([lbl, val, clr]) => (
                        <div className="rsl-metric-row" key={lbl}>
                          <span className="rsl-metric-lbl">{lbl}</span>
                          <span className="rsl-metric-val" style={clr ? { color: clr } : {}}>
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rsl-no-data">
                    <div className="rsl-scan-anim">🔍</div>
                    <p>Scanning for road signs…</p>
                    <p className="rsl-hint">Point the camera at a road sign</p>
                  </div>
                )}
              </div>

              {/* Detection log card */}
              <div className="rsl-card rsl-log-card">
                <div className="rsl-card-head">
                  <div>
                    <span className="rsl-card-title">Detection Log</span>
                    <span className="rsl-card-hint">Each new sign triggers an audio alert</span>
                  </div>
                  <span className="rsl-card-badge neutral">{log.length} signs</span>
                </div>

                {log.length > 0 ? (
                  <div className="rsl-log-list">
                    {log.map((entry, i) => (
                      <div key={i} className={`rsl-log-row ${entry.status === "Normal" ? "normal" : "warn"}`}>
                        <span className="rsl-log-time">{entry.time}</span>
                        <span className="rsl-log-name">{entry.class_name.replace(/_/g, " ")}</span>
                        <span className="rsl-log-conf">{(entry.confidence * 100).toFixed(1)}%</span>
                        <span
                          className="rsl-log-status"
                          style={{ color: statusColor(entry.status) }}
                        >
                          {entry.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rsl-no-data">No detections yet — waiting for road signs…</p>
                )}
              </div>

            </div>{/* end right col */}
          </div>{/* end grid */}
        </div>{/* end content */}
      </main>
    </div>
  );
}
