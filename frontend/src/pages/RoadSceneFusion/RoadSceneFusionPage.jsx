import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Sidebar from "../../components/common/Sidebar";
import "./RoadSceneFusionPage.css";

const START_POINTS = ["Colombo", "Kandy", "Galle", "Kurunegala", "Negombo", "Jaffna", "Matara", "Ratnapura", "Malabe", "Athurugiriya"];
const END_POINTS   = ["Galle", "Kandy", "Colombo", "Badulla", "Batticaloa", "Trincomalee", "Anuradhapura", "Nuwara Eliya", "Athurugiriya", "Malabe"];

const CAMERA_PROFILES = [
  { id: "front-day",     label: "Front Dashcam - Day",   sceneBoost: 12, mapBoost: 3,  vru: 0.18, traffic: 0.16, speed: 0.12 },
  { id: "front-night",   label: "Front Dashcam - Night", sceneBoost: 24, mapBoost: 6,  vru: 0.30, traffic: 0.20, speed: 0.28 },
  { id: "side-rain",     label: "Side Camera - Rain",    sceneBoost: 18, mapBoost: 4,  vru: 0.22, traffic: 0.14, speed: 0.18 },
  { id: "dense-traffic", label: "Dense Traffic View",    sceneBoost: 30, mapBoost: 8,  vru: 0.35, traffic: 0.34, speed: 0.22 },
  { id: "rural-road",    label: "Rural Road Camera",     sceneBoost: 9,  mapBoost: 14, vru: 0.10, traffic: 0.08, speed: 0.16 },
];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function levelFromScore(score) {
  if (score >= 80) return { label: "Critical", tone: "critical" };
  if (score >= 60) return { label: "High",     tone: "high"     };
  if (score >= 35) return { label: "Medium",   tone: "medium"   };
  return                  { label: "Low",      tone: "low"      };
}

