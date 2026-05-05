import React from "react";
import MetricCard from "./MetricCard";
import AlertsList from "./AlertsList";
import "./ResultsPanel.css";

// Helper: hazard color mapping (mirroring ActiveShiftPage)
const hazardColor = (level) => {
  if (!level) return "#94a3b8";
  const levelStr = (level || "").toString().toLowerCase();
  if (levelStr.includes("critical")) return "#ef4444";
  if (levelStr.includes("high")) return "#f97316";
  if (levelStr.includes("medium")) return "#eab308";
  if (levelStr.includes("low")) return "#22c55e";
  return "#94a3b8";
};

export default function ResultsPanel({ results, mode, sceneFrame }) {
  if (!results && !sceneFrame) {
    if (mode === "roadscene") {
      return (
        <div className="results-panel rs-panel">
          <div className="rs-card">
            <div className="rs-header">
              <div className="rs-title">Road Scene</div>
              <div className="rs-analyzing">Analyzing</div>
            </div>

            <div className="rs-body">
              <div className="rs-left">
                <div className="rs-overlay-wrap">
                  <div style={{ padding: 36, color: "#94a3b8" }}>Waiting for overlay…</div>
                  <div className="rs-live-badge">● Live road camera</div>
                  <div className="rs-hazard-badge">—</div>
                </div>
              </div>

              <div className="rs-right">
                <div style={{ color: "#94a3b8", marginBottom: 6 }}>Detects</div>
                <ul className="rs-class-list" />

                <div style={{ marginTop: 12 }}>
                  <MetricCard label="Objects Detected" value={0} />
                  <AlertsList alerts={[]} />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return <div className="results-panel empty">Waiting for data…</div>;
  }

  // Road scene live mode: show overlay + breakdown + hazard score (matching ActiveShiftPage)
  if (mode === "roadscene" && sceneFrame) {
    const { overlay, hazard, segments } = sceneFrame;
    const hazardLevel = typeof hazard === "object" ? hazard.level : "Low";
    const hazardScore = typeof hazard === "object" ? hazard.score : hazard;
    const hzColor = hazardColor(hazardLevel);

    return (
      <div className="results-panel rs-panel">
        <div className="rs-card">
          <div className="rs-header">
            <div className="rs-title">🛣 Road Scene</div>
            <div className="rs-analyzing">Analyzing</div>
          </div>

          {sceneFrame && (
            <div className="rs-body">
              {/* Left: overlay image with live + hazard badges */}
              <div className="rs-left">
                <div className="rs-overlay-wrap">
                  {overlay ? (
                    <img src={overlay} alt="RSA overlay" className="rs-overlay-img" />
                  ) : (
                    <div style={{ padding: 36, color: "#94a3b8" }}>Waiting for overlay…</div>
                  )}
                  <div className="rs-live-badge">● Live road camera</div>
                  <div className="rs-hazard-badge" style={{ color: hzColor, borderColor: hzColor }}>
                    {hazardScore !== null ? `${hazardScore?.toFixed?.(1) ?? hazardScore} — ${hazardLevel}` : "—"}
                  </div>
                </div>
              </div>

              {/* Right: segments list + metrics */}
              <div className="rs-right">
                <div style={{ color: "#94a3b8", marginBottom: 6 }}>Detects</div>
                <ul className="rs-class-list">
                  {Array.isArray(segments) && segments.slice(0, 6).map((seg, i) => (
                    <li key={i} className="rs-class-item">
                      <div className="rs-class-label">
                        <span className="rs-swatch" style={{ background: seg.color || "#999" }} />
                        <span>{seg.label || seg.name || `Class ${seg.id ?? i}`}</span>
                      </div>
                      <div className="rs-pct">{(seg.pixel_pct ?? seg.percent ?? seg.pct ?? 0).toFixed?.(1) ?? 0}%</div>
                    </li>
                  ))}
                </ul>

                <div style={{ marginTop: 12 }}>
                  <MetricCard label="Objects Detected" value={results?.objects?.length ?? 0} />
                  <AlertsList alerts={results?.alerts ?? []} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="results-panel">
      <MetricCard label="Emotion" value={results.emotion} confidence={results.emotion_confidence} />
      <MetricCard label="Objects Detected" value={results.objects?.length ?? 0} />
      <AlertsList alerts={results.alerts} />
    </div>
  );
}
