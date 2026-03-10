import React, { useRef, useEffect } from "react";
import FrameSender from "./FrameSender";

export default function VideoPanel({ onFrame, connected }) {
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
      <div className={`status-dot ${connected ? "connected" : "disconnected"}`}>
        {connected ? "Connected" : "Disconnected"}
      </div>
    </div>
  );
}
