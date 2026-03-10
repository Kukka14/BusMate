import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import "./RoadSceneUploadPage.css";

const MODES = [
  { id: "image", label: "🖼  Image" },
  { id: "video", label: "🎥  Video" },
];

export default function RoadSceneUploadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(() => {
    const m = searchParams.get("mode");
    return m === "video" ? "video" : "image";
  });
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const videoRef              = useRef(null);

  // Reset when switching modes
  useEffect(() => {
    setFile(null);
    setPreview(null);
    setError("");
  }, [mode]);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    setFile(f || null);
    setError("");
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError(`Please select a${mode === "video" ? " video" : "n image"} first.`); return; }
    setError("");
    setLoading(true);
    try {
      const body = new FormData();
      body.append("file", file);

      if (mode === "image") {
        const res  = await fetch("/rsa/analyse", { method: "POST", body });
        const data = await res.json();
        if (!res.ok || data.error) { setError(data.error || "Analysis failed."); return; }
        navigate("/road-scene/results", { state: data });
      } else {
        const res  = await fetch("/rsa/analyse-video", { method: "POST", body });
        const data = await res.json();
        if (!res.ok || data.error) { setError(data.error || "Video analysis failed."); return; }
        // Store video URL in sessionStorage so results page can play it
        sessionStorage.setItem("rsa_video_url", preview);
        navigate("/road-scene/video-results", { state: data });
      }
    } catch {
      setError("Network error — is the backend server running on port 5000?");
    } finally {
      setLoading(false);
    }
  };

  const isVideo = mode === "video";

  return (
    <div className="rsa-layout">
      <Sidebar activeKey="roadscene" />
      <main className="rsa-main">
        <div className="rsa-page">
          <div className="rsa-header">
            <span className="rsa-header-icon">🛣</span>
            <h1>Road Scene Analysis</h1>
          </div>

          <div className="rsa-card">
            {/* Mode tabs */}
            <div className="rsa-tabs">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`rsa-tab${mode === m.id ? " active" : ""}`}
                  onClick={() => setMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <p className="rsa-desc">
              {isVideo
                ? "Upload a road scene video to get per-frame semantic segmentation and hazard assessment across all 16 classes."
                : "Upload a road scene image to get a semantic segmentation overlay and a real-time Hazard Assessment score across 16 scene classes."}
            </p>

            <form onSubmit={handleSubmit}>
              <label className="rsa-drop-zone" htmlFor="rsa-file-input">
                {preview && !isVideo ? (
                  <img src={preview} alt="Preview" className="rsa-preview-img" />
                ) : preview && isVideo ? (
                  <video
                    ref={videoRef}
                    src={preview}
                    className="rsa-preview-video"
                    controls
                    onClick={(e) => e.preventDefault()}
                  />
                ) : (
                  <div className="rsa-drop-placeholder">
                    <span className="rsa-drop-icon">{isVideo ? "🎥" : "📂"}</span>
                    <span>Click to select {isVideo ? "a video" : "an image"}</span>
                    <span className="rsa-drop-hint">
                      {isVideo ? "MP4 · AVI · MOV · MKV" : "JPG · PNG · WEBP"}
                    </span>
                  </div>
                )}
              </label>
              <input
                id="rsa-file-input"
                key={mode}
                type="file"
                accept={isVideo ? "video/*" : "image/*"}
                className="rsa-file-hidden"
                onChange={handleFileChange}
              />

              {file && (
                <p className="rsa-file-name">
                  {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </p>
              )}

              {error && <div className="rsa-error">{error}</div>}

              {loading && isVideo && (
                <div className="rsa-progress-note">
                  ⏳ Analysing video frames — this may take a minute…
                </div>
              )}

              <button className="rsa-btn" type="submit" disabled={loading || !file}>
                {loading ? (
                  <><span className="rsa-spinner" /> {isVideo ? "Processing video…" : "Analysing…"}</>
                ) : (
                  isVideo ? "🎞  Analyse Video" : "🔍  Analyse Scene"
                )}
              </button>
            </form>

            <div className="rsa-classes-hint">
              <span className="rsa-classes-label">Detects:</span>
              Road · Sidewalk · Curb · Lane Marking · Crosswalk · Barrier · Bridge ·
              Tunnel · Building · Vegetation · Traffic Control · Pole/Light ·
              <strong> Person · Two-wheeler · Vehicle · Pothole</strong>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
