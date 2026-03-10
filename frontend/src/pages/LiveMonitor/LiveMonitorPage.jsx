import React from "react";
import PageShell from "../../app/layout/PageShell";
import VideoPanel from "../../components/video/VideoPanel";
import ResultsPanel from "../../components/results/ResultsPanel";
import { useSocket } from "../../services/socket/useSocket";
import "./LiveMonitor.css";

export default function LiveMonitorPage() {
  const { results, connected, sendFrame } = useSocket();

  return (
    <PageShell title="Live Monitor">
      <div className="live-monitor-layout">
        <VideoPanel onFrame={sendFrame} connected={connected} />
        <ResultsPanel results={results} />
      </div>
    </PageShell>
  );
}
