import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import "./RoadSceneVideoResultsPage.css";

const hazardColor = (level) =>
  level === "High" ? "#ef4444" : level === "Medium" ? "#f59e0b" : "#22c55e";

export default function RoadSceneVideoResultsPage() {
  const { state } = useLocation();
  const navigate  = useNavigate();
  const videoRef  = useRef(null);
  const stripRef  = useRef(null);
  const [videoUrl,  setVideoUrl]  = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const url = sessionStorage.getItem("rsa_video_url");
    if (url) setVideoUrl(url);
  }, []);

  const frames = state?.frames || [];
  const hasFrames = frames.length > 0;
  const active = hasFrames ? frames[activeIdx] : null;
  const hColor = active ? hazardColor(active.hazard.level) : "#22c55e";

  /* Sync active frame to video playback position */
  const handleTimeUpdate = () => {
    if (!videoRef.current || !hasFrames) return;
    const t = videoRef.current.currentTime;
    let best = 0, bestDiff = Infinity;
    frames.forEach((f, i) => {
      const d = Math.abs(f.timestamp - t);
      if (d < bestDiff) { bestDiff = d; best = i; }
    });
    if (best !== activeIdx) setActiveIdx(best);
  };

  /* Click thumb or card → seek video */
  const seekTo = (idx) => {
    if (!hasFrames) return;
    setActiveIdx(idx);
    if (videoRef.current) videoRef.current.currentTime = frames[idx].timestamp;
    /* scroll thumb into view */
    if (stripRef.current) {
      const btn = stripRef.current.children[idx];
      if (btn) btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  };

  return (
    <div className="rsav-layout">
      <Sidebar activeKey="roadscene" />
      <main className="rsav-main">
        {!hasFrames ? (
          <div className="rsav-empty">
            <span style={{ fontSize: "3rem" }}>🚫</span>
            <p>No results to display.</p>
            <button className="rsav-back-btn" onClick={() => navigate("/road-scene")}>
              ← Go Back
            </button>
          </div>
        ) : (
          <div className="rsav-page">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="rsav-header">
              <h1 className="rsav-title">Road Scene Prediction Analysis</h1>
              <div className="rsav-header-right">
                <span className="rsav-count">{frames.length} frames analysed</span>
                <button className="rsav-back-btn" onClick={() => navigate("/road-scene")}>
                  ← Analyse Another
                </button>
              </div>
            </div>

            {/* ── Live panel: video + live analysis ──────────────────────────── */}
            <div className="rsav-live-panel">

              {/* Video */}
              <div className="rsav-video-col">
                {videoUrl ? (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="rsav-video"
                    controls
                    onTimeUpdate={handleTimeUpdate}
                  />
                ) : (
                  <div className="rsav-no-video">
                    <span>🎥</span>
                    <p>Video preview not available</p>
                  </div>
                )}
                <div className="rsav-live-chip">▶ Live Playback</div>
              </div>

              {/* Live frame analysis */}
              <div className="rsav-live-detail">

                <div className="rsav-live-toprow">
                  <span className="rsav-live-frame">Frame {active.frame}</span>
                  <span className="rsav-live-ts">⏱ {active.timestamp}s</span>
                  <span className="rsav-live-badge" style={{ background: hColor }}>
                    {active.hazard.level}
                  </span>
                </div>

                <img src={active.overlay} alt="Overlay" className="rsav-live-overlay" />

                <div className="rsav-live-score-row">
                  <span className="rsav-live-score-label">Hazard Score</span>
                  <span className="rsav-live-score-val" style={{ color: hColor }}>
                    {active.hazard.score.toFixed(1)}<span className="rsav-live-score-max"> / 100</span>
                  </span>
                </div>
                <div className="rsav-bar-bg">
                  <div className="rsav-bar-fill"
                    style={{ width: `${Math.min(active.hazard.score,100)}%`, background: hColor }} />
                </div>

                <div className="rsav-live-seg-title">16 Class Predictions</div>
                <div className="rsav-live-segs">
                  {active.segments.map((seg) => (
                    <div key={seg.id} className="rsav-live-seg-row">
                      <span className="rsav-live-seg-dot" style={{ background: seg.color }} />
                      <span className="rsav-live-seg-name">{seg.label}</span>
                      <div className="rsav-live-seg-bar-bg">
                        <div className="rsav-live-seg-bar-fill"
                          style={{ width: `${Math.min(seg.pixel_pct,100)}%`, background: seg.color }} />
                      </div>
                      <span className="rsav-live-seg-pct">{seg.pixel_pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>

              </div>
            </div>

            {/* ── Thumbnail timeline strip ──────────────────────────────────────── */}
            <div className="rsav-strip" ref={stripRef}>
              {frames.map((f, i) => (
                <button
                  key={i}
                  className={`rsav-thumb${i === activeIdx ? " active" : ""}`}
                  onClick={() => seekTo(i)}
                  title={`${f.timestamp}s — ${f.hazard.level}`}
                >
                  <img src={f.original} alt="" className="rsav-thumb-img" />
                  <span className="rsav-thumb-badge"
                    style={{ background: hazardColor(f.hazard.level) }}>
                    {f.hazard.level}
                  </span>
                  <span className="rsav-thumb-ts">{f.timestamp}s</span>
                </button>
              ))}
            </div>

            {/* ── All frame cards grid ──────────────────────────────────────────── */}
            <div className="rsav-grid-label">All Analysed Frames</div>
            <div className="rsav-grid">
              {frames.map((f, i) => {
                const hc = hazardColor(f.hazard.level);
                return (
                  <div
                    key={i}
                    className={`rsav-card${i === activeIdx ? " active" : ""}`}
                    onClick={() => seekTo(i)}
                  >
                    <div className="rsav-card-img-wrap">
                      <img src={f.overlay} alt={`Frame ${f.frame}`} className="rsav-card-img" />
                      <span className="rsav-card-hazard-badge" style={{ background: hc }}>
                        {f.hazard.level}
                      </span>
                    </div>

                    <div className="rsav-card-heading">Frame {f.frame}</div>

                    <div className="rsav-card-rows">
                      <div className="rsav-card-row">
                        <span className="rsav-card-row-label">Timestamp</span>
                        <span className="rsav-card-row-val">{f.timestamp}s</span>
                      </div>
                      <div className="rsav-card-row">
                        <span className="rsav-card-row-label">Hazard Score</span>
                        <span className="rsav-card-row-val" style={{ color: hc, fontWeight: 700 }}>
                          {f.hazard.score.toFixed(1)} / 100
                        </span>
                      </div>
                    </div>

                    <div className="rsav-card-seg-title">16 Class Prediction</div>
                    <div className="rsav-card-segs">
                      {f.segments.map((seg) => (
                        <div key={seg.id} className="rsav-card-seg-row">
                          <span className="rsav-card-seg-dot" style={{ background: seg.color }} />
                          <span className="rsav-card-seg-name">{seg.label}</span>
                          <div className="rsav-card-seg-bar-bg">
                            <div className="rsav-card-seg-bar-fill"
                              style={{ width: `${Math.min(seg.pixel_pct,100)}%`, background: seg.color }} />
                          </div>
                          <span className="rsav-card-seg-pct">{seg.pixel_pct.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
