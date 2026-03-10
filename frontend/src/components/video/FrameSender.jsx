import { useEffect, useRef } from "react";
import useInterval from "../../hooks/useInterval";

const CAPTURE_INTERVAL_MS = 200; // 5fps
const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 240;

export default function FrameSender({ videoRef, onFrame, active }) {
  const canvasRef = useRef(document.createElement("canvas"));

  useEffect(() => {
    canvasRef.current.width = CANVAS_WIDTH;
    canvasRef.current.height = CANVAS_HEIGHT;
  }, []);

  useInterval(() => {
    if (!active || !videoRef?.current) return;
    const ctx = canvasRef.current.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const base64 = canvasRef.current.toDataURL("image/jpeg", 0.7);
    onFrame && onFrame(base64);
  }, active ? CAPTURE_INTERVAL_MS : null);

  return null;
}
