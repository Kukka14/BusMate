import React from "react";

export default function AlertsList({ alerts = [] }) {
  if (!alerts?.length) return null;
  return (
    <div className="alerts-list">
      <strong>Alerts</strong>
      <ul>
        {alerts.map((a, i) => (
          <li key={i} className="alert-item">{a}</li>
        ))}
      </ul>
    </div>
  );
}
