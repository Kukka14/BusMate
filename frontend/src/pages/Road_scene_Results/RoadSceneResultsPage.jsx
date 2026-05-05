import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import "./RoadSceneResultsPage.css";

const hazardColor = (level) =>
  level === "High" ? "#ef4444" : level === "Medium" ? "#f59e0b" : "#22c55e";

export default function RoadSceneResultsPage() {
  const { state } = useLocation();
  const navigate  = useNavigate();

  return (
    <div className="dd-root">
      <Sidebar activeKey="roadscene" />
      <main className="rsa-res-main">
        {!state ? (
          <div className="rsa-res-empty">
            <span style={{ fontSize: "3rem" }}>🚫</span>
            <p>No results to display.</p>
            <button className="rsa-res-back-btn" onClick={() => navigate("/road-scene")}>
              ← Go Back
            </button>
          </div>
        ) : (
          (() => {
            const { original, overlay, segments, hazard } = state;
            const hColor = hazardColor(hazard.level);
            return (
              <div className="rsa-res-page">

                {/* Header */}
                <div className="rsa-res-header">
                  <span style={{ fontSize: "1.5rem" }}>🛣</span>
                  <h1>Scene Analysis Results</h1>
                  <button className="rsa-res-back-btn" onClick={() => navigate("/road-scene")}>
                    ← Analyse Another
                  </button>
                </div>

                {/* Hazard Assessment card */}
                <div className="rsa-hazard-card" style={{ borderColor: hColor }}>
                  <div className="rsa-hazard-top">
                    <span className="rsa-hazard-title">⚠ Hazard Assessment</span>
                    <span className="rsa-hazard-level" style={{ color: hColor }}>
                      {hazard.level}
                    </span>
                  </div>

                  <div className="rsa-score-row">
                    <span className="rsa-score-label">Score</span>
                    <span className="rsa-score-num" style={{ color: hColor }}>
                      {hazard.score.toFixed(1)}
                      <span className="rsa-score-max"> / 100</span>
                    </span>
                  </div>

                  <div className="rsa-bar-bg">
                    <div
                      className="rsa-bar-fill"
                      style={{ width: `${Math.min(hazard.score, 100)}%`, background: hColor }}
                    />
                  </div>

                  <div className="rsa-breakdown">
                    {[
                      { label: "Person",      value: hazard.breakdown.person_pct },
                      { label: "Two-wheeler", value: hazard.breakdown.twowheeler_pct },
                      { label: "Vehicle",     value: hazard.breakdown.vehicle_pct },
                      { label: "Pothole",     value: hazard.breakdown.pothole_pct },
                    ].map(({ label, value }) => (
                      <div key={label} className="rsa-breakdown-chip">
                        <span className="rsa-chip-label">{label}</span>
                        <span className="rsa-chip-val">{value.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Image comparison */}
                <div className="rsa-img-grid">
                  <div className="rsa-img-card">
                    <div className="rsa-img-label">Original Image</div>
                    <img src={original} alt="Original road scene" className="rsa-result-img" />
                  </div>
                  <div className="rsa-img-card">
                    <div className="rsa-img-label">Segmentation Overlay</div>
                    <img src={overlay} alt="Segmentation overlay" className="rsa-result-img" />
                  </div>
                </div>

                {/* Scene breakdown */}
                <div className="rsa-segments-card">
                  <div className="rsa-segments-title">Scene Breakdown</div>
                  <div className="rsa-segments-grid">
                    {segments.map((seg) => (
                      <div key={seg.id} className="rsa-seg-row">
                        <span className="rsa-seg-dot" style={{ background: seg.color }} />
                        <span className="rsa-seg-name">{seg.label}</span>
                        <span className="rsa-seg-pct">{seg.pixel_pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            );
          })()
        )}
      </main>
    </div>
  );
}