function hashText(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function featuresFromRoute(start, end, camera) {
  const rh = hashText(`${start}:${end}`);
  const slope     = clamp(3 + (rh % 14) + camera.mapBoost * 0.5, 0, 24);
  const curvature = clamp(((rh >> 4) % 33) / 100, 0.02, 0.42);
  const vru       = clamp(0.1  + camera.vru     + ((rh >> 7)  % 12) / 100, 0, 1);
  const traffic   = clamp(0.12 + camera.traffic + ((rh >> 9)  % 14) / 100, 0, 1);
  const speed     = clamp(0.14 + camera.speed   + ((rh >> 11) % 16) / 100, 0, 1);

  // mapRisk is provided by the real API; features are supplementary
  return (mapRisk) => ({
    VRU:              clamp(Math.round(vru * 100), 0, 100),
    SidewalkDef:      clamp(Math.round(mapRisk * 0.65), 0, 100),
    GuidanceSupport:  clamp(100 - Math.round(mapRisk * 0.55), 0, 100),
    SurfaceDamage:    clamp(Math.round(mapRisk * 0.72), 0, 100),
    TrafficConflict:  clamp(Math.round(traffic * 100), 0, 100),
    DowngradeSeverity:clamp(Math.round(slope * 4.2), 0, 100),
    CurveSeverity:    clamp(Math.round(curvature * 220), 0, 100),
    ComboSeverity:    clamp(Math.round(mapRisk * 0.5), 0, 100),
    SpeedRisk:        clamp(Math.round(speed * 100), 0, 100),
  });
}

function riskColor(label) {
  if (!label) return "#94a3b8";
  const l = label.toLowerCase();
  if (l.includes("critical")) return "#ef4444";
  if (l.includes("high"))     return "#f97316";
  if (l.includes("medium"))   return "#f59e0b";
  return "#22c55e";
}

// Nominatim-verified spellings for Sri Lankan suburbs
const GEOCODE_ALIAS = { "Athurugiriya": "Athurugiriya", "Malabe": "Malabe" };
const toGeocodeName = (name) => `${GEOCODE_ALIAS[name] ?? name}, Sri Lanka`;

const TICK_MS = 900; // slow vehicle movement — ms per step

// ── Animated Map ──────────────────────────────────────────────────────────────
function AnimatedMapViewer({ pathData, onTick }) {
  const mapRef      = useRef(null);
  const mapInstance = useRef(null);
  const markerRef   = useRef(null);
  const [idx,     setIdx]     = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapInstance.current = L.map(mapRef.current).setView([7.0, 80.0], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(mapInstance.current);
  }, []);

  useEffect(() => {
    if (!mapInstance.current || !pathData?.length) return;
    mapInstance.current.eachLayer((layer) => {
      if (layer instanceof L.Polyline || layer instanceof L.Marker || layer instanceof L.CircleMarker)
        mapInstance.current.removeLayer(layer);
    });
    const coords = pathData.map((p) => [p.lat, p.lon]);
    for (let i = 0; i < coords.length - 1; i++) {
      L.polyline([coords[i], coords[i + 1]], { color: pathData[i].color, weight: 4, opacity: 0.85 })
        .addTo(mapInstance.current);
    }
    L.circleMarker(coords[0], { radius: 9, color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 0.9, weight: 2 })
      .bindPopup("START").addTo(mapInstance.current);
    L.circleMarker(coords[coords.length - 1], { radius: 9, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.9, weight: 2 })
      .bindPopup("END").addTo(mapInstance.current);
    markerRef.current = L.marker(coords[0], {
      icon: L.divIcon({ className: "fusion-vehicle-icon", iconSize: [18, 18], iconAnchor: [9, 9] }),
    }).addTo(mapInstance.current);
    mapInstance.current.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
    setIdx(0);
    setPlaying(true); // auto-start animation when route loads
    onTick?.(pathData[0]);
  }, [pathData]);

  // Advance tick at TICK_MS interval
  useEffect(() => {
    if (!playing || !pathData) return;
    const t = setTimeout(() => setIdx((p) => (p + 1) % pathData.length), TICK_MS);
    return () => clearTimeout(t);
  }, [playing, idx, pathData]);

  // Move marker + notify parent on every index change
  useEffect(() => {
    if (!pathData?.length) return;
    const pt = pathData[idx];
    markerRef.current?.setLatLng([pt.lat, pt.lon]);
    onTick?.(pt);
  }, [idx, pathData]);

  useEffect(() => {
    if (!pathData?.length) return;
    markerRef.current?.setLatLng([pathData[idx].lat, pathData[idx].lon]);
  }, [idx, pathData]);

  return (
    <div className="fusion-map-section">
      <div className="fusion-map-controls">
        <button onClick={() => setPlaying((p) => !p)}>{playing ? "⏸ Pause" : "▶ Play"}</button>
        <span className="fusion-map-progress">{idx} / {pathData?.length || 0}</span>
      </div>
      <div ref={mapRef} className="fusion-map" />
      <style>{`.fusion-vehicle-icon{width:18px;height:18px;background:#38bdf8;border-radius:50%;border:2px solid white;box-shadow:0 0 8px rgba(56,189,248,.7)}`}</style>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RoadSceneFusionPage() {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);

  const [startLocation, setStartLocation] = useState("Malabe");
  const [endLocation,   setEndLocation]   = useState("Athurugiriya");
  const [cameraId,      setCameraId]      = useState(CAMERA_PROFILES[0].id);
  const [cameraActive,  setCameraActive]  = useState(false);
  const [liveActive,    setLiveActive]    = useState(false);

  // Device enumeration for multi-camera support
  const [videoDevices,    setVideoDevices]    = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  // Scene state — updated continuously by RSA loop
  const [sceneScore,    setSceneScore]    = useState(null);
  const [sceneOverlay,  setSceneOverlay]  = useState(null);
  const [sceneSegments, setSceneSegments] = useState([]);
  const [sceneLoading,  setSceneLoading]  = useState(false);
  const [camError,      setCamError]      = useState("");

  // Route/map state — fetched once per route change
  const [mapScore,      setMapScore]      = useState(null);
  const [mapFeatures,   setMapFeatures]   = useState(null);
  const [routeLoading,  setRouteLoading]  = useState(false);
  const [routeError,    setRouteError]    = useState("");
  const [pathData,      setPathData]      = useState(null);

  const camera = useMemo(
    () => CAMERA_PROFILES.find((p) => p.id === cameraId) || CAMERA_PROFILES[0],
    [cameraId]
  );

  // ── Computed levels ────────────────────────────────────────────────────────
  const sceneLevel  = sceneScore !== null ? levelFromScore(sceneScore)  : null;
  const mapLevel    = mapScore   !== null ? levelFromScore(mapScore)    : null;
  const fusionScore = sceneScore !== null && mapScore !== null
    ? clamp(sceneScore * 0.56 + mapScore * 0.44, 0, 100)
    : null;
  const fusionLevel = fusionScore !== null ? levelFromScore(fusionScore) : null;

  // ── Camera controls ────────────────────────────────────────────────────────
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setVideoDevices(cams);
      // Keep current selection if still available, else pick first
      if (cams.length && !cams.find((d) => d.deviceId === selectedDeviceId)) {
        setSelectedDeviceId(cams[0].deviceId);
      }
      return cams;
    } catch { return []; }
  }, [selectedDeviceId]);

  const startCamera = useCallback(async (deviceId) => {
    setCamError("");
    // Stop existing stream first
    videoRef.current?.srcObject?.getTracks().forEach((t) => t.stop());
    try {
      const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
        setLiveActive(true); // auto-start analysis as soon as camera is ready
        // Enumerate after permission granted (labels become available)
        await enumerateDevices();
      }
    } catch {
      setCamError("Camera access denied. Check browser permissions.");
    }
  }, [enumerateDevices]);

  const stopCamera = () => {
    videoRef.current?.srcObject?.getTracks().forEach((t) => t.stop());
    setCameraActive(false);
    setLiveActive(false);
    setSceneScore(null);
    setSceneOverlay(null);
  };

  const switchCamera = useCallback(async (deviceId) => {
    setSelectedDeviceId(deviceId);
    if (cameraActive) await startCamera(deviceId);
  }, [cameraActive, startCamera]);

  // ── Auto-start camera on mount ────────────────────────────────────────────
  useEffect(() => {
    // First enumerate so labels are ready, then start
    navigator.mediaDevices.enumerateDevices()
      .then((devices) => {
        const cams = devices.filter((d) => d.kind === "videoinput");
        setVideoDevices(cams);
        const firstId = cams[0]?.deviceId ?? null;
        setSelectedDeviceId(firstId);
        return startCamera(firstId);
      })
      .catch(() => startCamera(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live RSA loop — runs every 1500 ms while liveActive ───────────────────
  useEffect(() => {
    if (!liveActive || !cameraActive) return;
    let inFlight = false;

    const analyze = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (inFlight || !video || video.readyState < 2 || !canvas) return;
      inFlight = true;
      setSceneLoading(true);
      try {
        canvas.width = 640; canvas.height = 480;
        canvas.getContext("2d").drawImage(video, 0, 0, 640, 480);
        const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.8));
        if (!blob) return;
        const form = new FormData();
        form.append("file", blob, "frame.jpg");
        const resp = await fetch("/rsa/analyse", { method: "POST", body: form });
        const data = await resp.json();
        if (data && !data.error) {
          setSceneScore(data.hazard?.score ?? 0);
          setSceneOverlay(data.overlay ?? null);
          setSceneSegments(data.segments ?? []);
        }
      } catch { /* ignore frame errors */ }
      finally { inFlight = false; setSceneLoading(false); }
    };

    analyze();
    const id = setInterval(analyze, 1500);
    return () => clearInterval(id);
  }, [liveActive, cameraActive]);

  // ── Auto-fetch route when location changes ─────────────────────────────────
  const fetchRoute = useCallback(async (start, end, cam) => {
    setRouteError("");
    setRouteLoading(true);
    setMapScore(null);
    setMapFeatures(null);
    setPathData(null);
    try {
      const resp = await fetch("/api/analyze-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_location: toGeocodeName(start),
          end_location:   toGeocodeName(end),
          step_m: 100,
        }),
      });
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      const pts = data?.path_data ?? [];
      if (!pts.length) throw new Error("No route points");

      const mapped = pts.map((p) => ({
        lat: p.lat, lon: p.lon,
        distance: p.distance ?? 0,
        risk: p.risk ?? 0,
        risk_label: p.risk_label ?? "Low Risk",
        color: p.color ?? riskColor(p.risk_label),
        slope: p.slope ?? 0,
        curvature: p.curvature ?? 0,
        road_name: p.road_name ?? `${start} → ${end}`,
        road_class: p.road_class ?? "primary",
      }));
      setPathData(mapped);

          // Seed MapRiskScore from the first point; it will update live as the marker moves
      const firstRisk = clamp((pts[0]?.risk ?? 0) * 100, 0, 100);
      setMapScore(firstRisk);
      setMapFeatures(featuresFromRoute(start, end, cam)(firstRisk));
    } catch (e) {
      setRouteError(`Route unavailable: ${e.message}`);
    } finally {
      setRouteLoading(false);
    }
  }, []);

  // Fetch on mount and whenever route or camera profile changes
  useEffect(() => {
    fetchRoute(startLocation, endLocation, camera);
  }, [startLocation, endLocation, camera, fetchRoute]);

  // Called by AnimatedMapViewer on every marker tick → updates MapRiskScore live
  const handleMapTick = useCallback((pt) => {
    if (!pt) return;
    const ms = clamp((pt.risk ?? 0) * 100, 0, 100);
    setMapScore(ms);
    setMapFeatures(featuresFromRoute(startLocation, endLocation, camera)(ms));
  }, [startLocation, endLocation, camera]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="dd-root">
      <Sidebar activeKey="roadscene" />
      <main className="fusion-main">
        <div className="fusion-shell">

          {/* ── Hero ── */}
          <section className="fusion-hero">
            <div>
              <div className="fusion-eyebrow">Road Scene + Route Risk Fusion</div>
              <h1>Fusion Neural Network</h1>
            </div>
            {/* Global live indicator */}
            <div className={`fp-live-badge ${liveActive ? "fp-live-badge--on" : ""}`}>
              <span className="fp-live-dot" />
              {liveActive ? "Live" : "Idle"}
            </div>
          </section>

          {/* ── 3-Card Pipeline ── */}
          <section className="fp-pipeline">

            {/* ═══ Card 1 — Scene Input ═══ */}
            <article className="fp-card fp-card--scene">
              <div className="fp-card-header">
                <div className="fp-accent fp-accent--scene" />
                <div className="fp-card-icon">📹</div>
                <div>
                  <div className="fp-eyebrow">Input 1</div>
                  <div className="fp-card-title">Live Video</div>
                </div>
                {liveActive && (
                  <span className="fp-card-live-chip">● Analyzing</span>
                )}
              </div>

              {/* Webcam */}
              <div className="fp-webcam-wrap">
                <video ref={videoRef} autoPlay playsInline className="fp-webcam" />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                {!cameraActive && (
                  <div className="fp-webcam-placeholder">
                    <span className="fp-webcam-off-icon">📷</span>
                    <span>Camera Off</span>
                  </div>
                )}
                {sceneLoading && <div className="fp-webcam-scanning">⚡ Analyzing…</div>}
              </div>

              {/* Live overlay preview */}
              {sceneOverlay && (
                <div className="fp-overlay-preview">
                  <img src={sceneOverlay} alt="RSA overlay" className="fp-overlay-img" />
                  <div className="fp-overlay-label">SegFormer Overlay</div>
                </div>
              )}

              {/* Camera device selector */}
              {videoDevices.length > 0 && (
                <label className="fp-field">
                  <span>Camera Device</span>
                  <select
                    value={selectedDeviceId ?? ""}
                    onChange={(e) => switchCamera(e.target.value)}
                  >
                    {videoDevices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* Camera error */}
              {camError && <div className="fp-route-err">{camError}</div>}

              {/* Camera off button */}
              <div className="fp-cam-btns">
                <button className="fp-btn fp-btn--danger" onClick={stopCamera}>⏹ Stop Camera</button>
              </div>

              <div className="fp-flow-arrow">↓</div>

              <div className={`fp-score-out ${sceneScore !== null ? `fp-tone-${sceneLevel.tone}` : "fp-score-idle"}`}>
                <div className="fp-score-label">SceneRiskScore</div>
                <div className="fp-score-num">{sceneScore !== null ? sceneScore.toFixed(1) : "—"}</div>
                {sceneScore !== null && (
                  <>
                    <span className={`fp-level-badge fp-badge--${sceneLevel.tone}`}>{sceneLevel.label}</span>
                    <div className="fp-score-bar"><div className="fp-score-fill" style={{ width: `${sceneScore}%` }} /></div>
                    {sceneSegments.length > 0 && (
                      <div className="fp-seg-list">
                        {sceneSegments.slice(0, 4).map((s, i) => (
                          <div key={i} className="fp-seg-row">
                            <span className="fp-seg-dot" style={{ background: s.color || "#94a3b8" }} />
                            <span className="fp-seg-name">{s.label}</span>
                            <span className="fp-seg-pct">{(s.pixel_pct ?? 0).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </article>

            {/* ═══ Connector 1 ═══ */}
            <div className="fp-connector">
              <div className="fp-conn-line" />
              <div className="fp-conn-symbol">+</div>
              <div className="fp-conn-line" />
            </div>

            {/* ═══ Card 2 — Route Input ═══ */}
            <article className="fp-card fp-card--route">
              <div className="fp-card-header">
                <div className="fp-accent fp-accent--route" />
                <div className="fp-card-icon">🗺️</div>
                <div>
                  <div className="fp-eyebrow">Input 2</div>
                  <div className="fp-card-title">Route Data</div>
                </div>
                {routeLoading && <span className="fp-card-loading-chip">⏳ Loading</span>}
              </div>

              <label className="fp-field">
                <span>Start Location</span>
                <select value={startLocation} onChange={(e) => setStartLocation(e.target.value)}>
                  {START_POINTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>

              <label className="fp-field">
                <span>End Location</span>
                <select value={endLocation} onChange={(e) => setEndLocation(e.target.value)}>
                  {END_POINTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>

              <div className="fp-route-pill">
                <span className="fp-route-city">{startLocation}</span>
                <span className="fp-route-sep">→</span>
                <span className="fp-route-city">{endLocation}</span>
              </div>

              <div className="fp-source-chips">
                <span className="fp-chip fp-chip--osm">🛣️ OpenStreetMap</span>
                <span className="fp-chip fp-chip--srtm">⛰️ SRTM Elevation</span>
              </div>

              <div className="fp-flow-arrow">↓</div>

              <div className="fp-model-badge fp-model--route">
                <div className="fp-model-icon">📊</div>
                <div>
                  <div className="fp-model-name">Map Risk Analysis</div>
                  <div className="fp-model-detail">Terrain · Roads · Intersections</div>
                </div>
              </div>

              <div className="fp-flow-arrow">↓</div>

              <div className={`fp-score-out ${mapScore !== null ? `fp-tone-${mapLevel.tone}` : "fp-score-idle"}`}>
                <div className="fp-score-label">MapRiskScore</div>
                {routeLoading ? (
                  <div className="fp-score-loading">
                    <span className="fp-route-loading-spinner" /> Fetching route…
                  </div>
                ) : (
                  <div className="fp-score-num">{mapScore !== null ? mapScore.toFixed(1) : "—"}</div>
                )}
                {mapScore !== null && !routeLoading && (
                  <>
                    <span className={`fp-level-badge fp-badge--${mapLevel.tone}`}>{mapLevel.label}</span>
                    <div className="fp-score-bar"><div className="fp-score-fill" style={{ width: `${mapScore}%` }} /></div>
                    <div className="fp-score-subtext">{startLocation} → {endLocation}</div>
                  </>
                )}
                {routeError && <div className="fp-route-err">{routeError}</div>}
              </div>
            </article>

            {/* ═══ Connector 2 ═══ */}
            <div className="fp-connector">
              <div className="fp-conn-line" />
              <div className="fp-conn-symbol fp-conn-arrow">→</div>
              <div className="fp-conn-line" />
            </div>

            {/* ═══ Card 3 — Fusion Output ═══ */}
            <article className="fp-card fp-card--fusion">
              <div className="fp-card-header">
                <div className="fp-accent fp-accent--fusion" />
                <div className="fp-card-icon">⚡</div>
                <div>
                  <div className="fp-eyebrow">Output</div>
                  <div className="fp-card-title">Fusion Neural Network</div>
                </div>
                {fusionScore !== null && (
                  <span className={`fp-card-live-chip fp-card-live-chip--fusion fp-chip-tone-${fusionLevel.tone}`}>
                    ● Live
                  </span>
                )}
              </div>

              {/* Inputs summary */}
              <div className="fp-fusion-inputs">
                <span className="fp-fi-chip fp-fi--scene">SceneRiskScore</span>
                <span className="fp-fi-op">+</span>
                <span className="fp-fi-chip fp-fi--route">MapRiskScore</span>
                <span className="fp-fi-op">+</span>
                <span className="fp-fi-chip fp-fi--extra">9 Extra Features</span>
              </div>

              {/* Features grid */}
              <div className="fp-features-grid">
                {mapFeatures
                  ? Object.entries(mapFeatures).map(([k, v]) => (
                      <div key={k} className="fp-feat-pill">
                        <span className="fp-feat-name">{k}</span>
                        <span className="fp-feat-val">{v}</span>
                      </div>
                    ))
                  : ["VRU","SidewalkDef","GuidanceSupport","SurfaceDamage",
                     "TrafficConflict","DowngradeSeverity","CurveSeverity",
                     "ComboSeverity","SpeedRisk"].map((k) => (
                      <div key={k} className="fp-feat-pill fp-feat-idle">
                        <span className="fp-feat-name">{k}</span>
                        <span className="fp-feat-val">—</span>
                      </div>
                    ))}
              </div>

              <div className="fp-flow-arrow">↓</div>

              <div className="fp-model-badge fp-model--fusion">
                <div className="fp-model-icon">🔬</div>
                <div>
                  <div className="fp-model-name">Neural Network</div>
                  <div className="fp-model-detail">Linear(9→64)→ReLU → Linear(64→32)→ReLU → Linear(32→4)</div>
                </div>
              </div>

              <div className="fp-flow-arrow">↓</div>

              {/* Final score — auto-updates */}
              <div className={`fp-score-out fp-score-out--final ${fusionScore !== null ? `fp-tone-${fusionLevel.tone}` : "fp-score-idle"}`}>
                <div className="fp-score-label">FinalRiskScore</div>
                <div className="fp-score-num fp-score-num--xl">
                  {fusionScore !== null ? fusionScore.toFixed(1) : "—"}
                </div>
                {fusionScore !== null && (
                  <div className="fp-score-bar">
                    <div className="fp-score-fill" style={{ width: `${fusionScore}%` }} />
                  </div>
                )}
                {fusionScore === null && (
                  <div className="fp-score-hint">
                    {!cameraActive
                      ? "Start camera and press ▶ Start Live"
                      : !liveActive
                      ? "Press ▶ Start Live to begin"
                      : mapScore === null
                      ? "Waiting for route data…"
                      : "Waiting for scene analysis…"}
                  </div>
                )}
              </div>

              <div className="fp-flow-arrow">↓</div>

              {/* Risk classification */}
              <div className="fp-risk-classification">
                <div className="fp-risk-class-label">Risk Level Classification</div>
                <div className="fp-risk-chips">
                  {[
                    { label: "Low",      tone: "low"      },
                    { label: "Medium",   tone: "medium"   },
                    { label: "High",     tone: "high"     },
                    { label: "Critical", tone: "critical" },
                  ].map(({ label, tone }) => (
                    <span
                      key={label}
                      className={`fp-risk-chip fp-risk--${tone} ${fusionLevel?.label === label ? "fp-risk--active" : ""}`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          </section>

          {/* ── Animated Route Map ── */}
          {(routeLoading || pathData) && (
            <section className="fusion-map-wrapper">
              <h3>Route Animation</h3>
              {routeLoading ? (
                <div className="fp-route-loading">
                  <span className="fp-route-loading-spinner" />
                  Fetching real route from {startLocation} → {endLocation}…
                </div>
              ) : (
                <AnimatedMapViewer pathData={pathData} onTick={handleMapTick} />
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
