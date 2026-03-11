import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import RoadSignInstructionPanel from "../../components/common/RoadSignInstruction";
import { buildSpeechAnnouncement } from "../../utils/roadSignInstructions";
import "./Road_sign_ResultsPage.css";

function speakText(text) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const utt    = new SpeechSynthesisUtterance(text);
  utt.lang     = "en-US";
  utt.rate     = 0.92;
  utt.pitch    = 1;
  utt.volume   = 1;
  window.speechSynthesis.speak(utt);
}

const sourceLabel = (type) =>
  type === "webcam" ? "📷 Webcam Capture"
  : type === "video" ? "🎥 Video Frame"
  : "🖼 Uploaded Image";

const statusColor = (s) => {
  if (!s)                                             return "#6366f1";
  if (s === "Normal")                                 return "#22c55e";
  if (s.includes("Damaged") || s.includes("Unclear")) return "#ef4444";
  return "#f59e0b";
};

export default function Road_sign_ResultsPage() {
  const { state } = useLocation();
  const navigate  = useNavigate();

  // ── Speak full announcement when results load ─────────────────────────────
  // useEffect(() => {
  //   if (!state?.class_name) return;
  //   const announcement = buildSpeechAnnouncement(state.class_name);
  //   // Small delay so the page paints first
  //   const t = setTimeout(() => speakText(announcement), 500);
  //   return () => clearTimeout(t);
  // }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) {
    return (
      <div className="dm-root">
        <Sidebar />
        <main className="dm-page-main">
          <div className="rs-empty">
        <span style={{ fontSize: "3rem" }}>🚫</span>
        <p>No results to display.</p>
        <button
          className="rs-back-btn"
          onClick={() => navigate("/road-sign")}
          style={{ padding: "0.55rem 1.4rem", fontSize: "0.95rem" }}
        >
          ← Go Back
        </button>
          </div>
        </main>
      </div>
    );
  }

  const {
    original,
    detected_image,
    crop,
    class_name,
    confidence,
    status,
    input_type,
  } = state;

  return (
    <div className="dm-root">
      <Sidebar />
      <main className="dm-page-main">
      <div className="rs-res-page">
      {/* Header */}
      <div className="rs-res-header">
        <span style={{ fontSize: "1.5rem" }}>🚦</span>
        <h1>Detection Results</h1>
        <button className="rs-back-btn" onClick={() => navigate("/road-sign")}>
          ← Process Another
        </button>
      </div>

      {/* Summary card */}
      <div className="rs-summary-card">
        <div className="rs-summary-title">Detection Summary</div>
        <div className="rs-summary-rows">
          <div className="rs-summary-item">
            <div className="rs-summary-label">Detected Sign</div>
            <div
              className="rs-summary-value"
              style={{ color: "#6366f1", fontSize: "1.05rem" }}
            >
              {class_name?.replace(/_/g, " ") ?? "—"}
            </div>
          </div>

          <div className="rs-summary-item">
            <div className="rs-summary-label">Confidence</div>
            <div className="rs-summary-value" style={{ color: "#22c55e" }}>
              {confidence ?? "—"}
            </div>
          </div>

          {status && (
            <div className="rs-summary-item">
              <div className="rs-summary-label">Sign Status</div>
              <div
                className="rs-summary-value"
                style={{ color: statusColor(status) }}
              >
                {status}
              </div>
            </div>
          )}

          <div className="rs-summary-item">
            <div className="rs-summary-label">Source</div>
            <div
              className="rs-summary-value"
              style={{ color: "var(--color-text-muted)", fontSize: "0.88rem" }}
            >
              {sourceLabel(input_type)}
            </div>
          </div>
        </div>
      </div>

      {/* Instruction panel */}
      <RoadSignInstructionPanel className={class_name} />

      {/* Three image panels */}
      <div className="rs-images-grid">
        <div className="rs-img-card">
          <div className="rs-img-label">Original</div>
          <img src={original} alt="Original" className="rs-result-img" />
        </div>

        <div className="rs-img-card">
          <div className="rs-img-label">Detected (bbox)</div>
          <img src={detected_image} alt="Detected with bounding box" className="rs-result-img" />
        </div>

        <div className="rs-img-card">
          <div className="rs-img-label">Cropped Sign</div>
          <img src={crop} alt="Cropped sign" className="rs-result-img" />
        </div>
      </div>
    </div>
      </main>
    </div>
  );
}
