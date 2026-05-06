import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import PageShell from "../../app/layout/PageShell";
import Sidebar from "../../components/common/Sidebar";
import VideoPanel from "../../components/video/VideoPanel";
import ResultsPanel from "../../components/results/ResultsPanel";
import { useSocket } from "../../services/socket/useSocket";
import "./LiveMonitor.css";

export default function LiveMonitorPage() {
  const { results, connected, sendFrame } = useSocket();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const module = params.get("module") || null; // e.g. 'roadscene'
  const isRoadScene = module === "roadscene";
  const [roadSceneResults, setRoadSceneResults] = useState(null);
  const [roadSceneVideo, setRoadSceneVideo] = useState(null);
  const roadSceneCanvasRef = useRef(document.createElement("canvas"));

  useEffect(() => {
    if (!isRoadScene || !roadSceneVideo) return undefined;

    let inFlight = false;
    const canvas = roadSceneCanvasRef.current;
    canvas.width = 640;
    canvas.height = 480;

    const sendRoadSceneFrame = async () => {
      if (inFlight || !roadSceneVideo || roadSceneVideo.readyState < 2) return;
      inFlight = true;

      try {
        const ctx = canvas.getContext("2d");
        ctx.drawImage(roadSceneVideo, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
        if (!blob) return;

        const form = new FormData();
        form.append("file", blob, "frame.jpg");

        const response = await fetch("/rsa/analyse", { method: "POST", body: form });
        const data = await response.json();

        if (data && !data.error) {
          console.log("RSA Response - Hazard:", data.hazard);
          setRoadSceneResults({
            scene_latest: {
              original: data.original,
              overlay: data.overlay,
              segments: data.segments || [],
                hazard: data.hazard ? { score: data.hazard.score ?? 0, level: data.hazard.level ?? "Low" } : { score: 0, level: "Low" },
            },
          });
        }
      } catch (error) {
        console.error(error);
      } finally {
        inFlight = false;
      }
    };

    sendRoadSceneFrame();
    const intervalId = window.setInterval(sendRoadSceneFrame, 1500);
    return () => window.clearInterval(intervalId);
  }, [isRoadScene, roadSceneVideo]);

  const liveSceneFrame = isRoadScene
    ? (roadSceneResults?.scene_latest
      ? {
          overlay: roadSceneResults.scene_latest.overlay || roadSceneResults.scene_latest.original,
          hazard: roadSceneResults.scene_latest.hazard ? { 
            score: roadSceneResults.scene_latest.hazard.score ?? 0, 
            level: roadSceneResults.scene_latest.hazard.level ?? "Low" 
          } : { score: 0, level: "Low" },
          segments: roadSceneResults.scene_latest.segments || [],
        }
      : null)
    : (results?.overlay || results?.breakdown
      ? {
          overlay: results.overlay,
          hazard: results.hazard_score ?? results.hazard ?? null,
          segments: results.breakdown || results.segments || [],
        }
      : null);

  return (
    <div className="dd-root">
      <Sidebar activeKey="monitor" />
      <main className="dd-page-main">
        <PageShell title={isRoadScene ? "Road Scene Live" : "Live Monitor"}>
          {isRoadScene ? (
            <div className="live-monitor-layout live-monitor-roadscene-unified">
              <section className="live-monitor-card live-monitor-unified-card">
                <div className="live-monitor-card-head">
                  <div>
                    <div className="live-monitor-card-title">Live Road Camera & Analysis</div>
                    <div className="live-monitor-card-subtitle">Real-time road scene segmentation</div>
                  </div>
                  <div className="live-monitor-pill is-connected">
                    Analyzing
                  </div>
                </div>

                <div className="live-monitor-unified-content">
                  <div className="live-monitor-camera-section">
                    <VideoPanel
                      mode={module}
                      connected={true}
                      enableSocketCapture={false}
                      onReady={setRoadSceneVideo}
                    />
                  </div>
                  
                  <div className="live-monitor-analysis-section">
                    {liveSceneFrame?.overlay && (
                      <div className="overlay-wrapper">
                        <img src={liveSceneFrame.overlay} alt="RSA overlay" className="overlay-image" />
                        <div className="overlay-badge-live">● Live road camera</div>
                        <div className="overlay-badge-hazard" style={{
                          color: liveSceneFrame.hazard?.level === "High" ? "#ef4444" : 
                                 liveSceneFrame.hazard?.level === "Medium" ? "#f59e0b" : "#22c55e",
                          borderColor: liveSceneFrame.hazard?.level === "High" ? "#ef4444" : 
                                       liveSceneFrame.hazard?.level === "Medium" ? "#f59e0b" : "#22c55e"
                        }}>
                          Risk: {liveSceneFrame.hazard?.score !== undefined ? liveSceneFrame.hazard.score.toFixed(1) : "0.0"} — {liveSceneFrame.hazard?.level || "Low"}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="live-monitor-detects-section">
                    {liveSceneFrame?.segments && liveSceneFrame.segments.length > 0 && (
                      <div className="live-monitor-detects">
                        <div className="live-monitor-detects-title">Detects</div>
                        <ul className="live-monitor-detects-list">
                          {liveSceneFrame.segments.slice(0, 8).map((seg, i) => (
                            <li key={i} className="live-monitor-detect-item">
                              <div className="detect-label">
                                <span className="detect-swatch" style={{ background: seg.color || "#999" }} />
                                <span>{seg.label || seg.name || `Class ${seg.id ?? i}`}</span>
                              </div>
                              <div className="detect-pct">{(seg.pixel_pct ?? 0).toFixed(1)}%</div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="live-monitor-layout">
              <VideoPanel onFrame={sendFrame} connected={connected} mode={module} />
              <ResultsPanel results={results} mode={module} sceneFrame={liveSceneFrame} />
            </div>
          )}
        </PageShell>
      </main>
    </div>
  );
}
