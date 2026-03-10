import React from "react";
import Badge from "./Badge";
import ProgressBar from "./ProgressBar";

export default function MetricCard({ label, value, confidence }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <Badge text={String(value ?? "—")} />
      {confidence !== undefined && (
        <ProgressBar value={Math.round(confidence * 100)} />
      )}
    </div>
  );
}
