import React, { useCallback, useEffect, useRef, useState } from "react";
import FrameSender from "./FrameSender";

export default function VideoPanel({ onFrame, connected, mode, enableSocketCapture = true, onReady }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [cameraStatus, setCameraStatus] = useState("Loading cameras...");

  const stopCurrentStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const loadDevices = useCallback(async (preferredDeviceId = "") => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameraStatus("Camera selection is not supported in this browser.");
      return;
    }

    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
    setDevices(videoDevices);

    setSelectedDeviceId((currentId) => {
      if (currentId && videoDevices.some((d) => d.deviceId === currentId)) {
        return currentId;
      }
      if (preferredDeviceId && videoDevices.some((d) => d.deviceId === preferredDeviceId)) {
        return preferredDeviceId;
      }
      return videoDevices[0]?.deviceId || "";
    });

    setCameraStatus(
      videoDevices.length
        ? `${videoDevices.length} camera${videoDevices.length === 1 ? "" : "s"} detected`
        : "No cameras detected"
    );
  }, []);

  useEffect(() => {
    loadDevices().catch((err) => {
      console.error(err);
      setCameraStatus("Unable to load cameras");
    });

    const onDeviceChange = () => {
      loadDevices(selectedDeviceId).catch(console.error);
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
      stopCurrentStream();
    };
  }, [loadDevices, selectedDeviceId, stopCurrentStream]);

  useEffect(() => {
    let active = true;

    const startStream = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("Camera access is not supported in this browser.");
        return;
      }

      try {
        setCameraStatus("Starting camera...");

        const constraints = selectedDeviceId
          ? { video: { deviceId: { exact: selectedDeviceId } }, audio: false }
          : { video: true, audio: false };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        stopCurrentStream();
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        onReady?.(videoRef.current);

        const actualDeviceId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
        setCameraStatus("Camera ready");
        await loadDevices(actualDeviceId || selectedDeviceId);
      } catch (err) {
        console.error(err);
        if (active) {
          setCameraStatus("Unable to start selected camera");
        }
      }
    };

    startStream();

    return () => {
      active = false;
      stopCurrentStream();
    };
  }, [loadDevices, onReady, selectedDeviceId, stopCurrentStream]);

  return (
    <div className="video-panel">
      <video ref={videoRef} autoPlay muted playsInline />
      <FrameSender videoRef={videoRef} onFrame={onFrame} active={enableSocketCapture && connected} />
      <div className="video-panel-toolbar">
        {mode === "roadscene" && (
          <div className="video-panel-live-badge">📡 Live road camera</div>
        )}

        <div className="video-panel-camera-picker">
          <label htmlFor="video-camera-select">Camera</label>
          <select
            id="video-camera-select"
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            disabled={devices.length === 0}
          >
            {devices.length === 0 ? (
              <option value="">No cameras found</option>
            ) : (
              devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))
            )}
          </select>
          <button type="button" onClick={() => loadDevices(selectedDeviceId).catch(console.error)}>
            Refresh
          </button>
        </div>

        <div className={`status-dot ${connected ? "connected" : "disconnected"}`}>
          {connected ? "Connected" : "Disconnected"}
        </div>
      </div>
      <div className="video-panel-camera-status">{cameraStatus}</div>
    </div>
  );
}
