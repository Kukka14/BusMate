import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Sidebar from "../../components/common/Sidebar";
import "./HazardAnalyserPage.css";

// ─── DashboardPanel ────────────────────────────────────────────────────────────
function DashboardPanel({ currentPoint, nextPoints, isFinished = false }) {
  if (!currentPoint && !isFinished) {
    return <div className="hz-db-msg">Click <strong>Play</strong> to start the animation</div>;
  }

  const safeNum = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  if (isFinished) {
    return (
      <div className="hz-db-row">
        {["Road Context", "Terrain", "High Risk Monitor", "Critical Risk Monitor"].map((t) => (
          <div key={t} className="hz-db-card state-safe">
            <div className="hz-db-card-title">{t}</div>
            <div className="hz-db-card-value">Finished</div>
            <div className="hz-db-card-sub">Trip Completed</div>
          </div>
        ))}
      </div>
    );
  }

  const getState = (lbl) => {
    if (lbl === "Critical Risk") return "state-critical";
    if (lbl === "High Risk")     return "state-danger";
    if (lbl === "Medium Risk")   return "state-warn";
    return "state-safe";
  };

  let distHigh = -1, distCrit = -1;
  if (nextPoints) {
    for (const p of nextPoints) {
      if (p.risk_label === "High Risk"     && distHigh === -1) distHigh = p.distance - currentPoint.distance;
      if (p.risk_label === "Critical Risk" && distCrit === -1) distCrit = p.distance - currentPoint.distance;
    }
  }

  /* High Risk card */
  let hrState = "state-safe", hrVal = "Clear", hrSub = "No High Risk";
  if (currentPoint.risk_label === "High Risk") {
    hrState = "state-danger anim-pulse"; hrVal = "ACTIVE"; hrSub = "In High Risk Zone";
  } else if (distHigh !== -1 && distHigh < 500) {
    hrState = distHigh < 200 ? "state-danger anim-pulse" : "state-warn";
    hrVal   = distHigh < 200 ? "SLOW DOWN" : "Caution";
    hrSub   = distHigh < 200 ? `${Math.round(distHigh)} m` : `${Math.round(distHigh)} m Away`;
  } else if (distHigh !== -1) {
    hrState = "state-safe"; hrVal = "Monitoring"; hrSub = `Next in ${Math.round(distHigh)} m`;
  }

  /* Critical Risk card */
  let crState = "state-safe", crVal = "Clear", crSub = "No Critical Risk";
  if (currentPoint.risk_label === "Critical Risk") {
    crState = "state-critical anim-pulse"; crVal = "CRITICAL"; crSub = "EXTREME DANGER";
  } else if (distCrit !== -1 && distCrit < 500) {
    crState = distCrit < 200 ? "state-danger anim-pulse" : "state-warn";
    crVal   = distCrit < 200 ? "DANGER" : "Caution";
    crSub   = `Critical in ${Math.round(distCrit)} m`;
  } else if (distCrit !== -1) {
    crState = "state-safe"; crVal = "Monitoring"; crSub = `Next in ${Math.round(distCrit)} m`;
  }

  /* Terrain card */
  const terrain      = String(currentPoint.terrain_feature || "Flat");
  const isDownhill   = terrain === "High Downhill";
  const isSteepHill  = terrain === "High Steep Hill";
  const slopeDisp    = safeNum(currentPoint.slope)?.toFixed(1) ?? "0.0";
  const curvDisp     = safeNum(currentPoint.curvature)?.toFixed(3) ?? "0.000";

  let nextTerrainDist = -1, nextTerrainLabel = "";
  if (nextPoints) {
    for (const p of nextPoints) {
      const tf = String(p.terrain_feature || "");
      if ((tf.includes("Steep Hill") || tf.includes("Downhill")) && p.distance - currentPoint.distance > 0) {
        nextTerrainDist  = p.distance - currentPoint.distance;
        nextTerrainLabel = tf;
        break;
      }
    }
  }

  const roadMatch    = safeNum(currentPoint.road_dist_m);
  const ctxPenalty   = safeNum(currentPoint.context_penalty);
  const nearInter    = currentPoint.near_intersections || 0;

  return (
    <div className="hz-db-row">
      {/* Road Context */}
      <div className={`hz-db-card hz-db-road ${getState(currentPoint.risk_label)}`}>
        <div className="hz-db-card-title">Road Context</div>
        <div className="hz-db-road-name">{currentPoint.road_name || "Unknown Road"}</div>
        <div className="hz-db-details">
          {[
            ["Type",          currentPoint.road_class || "unknown"],
            ["Ref",           currentPoint.road_ref   || "N/A"],
            ["Intersections", nearInter],
            ["Bridge",        currentPoint.is_bridge ? "Yes" : "No"],
            ["Tunnel",        currentPoint.is_tunnel ? "Yes" : "No"],
            ["Max Speed",     currentPoint.maxspeed  || "N/A"],
            ["Lanes",         currentPoint.lanes     || "N/A"],
            ["Road match",    roadMatch !== null ? `${roadMatch.toFixed(1)} m` : "N/A"],
            ["OSM context",   ctxPenalty !== null ? ctxPenalty.toFixed(2) : "N/A"],
          ].map(([k, v]) => (
            <div key={k} className="hz-db-detail-row">
              <span className="hz-db-detail-label">{k}:</span>
              <span className="hz-db-detail-val">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Terrain */}
      <div className={`hz-db-card ${getState(currentPoint.risk_label)}`}>
        <div className="hz-db-card-title">Terrain</div>
        <div className="hz-db-card-value">{terrain}</div>
        {nextTerrainDist !== -1 && !isDownhill && !isSteepHill && (
          <div className="hz-db-terrain-ahead">Next {nextTerrainLabel} in {Math.round(nextTerrainDist)} m</div>
        )}
        {(isDownhill || isSteepHill) && (
          <div className="hz-db-warn-card">
            <div className="hz-db-warn-title">{isDownhill ? "HIGH DOWNHILL" : "HIGH STEEP HILL"}</div>
            <div className="hz-db-warn-main">{isDownhill ? "Shift to 1st gear now" : "Use 1st or 2nd gear"}</div>
            <div className="hz-db-warn-sub">{isDownhill ? "Use engine braking, avoid long brake hold." : "Keep momentum and avoid sudden acceleration."}</div>
          </div>
        )}
        <div className="hz-db-metrics">
          <span className="hz-metric hz-metric-slope">Slope: {slopeDisp}%</span>
          <span className="hz-metric hz-metric-curv">C: {curvDisp}</span>
          <span className="hz-metric hz-metric-speed">Max Speed: {currentPoint.maxspeed || "N/A"}</span>
        </div>
      </div>

      {/* High Risk */}
      <div className={`hz-db-card ${hrState}`}>
        <div className="hz-db-card-title">High Risk Monitor</div>
        <div className="hz-db-card-alert">{hrVal}</div>
        <div className="hz-db-card-sub">{hrSub}</div>
      </div>

      {/* Critical Risk */}
      <div className={`hz-db-card ${crState}`}>
        <div className="hz-db-card-title">Critical Risk Monitor</div>
        <div className="hz-db-card-alert">{crVal}</div>
        <div className="hz-db-card-sub">{crSub}</div>
      </div>
    </div>
  );
}

// ─── AnimatedMapViewer ─────────────────────────────────────────────────────────
function AnimatedMapViewer({ pathData, startCoords, endCoords }) {
  const mapRef         = useRef(null);
  const mapInstance    = useRef(null);
  const markerRef      = useRef(null);
  const criticalRef    = useRef(null);
  const polylineRef    = useRef(null);
  const animRef        = useRef(null);

  const [currentIndex,     setCurrentIndex]     = useState(0);
  const [currentPoint,     setCurrentPoint]      = useState(null);
  const [isPlaying,        setIsPlaying]         = useState(false);
  const [playbackDir,      setPlaybackDir]       = useState(1);
  const [tripFinished,     setTripFinished]      = useState(false);

  const getDelay = useCallback((pt) => {
    if (!pt) return 200;
    switch (pt.risk_label) {
      case "Critical Risk": return 900;
      case "High Risk":     return 700;
      case "Medium Risk":   return 300;
      default:              return 150;
    }
  }, []);

  // Init Leaflet map once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapInstance.current = L.map(mapRef.current).setView([7.0, 80.0], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(mapInstance.current);
    return () => {
      if (animRef.current) clearTimeout(animRef.current);
    };
  }, []);

  // Draw route when pathData changes
  useEffect(() => {
    if (!mapInstance.current || !pathData || pathData.length === 0) return;

    // Clear old layers
    mapInstance.current.eachLayer((layer) => {
      if (layer instanceof L.Polyline || layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        mapInstance.current.removeLayer(layer);
      }
    });
    if (animRef.current) clearTimeout(animRef.current);

    setCurrentIndex(0);
    setCurrentPoint(null);
    setIsPlaying(false);
    setTripFinished(false);
    markerRef.current     = null;
    criticalRef.current   = null;

    const coords = pathData.map((p) => [p.lat, p.lon]);

    // Colour segments by risk
    for (let i = 0; i < coords.length - 1; i++) {
      L.polyline([coords[i], coords[i + 1]], {
        color: pathData[i].color || "green",
        weight: 4,
        opacity: 0.8,
      }).addTo(mapInstance.current);
    }
    polylineRef.current = L.polyline(coords, { opacity: 0 }).addTo(mapInstance.current);

    // Critical & terrain markers
    pathData.forEach((p, idx) => {
      if (p.risk_label === "Critical Risk" && idx % 3 === 0) {
        L.circleMarker([p.lat, p.lon], { radius: 5, color: "darkred", fillColor: "darkred", opacity: 0.7 })
          .bindPopup(`Risk: ${p.risk?.toFixed(2)}`).addTo(mapInstance.current);
      }
      if (p.terrain_feature === "High Downhill") {
        L.circleMarker([p.lat, p.lon], { radius: 4, color: "black", fillColor: "black", opacity: 0.6 })
          .bindPopup("High Downhill").addTo(mapInstance.current);
      }
      if (p.terrain_feature === "High Steep Hill") {
        L.circleMarker([p.lat, p.lon], { radius: 4, color: "navy", fillColor: "navy", opacity: 0.6 })
          .bindPopup("High Steep Hill").addTo(mapInstance.current);
      }
    });

    // Start / End markers
    L.circleMarker(coords[0], { radius: 10, color: "#0b5fff", fillColor: "#0b5fff", opacity: 0.9, weight: 2 })
      .bindPopup("START").addTo(mapInstance.current);
    L.circleMarker(coords[coords.length - 1], { radius: 10, color: "red", fillColor: "red", opacity: 0.8, weight: 2 })
      .bindPopup("END").addTo(mapInstance.current);

    // Animated vehicle marker
    markerRef.current = L.marker(coords[0], {
      icon: L.divIcon({ className: "hz-vehicle-icon", iconSize: [18, 18], iconAnchor: [9, 9] }),
    }).addTo(mapInstance.current);

    mapInstance.current.fitBounds(polylineRef.current.getBounds(), { padding: [40, 40] });
  }, [pathData]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !pathData) return;

    if (currentIndex >= pathData.length || currentIndex < 0) {
      setIsPlaying(false);
      if (currentIndex >= pathData.length) {
        setCurrentIndex(pathData.length - 1);
        setCurrentPoint(pathData[pathData.length - 1] || null);
        setTripFinished(true);
      }
      if (currentIndex < 0) setCurrentIndex(0);
      return;
    }

    const pt = pathData[currentIndex];
    setCurrentPoint(pt);

    if (markerRef.current) {
      markerRef.current.setLatLng([pt.lat, pt.lon]);
      markerRef.current
        .bindPopup(
          `<div style="font-weight:bold;color:white;background:${pt.color};padding:5px;border-radius:4px">${pt.risk_label}</div>
           <div style="margin-top:5px;font-size:12px">Risk: ${pt.risk?.toFixed(2)}<br>Slope: ${pt.slope?.toFixed(1) || "0"}%<br>Curvature: ${pt.curvature?.toFixed(3) || "0"}</div>`
        )
        .openPopup();
    }

    if (mapInstance.current) {
      if (pt.risk_label === "Critical Risk") {
        if (!criticalRef.current) {
          criticalRef.current = L.marker([pt.lat, pt.lon], {
            icon: L.divIcon({ className: "hz-critical-beacon", iconSize: [28, 28], iconAnchor: [14, 14] }),
          }).addTo(mapInstance.current);
        } else {
          criticalRef.current.setLatLng([pt.lat, pt.lon]);
        }
      } else if (criticalRef.current) {
        mapInstance.current.removeLayer(criticalRef.current);
        criticalRef.current = null;
      }
    }

    animRef.current = setTimeout(() => {
      setCurrentIndex((prev) => prev + playbackDir);
    }, getDelay(pt));

    return () => { if (animRef.current) clearTimeout(animRef.current); };
  }, [isPlaying, currentIndex, pathData, playbackDir, getDelay]);

  const handlePlayPause = () => {
    if (!isPlaying && currentIndex < (pathData?.length ?? 0) - 1) setTripFinished(false);
    setIsPlaying((p) => !p);
  };

  const handleReset = () => {
    setCurrentIndex(0); setIsPlaying(false); setTripFinished(false); setCurrentPoint(null);
    if (markerRef.current && pathData?.length) markerRef.current.setLatLng([pathData[0].lat, pathData[0].lon]);
  };

  const handleBack2s = () => {
    if (!pathData?.length) return;
    let idx = currentIndex, ms = 0;
    while (idx > 0 && ms < 2000) { idx--; ms += getDelay(pathData[idx]); }
    setCurrentIndex(idx);
    setCurrentPoint(pathData[idx] || null);
    if (markerRef.current && pathData[idx]) markerRef.current.setLatLng([pathData[idx].lat, pathData[idx].lon]);
  };

  if (!pathData || pathData.length === 0) return <div className="hz-map-empty">No route data</div>;

  const totalDist   = pathData[pathData.length - 1]?.distance ?? 0;
  const curDist     = currentPoint?.distance ?? 0;
  const remaining   = Math.max(0, totalDist - curDist);
  const progress    = pathData.length > 1 ? (currentIndex / (pathData.length - 1)) * 100 : 0;

  return (
    <div className="hz-anim-container">
      {/* Controls */}
      <div className="hz-controls">
        <button className="hz-btn hz-btn-play" onClick={handlePlayPause}>
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
        <button className="hz-btn hz-btn-dir" onClick={() => setPlaybackDir((d) => d === 1 ? -1 : 1)}>
          {playbackDir === 1 ? "⏪ Backward" : "⏩ Forward"}
        </button>
        <button className="hz-btn hz-btn-back" onClick={handleBack2s}>↶ Back 2s</button>
        <button className="hz-btn hz-btn-reset" onClick={handleReset}>⟲ Reset</button>
        <div className="hz-progress-wrap">
          <div className="hz-progress-bar"><div className="hz-progress-fill" style={{ width: `${progress}%` }} /></div>
          <div className="hz-progress-text">{currentIndex} / {pathData.length} pts &nbsp;|&nbsp; To end: {remaining.toFixed(0)} m</div>
        </div>
      </div>

      {/* Map */}
      <div ref={mapRef} className="hz-map" />

      {/* Dashboard */}
      <DashboardPanel currentPoint={currentPoint} nextPoints={pathData.slice(currentIndex)} isFinished={tripFinished} />

      <style>{`
        .hz-vehicle-icon {
          width: 18px; height: 18px; background: #0b5fff; border-radius: 50%;
          border: 2px solid white; box-shadow: 0 0 6px rgba(11,95,255,.6);
          animation: hz-vpulse 1s infinite;
        }
        .hz-critical-beacon {
          width: 28px; height: 28px; border-radius: 50%;
          border: 3px solid rgba(127,29,29,.95); background: rgba(220,38,38,.28);
          animation: hz-beacon 1s ease-out infinite;
        }
        @keyframes hz-vpulse {
          0%,100% { box-shadow: 0 0 6px rgba(11,95,255,.6); }
          50%      { box-shadow: 0 0 12px rgba(11,95,255,.9); }
        }
        @keyframes hz-beacon {
          0%   { box-shadow: 0 0 0 0 rgba(220,38,38,.55); }
          70%  { box-shadow: 0 0 0 18px rgba(220,38,38,0); }
          100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
        }
      `}</style>
    </div>
  );
}

