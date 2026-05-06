import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Sidebar from "../../components/common/Sidebar";
import "./RoadSceneFusionPage.css";

const START_POINTS = ["Colombo", "Kandy", "Galle", "Kurunegala", "Negombo", "Jaffna", "Matara", "Ratnapura"];
const END_POINTS = ["Galle", "Kandy", "Colombo", "Badulla", "Batticaloa", "Trincomalee", "Anuradhapura", "Nuwara Eliya"];

const CAMERA_PROFILES = [
  { id: "front-day", label: "Front Dashcam - Day", sceneBoost: 12, mapBoost: 3, vru: 0.18, traffic: 0.16, speed: 0.12 },
  { id: "front-night", label: "Front Dashcam - Night", sceneBoost: 24, mapBoost: 6, vru: 0.30, traffic: 0.20, speed: 0.28 },
  { id: "side-rain", label: "Side Camera - Rain", sceneBoost: 18, mapBoost: 4, vru: 0.22, traffic: 0.14, speed: 0.18 },
  { id: "dense-traffic", label: "Dense Traffic View", sceneBoost: 30, mapBoost: 8, vru: 0.35, traffic: 0.34, speed: 0.22 },
  { id: "rural-road", label: "Rural Road Camera", sceneBoost: 9, mapBoost: 14, vru: 0.10, traffic: 0.08, speed: 0.16 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function levelFromScore(score) {
  if (score >= 80) return { label: "Critical", tone: "critical" };
  if (score >= 60) return { label: "High", tone: "high" };
  if (score >= 35) return { label: "Medium", tone: "medium" };
  return { label: "Low", tone: "low" };
}

function scoreFromRoute(start, end, camera) {
  const routeHash = hashText(`${start}:${end}`);
  const base = 18 + (routeHash % 42);
  const terrain = 6 + ((routeHash >> 3) % 18);
  const traffic = 5 + ((routeHash >> 6) % 16);
  const visibility = camera.sceneBoost;
  const mapPenalty = camera.mapBoost;

  const mapRisk = clamp(base + terrain + traffic + mapPenalty, 0, 100);
  const sceneRisk = clamp(visibility + ((routeHash >> 2) % 24) + ((routeHash >> 5) % 18), 0, 100);
  const fusionSeed = Math.round(sceneRisk * 0.55 + mapRisk * 0.45 + 6);

  return {
    mapRisk,
    sceneRisk,
    fusionSeed: clamp(fusionSeed, 0, 100),
    slope: clamp(3 + (routeHash % 14) + camera.mapBoost * 0.5, 0, 24),
    curvature: clamp(((routeHash >> 4) % 33) / 100, 0.02, 0.42),
    vru: clamp(0.1 + camera.vru + ((routeHash >> 7) % 12) / 100, 0, 1),
    trafficConflict: clamp(0.12 + camera.traffic + ((routeHash >> 9) % 14) / 100, 0, 1),
    speedRisk: clamp(0.14 + camera.speed + ((routeHash >> 11) % 16) / 100, 0, 1),
  };
}

function featurePayloadFromScores(scores) {
  const vru = clamp(Math.round(scores.vru * 100), 0, 100);
  const sideWalkDef = clamp(Math.round(scores.mapRisk * 0.65), 0, 100);
  const guidanceSupport = clamp(100 - Math.round(scores.mapRisk * 0.55), 0, 100);
  const surfaceDamage = clamp(Math.round(scores.mapRisk * 0.72), 0, 100);
  const trafficConflict = clamp(Math.round(scores.trafficConflict * 100), 0, 100);
  const downgradeSeverity = clamp(Math.round(scores.slope * 4.2), 0, 100);
  const curveSeverity = clamp(Math.round(scores.curvature * 220), 0, 100);
  const comboSeverity = clamp(Math.round((scores.sceneRisk + scores.mapRisk) / 2), 0, 100);
  const speedRisk = clamp(Math.round(scores.speedRisk * 100), 0, 100);

  return {
    VRU: vru,
    SidewalkDef: sideWalkDef,
    GuidanceSupport: guidanceSupport,
    SurfaceDamage: surfaceDamage,
    TrafficConflict: trafficConflict,
    DowngradeSeverity: downgradeSeverity,
    CurveSeverity: curveSeverity,
    ComboSeverity: comboSeverity,
    SpeedRisk: speedRisk,
  };
}

// Generate mock route path for animated map
function generateRoutePath(start, end) {
  const routeHash = hashText(`${start}:${end}`);
  const startLat = 6.9 + (routeHash % 100) / 500;
  const startLon = 79.9 + ((routeHash >> 5) % 100) / 500;
  const endLat = 6.8 + ((routeHash >> 10) % 100) / 500;
  const endLon = 80.1 + ((routeHash >> 15) % 100) / 500;

  const points = [];
  const steps = 50;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      lat: startLat + (endLat - startLat) * t,
      lon: startLon + (endLon - startLon) * t,
      distance: (i / steps) * 45000,
      risk: 25 + Math.sin(t * Math.PI) * 20 + (routeHash >> i) % 10,
      risk_label: t < 0.3 ? "Low Risk" : t < 0.6 ? "Medium Risk" : "High Risk",
      color: t < 0.3 ? "green" : t < 0.6 ? "#f59e0b" : "orange",
      slope: 3 + (routeHash >> (i * 2)) % 8,
      curvature: 0.1 + ((routeHash >> (i * 3)) % 20) / 100,
      road_name: `Route ${start} to ${end}`,
      road_class: i < steps / 3 ? "primary" : i < (2 * steps) / 3 ? "secondary" : "tertiary",
    });
  }
  return points;
}

