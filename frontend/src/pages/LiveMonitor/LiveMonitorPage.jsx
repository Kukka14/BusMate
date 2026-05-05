import React from "react";
import { useLocation } from "react-router-dom";
import PageShell from "../../app/layout/PageShell";
import VideoPanel from "../../components/video/VideoPanel";
import ResultsPanel from "../../components/results/ResultsPanel";
import { useSocket } from "../../services/socket/useSocket";
import "./LiveMonitor.css";

export default function LiveMonitorPage() {
  const { results, connected, sendFrame } = useSocket();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const module = params.get("module") || null; // e.g. 'roadscene'

  // ── Road Scene live data mapping (mirroring ActiveShiftPage logic) ───
  const liveSceneFrame = results?.overlay || results?.breakdown
    ? {
        overlay: results.overlay,
        hazard: results.hazard_score ?? results.hazard ?? null,
        segments: results.breakdown || results.segments || [],
      }
    : null;

  return (
    <PageShell title="Live Monitor">
      <div className="live-monitor-layout">
        <VideoPanel onFrame={sendFrame} connected={connected} mode={module} />
        <ResultsPanel results={results} mode={module} sceneFrame={liveSceneFrame} />
      </div>
    </PageShell>
  );
}
