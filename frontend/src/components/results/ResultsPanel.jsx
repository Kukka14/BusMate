import React from "react";
import MetricCard from "./MetricCard";
import AlertsList from "./AlertsList";

export default function ResultsPanel({ results }) {
  if (!results) {
    return <div className="results-panel empty">Waiting for data…</div>;
  }

  return (
    <div className="results-panel">
      <MetricCard label="Emotion" value={results.emotion} confidence={results.emotion_confidence} />
      <MetricCard label="Objects Detected" value={results.objects?.length ?? 0} />
      <AlertsList alerts={results.alerts} />
    </div>
  );
}
