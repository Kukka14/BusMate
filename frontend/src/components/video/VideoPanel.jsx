import React, { useRef, useEffect } from "react";
import FrameSender from "./FrameSender";

export default function VideoPanel({ onFrame, connected, mode }) {
  const videoRef = useRef(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(console.error);
  }, []);

  return (
    <div className="video-panel">
      <video ref={videoRef} autoPlay muted playsInline />
      <FrameSender videoRef={videoRef} onFrame={onFrame} active={connected} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {mode === "roadscene" && (
          <div style={{
            padding: "6px 10px",
            background: "rgba(21,128,61,0.12)",
            color: "#16a34a",
            borderRadius: 18,
            fontSize: 13,
            border: "1px solid rgba(21,128,61,0.18)"
          }}>📡 Live road camera</div>
        )}
        <div className={`status-dot ${connected ? "connected" : "disconnected"}`}>
          {connected ? "Connected" : "Disconnected"}
        </div>
      </div>
    </div>
  );
}
