import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar";
import "./Road_sign_VideoResultsPage.css";

// ── Beep helper (no speech) ───────────────────────────────────────────────────
function playBeep(freq = 880, duration = 0.25, vol = 0.4) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

// ── Status helpers ────────────────────────────────────────────────────────────
const statusColor = (s) => {
  if (!s) return "#6366f1";
  if (s === "Normal") return "#22c55e";
  if (s.includes("Damaged") || s.includes("Unclear")) return "#ef4444";
  return "#f59e0b";
};

function parseConf(c) {
  if (typeof c === "number") return c;
  return parseFloat(String(c).replace("%", "")) / 100 || 0;
}

export default function Road_sign_VideoResultsPage() {
  const { state } = useLocation();
  const navigate = useNavigate();

  // ── Beep once when results load ─────────────────────────────────────────
  useEffect(() => {
    if (state?.results?.length) {
      // Double beep: first note then second for "ding-ding" feel
      playBeep(880, 0.18, 0.38);
      setTimeout(() => playBeep(1100, 0.18, 0.3), 220);
    }
  }, []);

  // ── Compute summary from all results ────────────────────────────────────
  const summary = useMemo(() => {
    if (!state?.results?.length) return null;
    const { results } = state;

    // Most-frequent sign
    const freq = {};
    results.forEach((r) => {
      freq[r.class_name] = (freq[r.class_name] || 0) + 1;
    });
    const topSign = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];

    // Highest-confidence detection
    const best = results.reduce((a, b) =>
      parseConf(a.confidence) >= parseConf(b.confidence) ? a : b
    );

    const normalCount = results.filter((r) => r.status === "Normal").length;
    const damagedCount = results.filter((r) => r.status !== "Normal").length;
    const avgConf =
      results.reduce((s, r) => s + parseConf(r.confidence), 0) / results.length;

    return { topSign, best, normalCount, damagedCount, avgConf };
  }, [state]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!state?.results) {
    return (
      <div className="dm-root">
        <Sidebar />
        <main className="dm-page-main">
          <div className="rvr-empty">
        <span style={{ fontSize: "3rem" }}>🚫</span>
        <p>No results to display.</p>
        <button className="rvr-back-btn" onClick={() => navigate("/road-sign")}>
          ← Go Back
        </button>
          </div>
        </main>
      </div>
    );
  }

  const { results } = state;

  return (
    <div className="dm-root">
      <Sidebar />
      <main className="dm-page-main">
      <div className="rvr-page">
      {/* ── Page header ── */}
      <div className="rvr-header">
        <span className="rvr-header-icon">🎥</span>
        <div className="rvr-header-text">
          <h1>Video Detection Results</h1>
          <p>
            {results.length} frame{results.length !== 1 ? "s" : ""} with road
            sign detections
          </p>
        </div>
        <button className="rvr-back-btn" onClick={() => navigate("/road-sign")}>
          ← Process Another
        </button>
      </div>

      {/* ── Summary hero card ── */}
      {summary && (
        <div className="rvr-summary-card">
          {/* Big sign name */}
          <div className="rvr-summary-hero">
            <div className="rvr-summary-icon">🚦</div>
            <div className="rvr-summary-main">
              <span className="rvr-summary-label">Most Detected Sign</span>
              <span className="rvr-summary-name">
                {summary.topSign.replace(/_/g, " ")}
              </span>
            </div>
            {/* Confidence bar for best detection */}
            <div className="rvr-summary-conf-block">
              <span className="rvr-summary-conf-label">Best Confidence</span>
              <div className="rvr-conf-bar-wrap">
                <div
                  className="rvr-conf-bar"
                  style={{
                    width: `${(parseConf(summary.best.confidence) * 100).toFixed(
                      1
                    )}%`,
                    background: statusColor(summary.best.status),
                  }}
                />
              </div>
              <span
                className="rvr-conf-pct"
                style={{ color: statusColor(summary.best.status) }}
              >
                {(parseConf(summary.best.confidence) * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Stat pills */}
          <div className="rvr-stat-row">
            {[
              ["Frames Analysed", results.length, "#6366f1"],
              ["Avg Confidence", `${(summary.avgConf * 100).toFixed(1)}%`, "#f59e0b"],
              ["Normal Signs", summary.normalCount, "#22c55e"],
              ["Damaged / Unclear", summary.damagedCount, "#ef4444"],
            ].map(([lbl, val, clr]) => (
              <div key={lbl} className="rvr-stat">
                <span className="rvr-stat-val" style={{ color: clr }}>
                  {val}
                </span>
                <span className="rvr-stat-lbl">{lbl}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Frame cards ── */}
      <div className="rvr-frame-list">
        {results.map((r, i) => (
          <div key={i} className="rvr-frame-card">
            {/* Frame header */}
            <div className="rvr-frame-header">
              <span className="rvr-frame-badge">Frame #{r.frame}</span>
              <span className="rvr-frame-class">
                {r.class_name?.replace(/_/g, " ") ?? "—"}
              </span>
              <span
                className="rvr-frame-conf"
                style={{ color: statusColor(r.status) }}
              >
                {(parseConf(r.confidence) * 100).toFixed(1)}%
              </span>
              {r.status && (
                <span
                  className="rvr-frame-status"
                  style={{ color: statusColor(r.status) }}
                >
                  {r.status}
                </span>
              )}

              {/* Mini confidence bar */}
              <div className="rvr-frame-bar-wrap">
                <div
                  className="rvr-frame-bar"
                  style={{
                    width: `${(parseConf(r.confidence) * 100).toFixed(1)}%`,
                    background: statusColor(r.status),
                  }}
                />
              </div>
            </div>

            {/* Three image panels */}
            <div className="rvr-frame-images">
              {[
                ["Original", r.original],
                ["Detected (bbox)", r.detected_image],
                ["Cropped Sign", r.crop],
              ].map(([label, src]) => (
                <div key={label} className="rvr-frame-img-panel">
                  <div className="rvr-frame-img-label">{label}</div>
                  <img
                    src={src}
                    alt={`${label} — frame ${r.frame}`}
                    className="rvr-frame-img"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
      </main>
    </div>
  );
}