// Animated Map Component
function AnimatedMapViewer({ pathData }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapInstance.current = L.map(mapRef.current).setView([7.0, 80.0], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(mapInstance.current);
  }, []);

  useEffect(() => {
    if (!mapInstance.current || !pathData || pathData.length === 0) return;

    mapInstance.current.eachLayer((layer) => {
      if (layer instanceof L.Polyline || layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        mapInstance.current.removeLayer(layer);
      }
    });

    const coords = pathData.map((p) => [p.lat, p.lon]);
    for (let i = 0; i < coords.length - 1; i++) {
      L.polyline([coords[i], coords[i + 1]], {
        color: pathData[i].color || "green",
        weight: 4,
        opacity: 0.8,
      }).addTo(mapInstance.current);
    }

    L.circleMarker(coords[0], { radius: 10, color: "#0b5fff", fillColor: "#0b5fff", opacity: 0.9, weight: 2 })
      .bindPopup("START").addTo(mapInstance.current);
    L.circleMarker(coords[coords.length - 1], { radius: 10, color: "red", fillColor: "red", opacity: 0.8, weight: 2 })
      .bindPopup("END").addTo(mapInstance.current);

    markerRef.current = L.marker(coords[0], {
      icon: L.divIcon({ className: "fusion-vehicle-icon", iconSize: [18, 18], iconAnchor: [9, 9] }),
    }).addTo(mapInstance.current);

    mapInstance.current.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
  }, [pathData]);

  useEffect(() => {
    if (!isPlaying || !pathData) return;
    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % pathData.length);
    }, 200);
    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, pathData]);

  useEffect(() => {
    if (!pathData || pathData.length === 0) return;
    const pt = pathData[currentIndex];
    if (markerRef.current) {
      markerRef.current.setLatLng([pt.lat, pt.lon]);
    }
  }, [currentIndex, pathData]);

  return (
    <div className="fusion-map-section">
      <div className="fusion-map-controls">
        <button onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
        <span className="fusion-map-progress">{currentIndex} / {pathData?.length || 0}</span>
      </div>
      <div ref={mapRef} className="fusion-map" />
      <style>{`
        .fusion-vehicle-icon {
          width: 18px; height: 18px; background: #0b5fff; border-radius: 50%;
          border: 2px solid white; box-shadow: 0 0 6px rgba(11,95,255,.6);
        }
      `}</style>
    </div>
  );
}