// ─── StaticMap ─────────────────────────────────────────────────────────────────
function StaticMap({ analysis }) {
  const mapRef      = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current).setView([7.0, 80.0], 8);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(mapInstance.current);
    }

    if (!analysis?.path_data?.length) return;

    mapInstance.current.eachLayer((l) => {
      if (l instanceof L.Polyline || l instanceof L.Marker || l instanceof L.CircleMarker)
        mapInstance.current.removeLayer(l);
    });

    const pd   = analysis.path_data;
    const coords = pd.map((p) => [p.lat, p.lon]);

    for (let i = 0; i < coords.length - 1; i++) {
      L.polyline([coords[i], coords[i + 1]], { color: pd[i].color || "green", weight: 4, opacity: 0.8 })
        .addTo(mapInstance.current);
    }

    L.circleMarker(coords[0], { radius: 9, color: "#0b5fff", fillColor: "#0b5fff", opacity: 0.9 })
      .bindPopup(`Start: ${analysis.start_location}`).addTo(mapInstance.current);
    L.circleMarker(coords[coords.length - 1], { radius: 9, color: "red", fillColor: "red", opacity: 0.8 })
      .bindPopup(`End: ${analysis.end_location}`).addTo(mapInstance.current);

    pd.filter((p) => p.risk_label === "Critical Risk").forEach((p, idx) => {
      if (idx % 3 === 0)
        L.circleMarker([p.lat, p.lon], { radius: 4, color: "darkred", fillColor: "darkred", opacity: 0.7 })
          .bindPopup(`Risk: ${p.risk?.toFixed(2)}`).addTo(mapInstance.current);
    });

    mapInstance.current.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
  }, [analysis]);

  return <div ref={mapRef} className="hz-static-map" />;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function HazardAnalyserPage() {
  const [start,    setStart]    = useState("Amaragoda");
  const [end,      setEnd]      = useState("Pothuarawa");
  const [stepSize, setStepSize] = useState(5);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [viewMode, setViewMode] = useState("static"); // "static" | "animated"

  const setPreset = (s, e) => { setStart(s); setEnd(e); };

  const analyze = async () => {
    if (!start.trim() || !end.trim()) { setError("Please enter both start and end locations."); return; }
    setError(""); setLoading(true); setAnalysis(null);
    try {
      const res  = await fetch("/api/analyze-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_location: start, end_location: end, step_m: stepSize }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Analysis failed."); return; }
      setAnalysis(data);
      setViewMode("static");
    } catch (e) {
      setError("Network error — is the backend running on port 5000?");
    } finally {
      setLoading(false);
    }
  };

  // Summary stats
  const stats = analysis?.path_data
    ? (() => {
        const pd       = analysis.path_data;
        const risks    = pd.map((p) => p.risk);
        const totalDist = pd[pd.length - 1]?.distance ?? 0;
        return {
          totalDist:  totalDist.toFixed(0),
          avgRisk:    (risks.reduce((a, b) => a + b, 0) / risks.length).toFixed(2),
          maxRisk:    Math.max(...risks).toFixed(2),
          highCount:  pd.filter((p) => p.risk_label === "High Risk").length,
          critCount:  pd.filter((p) => p.risk_label === "Critical Risk").length,
          points:     pd.length,
        };
      })()
    : null;

  return (
    <div className="hz-layout">
      <Sidebar activeKey="roadscene" />
      <main className="hz-main">
    <div className="hz-page">
      {/* Header */}
      <div className="hz-header">
        <h1 className="hz-title">🗺 Bus Route Safety Hazard Analyser</h1>
        <p className="hz-subtitle">Analyse terrain, road conditions, and safety risks along a Sri Lanka bus route</p>
      </div>

      <div className="hz-body">
        {/* ── Left panel: input + results ── */}
        <div className="hz-left">
          <div className="hz-card">
            <h2 className="hz-card-heading">Enter Route</h2>

            <div className="hz-form-group">
              <label>Start Location</label>
              <input
                type="text"
                value={start}
                placeholder="e.g. Colombo, Amaragoda"
                onChange={(e) => setStart(e.target.value)}
              />
            </div>

            <div className="hz-form-group">
              <label>End Location</label>
              <input
                type="text"
                value={end}
                placeholder="e.g. Galle, Pothuarawa"
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>

            <div className="hz-form-group">
              <label>Sampling Step (m)</label>
              <input
                type="number"
                value={stepSize}
                min={1}
                max={50}
                onChange={(e) => setStepSize(parseFloat(e.target.value))}
              />
            </div>

            <div className="hz-presets">
              {[["Colombo","Galle"],["Kandy","Matara"],["Jaffna","Trincomalee"],["Negombo","Kurunegala"]].map(([s,e]) => (
                <button key={s+e} className="hz-preset-btn" onClick={() => setPreset(s, e)}>
                  {s} → {e}
                </button>
              ))}
            </div>

            <button className="hz-analyze-btn" onClick={analyze} disabled={loading}>
              {loading ? (
                <><span className="hz-spinner" /> Analysing…</>
              ) : "Analyse Route"}
            </button>

            {error && <div className="hz-error">{error}</div>}
          </div>

          {/* Stats */}
          {stats && (
            <div className="hz-card">
              <h2 className="hz-card-heading">Route Summary</h2>
              <div className="hz-route-info">
                <p>From: <strong>{analysis.start_location}</strong></p>
                <p>To: <strong>{analysis.end_location}</strong></p>
              </div>
              <div className="hz-stats-grid">
                {[
                  ["Points",        stats.points],
                  ["Distance",      `${stats.totalDist} m`],
                  ["Avg Risk",      stats.avgRisk],
                  ["Max Risk",      stats.maxRisk],
                  ["High Risk pts", stats.highCount],
                  ["Critical pts",  stats.critCount],
                ].map(([k, v]) => (
                  <div key={k} className="hz-stat-box">
                    <div className="hz-stat-label">{k}</div>
                    <div className="hz-stat-value">{v}</div>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="hz-legend">
                <strong>Risk Legend</strong>
                {[
                  ["green",   "Low Risk (< 0.40)"],
                  ["orange",  "Medium Risk (0.40–0.70)"],
                  ["red",     "High Risk (0.70–1.00)"],
                  ["darkred", "Critical Risk (> 1.00)"],
                ].map(([c, lbl]) => (
                  <div key={c} className="hz-legend-item">
                    <span className="hz-legend-dot" style={{ background: c }} />
                    {lbl}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel: map ── */}
        <div className="hz-right">
          <div className="hz-card hz-map-card">
            <div className="hz-map-header">
              <h2 className="hz-card-heading">Route Map</h2>
              {analysis && (
                <div className="hz-view-toggle">
                  <button
                    className={`hz-toggle-btn ${viewMode === "static" ? "active" : ""}`}
                    onClick={() => setViewMode("static")}
                  >
                    📍 Static
                  </button>
                  <button
                    className={`hz-toggle-btn ${viewMode === "animated" ? "active" : ""}`}
                    onClick={() => setViewMode("animated")}
                  >
                    ▶ Animated
                  </button>
                </div>
              )}
            </div>

            {!analysis && !loading && (
              <div className="hz-map-placeholder">
                <span>Enter a route and click <strong>Analyse Route</strong> to view the hazard map.</span>
              </div>
            )}

            {loading && (
              <div className="hz-map-placeholder">
                <span className="hz-spinner hz-spinner-lg" />
                <span style={{ marginTop: 12 }}>Analysing route — this may take up to a minute…</span>
              </div>
            )}

            {analysis && viewMode === "static"   && <StaticMap analysis={analysis} />}
            {analysis && viewMode === "animated" && (
              <AnimatedMapViewer
                pathData={analysis.path_data}
                startCoords={analysis.start_coords}
                endCoords={analysis.end_coords}
              />
            )}
          </div>
        </div>
      </div>
    </div>
      </main>
    </div>
  );
}
