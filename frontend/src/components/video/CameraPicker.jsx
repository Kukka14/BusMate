import React, { useState } from "react";

export default function CameraPicker({ onSelect }) {
  const [devices, setDevices] = useState([]);

  const loadDevices = async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((d) => d.kind === "videoinput"));
  };

  return (
    <div className="camera-picker">
      <button onClick={loadDevices}>Refresh Cameras</button>
      <select onChange={(e) => onSelect && onSelect(e.target.value)}>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || d.deviceId}
          </option>
        ))}
      </select>
    </div>
  );
}
