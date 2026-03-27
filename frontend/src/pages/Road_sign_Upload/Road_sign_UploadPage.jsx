import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import "./Road_sign_UploadPage.css";

const MODES = [
  { id: "image",  label: "🖼  Image"   },
  { id: "video",  label: "🎥  Video"   },
  { id: "webcam", label: "📷  Webcam"  },
];

const statusColor = (s) => {
  if (!s)                                           return "#6366f1";
  if (s === "Normal")                               return "#22c55e";
  if (s.includes("Damaged") || s.includes("Unclear")) return "#ef4444";
  return "#f59e0b";
};

const formatDistance = (m) => {
  if (m === null || m === undefined || Number.isNaN(Number(m))) return "—";
  return `${Number(m).toFixed(2)} m`;
};

export default function Road_sign_UploadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState(() => {
    const m = searchParams.get("mode");
    return ["image", "video", "webcam"].includes(m) ? m : "image";
  });
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [liveInfo, setLiveInfo] = useState(null);
  const [videoStreamOn, setVideoStreamOn] = useState(false);
  const [videoStreamSrc, setVideoStreamSrc] = useState("");
  const [videoInfo, setVideoInfo] = useState(null);
  const [videoLog, setVideoLog] = useState([]);

  // ── Reset state when mode switches ─────────────────────────────────────────
  useEffect(() => {
    setFile(null);
    setPreview(null);
    setError("");
    setLiveInfo(null);
    setVideoInfo(null);
    setVideoLog([]);
    setVideoStreamOn(false);
    setVideoStreamSrc("");
  }, [mode]);

  // ── Webcam: poll detection info + stop camera on mode leave ────────────────
  useEffect(() => {
    if (mode !== "webcam") return;

    const id = setInterval(() => {
      fetch("/road-sign/get_detection_info")
        .then((r) => r.json())
        .then((data) => setLiveInfo(data))
        .catch(() => {});
    }, 400);

    return () => {
      clearInterval(id);
      fetch("/road-sign/stop_camera").catch(() => {});
    };
  }, [mode]);

  // ── Video stream: poll detection info + maintain log
  useEffect(() => {
    if (mode !== "video" || !videoStreamOn) return;

    const id = setInterval(() => {
      fetch("/road-sign/get_video_detection_info")
        .then((r) => r.json())
        .then((data) => {
          if (data?.class_name) {
            setVideoInfo(data);
            setVideoLog((prev) => {
              const next = [{
                class_name: data.class_name,
                confidence: data.confidence,
                status:     data.status,
                estimated_distance_m: data.estimated_distance_m,
                time:       new Date().toLocaleTimeString(),
              }, ...prev];
              return next.slice(0, 30);
            });
          } else {
            setVideoInfo(null);
          }
        })
        .catch(() => {});
    }, 400);

    return () => clearInterval(id);
  }, [mode, videoStreamOn]);

  // ── Video stream: stop stream on mode leave / unmount ─────────────────────
  useEffect(() => {
    if (mode !== "video") return;
    return () => {
      fetch("/road-sign/stop_video_stream").catch(() => {});
    };
  }, [mode]);

  // ── File change ────────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const f = e.target.files[0];
    setFile(f);
    setError("");
    setPreview(f && mode === "image" ? URL.createObjectURL(f) : null);
  };

  // ── Submit image / video ───────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError("Please select a file first."); return; }
    setError("");
    setLoading(true);
    try {
      if (mode === "video") {
        const body = new FormData();
        body.append("file", file);
        const res  = await fetch("/road-sign/upload_video_stream", { method: "POST", body });
        const data = await res.json();

        if (!res.ok || data.error) { setError(data.error || "Processing failed."); return; }

        setVideoStreamSrc(`/road-sign/video_stream_feed?t=${Date.now()}`);
        setVideoStreamOn(true);
        return;
      }

      const body = new FormData();
      body.append("file", file);
      body.append("input_type", mode);

      const res  = await fetch("/road-sign/upload", { method: "POST", body });
      const data = await res.json();

      if (!res.ok || data.error)  { setError(data.error || "Processing failed."); return; }
      if (!data.detected)         { setError(data.message || "No road sign detected."); return; }

      navigate("/road-sign/results", { state: data });
    } catch {
      setError("Network error — is the road-sign server running on port 5001?");
    } finally {
      setLoading(false);
    }
  };

  // ── Webcam capture ─────────────────────────────────────────────────────────
  const handleCapture = async () => {
    setError("");
    setLoading(true);
    try {
      const res  = await fetch("/road-sign/capture_webcam", { method: "POST" });
      const data = await res.json();

      if (data.error)     { setError(data.error); return; }
      if (!data.detected) { setError(data.message || "No road sign in current frame."); return; }

      await fetch("/road-sign/stop_camera").catch(() => {});
      navigate("/road-sign/results", { state: { ...data, input_type: "webcam" } });
    } catch {
      setError("Processing failed — is the road-sign server running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dd-root">
      <Sidebar />
      <main className="dd-page-main">
      <div className="rs-page">
      {/* Page header */}
      <div className="rs-header">
        <span className="rs-header-icon">🚦</span>
        <h1>Road Sign Detection</h1>
      </div>

      <div className="rs-card">
        {/* Mode tabs */}
        <div className="rs-tabs">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`rs-tab${mode === m.id ? " active" : ""}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* ── WEBCAM MODE ──────────────────────────────────────────────────── */}
        {mode === "webcam" && (
          <div className="rs-webcam-wrap">
            {/* Live MJPEG stream with YOLO bounding boxes drawn server-side */}
            <div className="rs-stream-container">
              <img
                src="/road-sign/video_feed"
                alt="Live YOLO detection feed"
                className="rs-stream"
              />

              {/* Detection info overlay */}
              <div className="rs-live-badge-wrap">
                {liveInfo?.class_name ? (
                  <>
                    <span className="rs-live-dot">LIVE</span>
                    <span className="rs-live-class">
                      {liveInfo.class_name.replace(/_/g, " ")}
                    </span>
                    <span className="rs-live-conf">
                      {(liveInfo.confidence * 100).toFixed(1)}%
                    </span>
                    {liveInfo.status && (
                      <span
                        className="rs-live-status"
                        style={{ color: statusColor(liveInfo.status) }}
                      >
                        {liveInfo.status}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="rs-live-dot scanning">Scanning…</span>
                    <span className="rs-live-scan-text">
                      Waiting for a road sign…
                    </span>
                  </>
                )}
              </div>
            </div>

            {error && <div className="rs-error">{error}</div>}

            {/* Capture & full-ensemble analysis */}
            <button
              className="rs-btn"
              onClick={handleCapture}
              disabled={loading}
            >
              {loading ? (
                <><span className="rs-spinner" />Processing…</>
              ) : (
                "📸 Capture & Analyse (Full Ensemble)"
              )}
            </button>

            <p className="rs-note">
              Live view uses YOLO only for speed. Capture runs the full
              MobileNetV2 + Custom + YOLOv8 ensemble.
            </p>
          </div>
        )}

        {mode === "image" && (
          /* ── IMAGE MODE ─────────────────────────────────────────────────── */
          <form onSubmit={handleSubmit}>
            {/* Drop / file zone */}
            <div className={`rs-drop${file ? " has-file" : ""}`}>
              <input
                id="rs-file"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
              />
              <label htmlFor="rs-file" className="rs-drop-label">
                <span className="icon">🖼</span>
                {file ? (
                  <span className="selected">✅ {file.name}</span>
                ) : (
                  <span>
                    Click to select an image file
                  </span>
                )}
              </label>
            </div>

            {/* Image preview */}
            {preview && (
              <img src={preview} alt="Preview" className="rs-preview" />
            )}

            {error && <div className="rs-error">{error}</div>}

            <button type="submit" className="rs-btn" disabled={loading}>
              {loading ? (
                <><span className="rs-spinner" /> Processing…</>
              ) : (
                "🔍 Process"
              )}
            </button>
          </form>
        )}

         {mode === "video" && (
          /* ── VIDEO MODE ─────────────────────────────────────────────────── */
          <form onSubmit={handleSubmit}>
            {/* Drop / file zone */}
            <div className={`rs-drop${file ? " has-file" : ""}`}>
              <input
                id="rs-file"
                type="file"
                accept="video/*"
                onChange={handleFileChange}
              />
              <label htmlFor="rs-file" className="rs-drop-label">
                <span className="icon">🎥</span>
                {file ? (
                  <span className="selected">✅ {file.name}</span>
                ) : (
                  <span>
                    Click to select a video file
                  </span>
                )}
              </label>
            </div>

            {error && <div className="rs-error">{error}</div>}

            {!videoStreamOn ? (
              <button type="submit" className="rs-btn" disabled={loading}>
                {loading ? (
                  <><span className="rs-spinner" /> Starting stream…</>
                ) : (
                  "▶ Start Live Stream"
                )}
              </button>
            ) : (
              <button
                type="button"
                className="rs-btn"
                onClick={async () => {
                  setLoading(true);
                  try {
                    await fetch("/road-sign/stop_video_stream");
                  } catch {}
                  setVideoStreamOn(false);
                  setVideoStreamSrc("");
                  setLoading(false);
                }}
              >
                ⏹ Stop Stream
              </button>
            )}

            {videoStreamOn && (
              <div className="rs-video-grid" style={{ marginTop: "1rem" }}>
                <div className="rs-video-stream-col">
                  <div className="rs-stream-container">
                    <img
                      src={videoStreamSrc}
                      alt="Live road-sign detection feed"
                      className="rs-stream"
                    />
                  </div>
                  <p className="rs-note">
                    Live stream shows road-sign detections overlaid on the video.
                  </p>
                </div>

                <div className="rs-video-info-col">
                  <div className="rs-card rs-mini-card">
                    <div className="rs-card-head">
                      <span className="rs-card-title">Current Detection</span>
                    </div>
                    {videoInfo ? (
                      <div className="rs-det-body">
                        <div className="rs-det-name">{videoInfo.class_name.replace(/_/g, " ")}</div>
                        <div className="rs-det-conf">{(videoInfo.confidence * 100).toFixed(1)}%</div>
                        <div className="rs-det-status" style={{ color: "#0ea5e9" }}>
                          {formatDistance(videoInfo.estimated_distance_m)}
                        </div>
                        <div
                          className="rs-det-status"
                          style={{ color: statusColor(videoInfo.status) }}
                        >
                          {videoInfo.status}
                        </div>
                      </div>
                    ) : (
                      <div className="rs-no-data">No detection yet</div>
                    )}
                  </div>

                  <div className="rs-card rs-mini-card" style={{ marginTop: "0.8rem" }}>
                    <div className="rs-card-head">
                      <span className="rs-card-title">Detection Log</span>
                      <span className="rs-card-hint">Last 30</span>
                    </div>
                    <div className="rs-log-list">
                      {videoLog.length > 0 ? (
                        videoLog.map((entry, idx) => (
                          <div key={idx} className="rs-log-row">
                            <span className="rs-log-time">{entry.time}</span>
                            <span className="rs-log-name">{entry.class_name.replace(/_/g, " ")}</span>
                            <span className="rs-log-conf">{(entry.confidence * 100).toFixed(1)}%</span>
                            <span className="rs-log-conf">{formatDistance(entry.estimated_distance_m)}</span>
                            <span className="rs-log-status" style={{ color: statusColor(entry.status) }}>
                              {entry.status}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="rs-no-data">No sign detections yet</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </form>
        )}
      </div> {/* rs-card */}
      </div> {/* rs-page */}
      </main>
    </div>
  );
}