// Main Page
export default function RoadSceneFusionPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [startLocation, setStartLocation] = useState(START_POINTS[0]);
  const [endLocation, setEndLocation] = useState(END_POINTS[0]);
  const [cameraId, setCameraId] = useState(CAMERA_PROFILES[0].id);
  const [cameraActive, setCameraActive] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [pathData, setPathData] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);

  const camera = useMemo(
    () => CAMERA_PROFILES.find((item) => item.id === cameraId) || CAMERA_PROFILES[0],
    [cameraId]
  );

  // Start live camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      setError("Could not access camera. Check permissions.");
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      setCameraActive(false);
    }
  };

  // Capture frame
  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    setCapturedImage(canvasRef.current.toDataURL("image/jpeg"));
  };

  // Run fusion analysis
  const runFusion = async () => {
    setError("");
    setRunning(true);

    try {
      const scores = scoreFromRoute(startLocation, endLocation, camera);
      const features = featurePayloadFromScores(scores);
      const requestBody = {
        ...features,
        SceneRiskScore: Number(scores.sceneRisk.toFixed(2)),
        MapRiskScore: Number(scores.mapRisk.toFixed(2)),
      };

      let fused = {
        FinalRiskScore: Number(((scores.sceneRisk * 0.56 + scores.mapRisk * 0.44) / 100).toFixed(4)),
        RiskLevel: levelFromScore(scores.fusionSeed).label,
        Confidence: 0.61,
        Source: "local-preview",
      };

      try {
        const response = await fetch("/api/fusion/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();
        if (response.ok && data?.success && data?.result) {
          fused = {
            ...data.result,
            Source: "backend-model",
          };
        }
      } catch {
        // Keep local preview if backend unavailable
      }

      const finalScore = typeof fused.FinalRiskScore === "number"
        ? fused.FinalRiskScore * 100
        : clamp(scores.fusionSeed, 0, 100);
      const level = levelFromScore(finalScore);

      // Generate route path for map
      const routePath = generateRoutePath(startLocation, endLocation);
      setPathData(routePath);

      setResult({
        startLocation,
        endLocation,
        camera,
        sceneScore: Number(scores.sceneRisk.toFixed(1)),
        mapScore: Number(scores.mapRisk.toFixed(1)),
        finalScore: Number(finalScore.toFixed(1)),
        finalRiskLevel: fused.RiskLevel || level.label,
        confidence: fused.Confidence ?? Number((0.6 + (finalScore / 400)).toFixed(2)),
        source: fused.Source,
        features,
        routeSummary: {
          slope: scores.slope,
          curvature: scores.curvature,
          vru: scores.vru,
          trafficConflict: scores.trafficConflict,
          speedRisk: scores.speedRisk,
        },
      });
    } catch {
      setError("Fusion run failed. Check the backend or try a different route.");
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const sceneLevel = result ? levelFromScore(result.sceneScore) : null;
  const mapLevel = result ? levelFromScore(result.mapScore) : null;
  const finalLevel = result ? levelFromScore(result.finalScore) : null;

  return (
    <div className="dd-root">
      <Sidebar activeKey="roadscene" />
      <main className="fusion-main">
        <div className="fusion-shell">
          {/* Hero Section */}
          <section className="fusion-hero">
            <div>
              <div className="fusion-eyebrow">Road Scene + Route Risk Fusion</div>
              <h1>Fusion Neural Network</h1>
              <p>Combine live scene analysis with route risk to get a comprehensive safety assessment.</p>
            </div>
          </section>

          {/* Live Camera & Controls */}
          <section className="fusion-camera-panel">
            <div className="fusion-camera-container">
              <video ref={videoRef} autoPlay playsInline className="fusion-video-stream" />
              <canvas ref={canvasRef} style={{ display: "none" }} />
              <div className="fusion-camera-overlay">
                {!cameraActive && <span>Camera Off</span>}
                {capturedImage && <span className="fusion-captured">✓ Frame Captured</span>}
              </div>
            </div>

            <div className="fusion-camera-controls">
              {!cameraActive ? (
                <button className="fusion-btn-primary" onClick={startCamera}>
                  📷 Start Webcam
                </button>
              ) : (
                <>
                  <button className="fusion-btn-danger" onClick={stopCamera}>
                    ⏹ Stop Camera
                  </button>
                  <button className="fusion-btn-secondary" onClick={captureFrame}>
                    📸 Capture Frame
                  </button>
                </>
              )}
            </div>
          </section>

          {/* Input Form */}
          <section className="fusion-panel">
            <div className="fusion-step-grid">
              <label className="fusion-field">
                <span>Route Start</span>
                <select value={startLocation} onChange={(e) => setStartLocation(e.target.value)}>
                  {START_POINTS.map((point) => (
                    <option key={point} value={point}>{point}</option>
                  ))}
                </select>
              </label>

              <label className="fusion-field">
                <span>Route End</span>
                <select value={endLocation} onChange={(e) => setEndLocation(e.target.value)}>
                  {END_POINTS.map((point) => (
                    <option key={point} value={point}>{point}</option>
                  ))}
                </select>
              </label>

              <label className="fusion-field">
                <span>Camera Profile</span>
                <select value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
                  {CAMERA_PROFILES.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.label}</option>
                  ))}
                </select>
              </label>

              <div className="fusion-action-wrap">
                <button className="fusion-action" type="button" onClick={runFusion} disabled={running}>
                  {running ? "Running..." : "🚀 Start Shift"}
                </button>
              </div>
            </div>

            {error && <div className="fusion-error">{error}</div>}
          </section>

          {/* Animated Map */}
          {pathData && (
            <section className="fusion-map-wrapper">
              <h3>Route Animation</h3>
              <AnimatedMapViewer pathData={pathData} />
            </section>
          )}

          {/* Results Cards */}
          {result ? (
            <section className="fusion-results">
              <article className={`fusion-card fusion-tone-${sceneLevel.tone}`}>
                <span className="fusion-card-label">Scene Risk Score</span>
                <span className="fusion-card-badge">{sceneLevel.label}</span>
                <div className="fusion-score">{result.sceneScore.toFixed(1)}</div>
                <div className="fusion-subtext">Camera: {result.camera.label}</div>
                <div className="fusion-meter">
                  <span style={{ width: `${Math.min(result.sceneScore, 100)}%` }} />
                </div>
              </article>

              <article className={`fusion-card fusion-tone-${mapLevel.tone}`}>
                <span className="fusion-card-label">Map Risk Score</span>
                <span className="fusion-card-badge">{mapLevel.label}</span>
                <div className="fusion-score">{result.mapScore.toFixed(1)}</div>
                <div className="fusion-subtext">{result.startLocation} → {result.endLocation}</div>
                <div className="fusion-meter">
                  <span style={{ width: `${Math.min(result.mapScore, 100)}%` }} />
                </div>
              </article>

              <article className={`fusion-card fusion-card-final fusion-tone-${finalLevel.tone}`}>
                <span className="fusion-card-label">Fusion Neural Network</span>
                <span className="fusion-card-badge">{result.finalRiskLevel}</span>
                <div className="fusion-score fusion-score-final">{result.finalScore.toFixed(1)}</div>
                <div className="fusion-subtext">{result.source === "backend-model" ? "Backend" : "Local"}</div>
                <div className="fusion-confidence">Confidence {Number(result.confidence).toFixed(2)}</div>
                <div className="fusion-feature-grid">
                  {Object.entries(result.features).map(([key, value]) => (
                    <div key={key} className="fusion-feature-pill">
                      <span>{key}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          ) : (
            <section className="fusion-empty">
              Select route and camera, capture a frame, then start shift to see results.
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
