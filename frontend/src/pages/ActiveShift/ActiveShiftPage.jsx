import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { io } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Sidebar from "../../components/common/Sidebar";
import { getSignInstruction, PRIORITY_COLORS } from "../../utils/roadSignInstructions";
import "./ActiveShiftPage.css";

const API        = import.meta.env.VITE_API_URL || "http://localhost:5000";
const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const EMOTION_COLOR = {
  happy: "#22c55e",
  neutral: "#64748b",
  sad: "#a78bfa",
  angry: "#ef4444",
  fearful: "#f97316",
  surprised: "#f59e0b",
  surprise: "#f59e0b",
  disgust: "#84cc16",
  disgusted: "#84cc16",
};
function bviColor(score) {
  return score == null ? "#475569" : score < 0.3 ? "#22c55e" : score < 0.6 ? "#f59e0b" : "#ef4444";
}
function verdictColor(v) {
  if (v === "Drowsy") return "#ef4444";
  if (v === "Alert")  return "#22c55e";
  return "#475569";
}
function confColor(p) {
  if (p == null)  return "#475569";
  if (p < 0.30)   return "#22c55e";
  if (p < 0.60)   return "#f59e0b";
  return "#ef4444";
}
function hazardColor(level) {
  if (level === "High") return "#ef4444";
  if (level === "Medium") return "#f59e0b";
  return "#22c55e";
}
const IcoStop  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;
const IcoAlert = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;

const CHEATING_LABELS = new Set(["cell phone","laptop","phone","hand raise","extra person"]);
const CONSECUTIVE_THRESHOLD = 5;

// ═══════════════════════════════════════════════════════════════════════════════
// ── Helper components ─────────────────────────────────────────────────────────

function MiniGauge({ value, label, color, size = 80 }) {
  const cx = size/2, cy = size/2, r = size/2-6;
  const circ = 2*Math.PI*r;
  const pct = value!=null ? Math.min(1,Math.max(0,value)) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="6"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{transition:"stroke-dashoffset 0.4s ease,stroke 0.3s"}}/>
      <text x={cx} y={cy-2} textAnchor="middle" fill="#f1f5f9" fontSize={size*0.17} fontWeight="700"
        fontFamily="Inter,sans-serif">{value!=null?(typeof value==="number"?value.toFixed(3):"—"):"—"}</text>
      <text x={cx} y={cy+size*0.14} textAnchor="middle" fill="#64748b" fontSize={size*0.11}
        fontFamily="Inter,sans-serif">{label}</text>
    </svg>
  );
}

function ProbBar({ label, value, color }) {
  const pct = Math.round((value||0)*100);
  return (
    <div className="as-prob-row">
      <span className="as-prob-label">{label}</span>
      <div className="as-prob-track"><div className="as-prob-fill" style={{width:`${pct}%`,background:color}}/></div>
      <span className="as-prob-pct">{pct}%</span>
    </div>
  );
}

function ModelBar({ name, weight, prob, color }) {
  const pct = Math.round((prob??0)*100);
  return (
    <div className="as-prob-row">
      <span className="as-prob-label">{name} <small style={{color:"#475569"}}>×{weight}</small></span>
      <div className="as-prob-track"><div className="as-prob-fill" style={{width:`${pct}%`,background:color}}/></div>
      <span className="as-prob-pct">{pct}%</span>
    </div>
  );
}

function FeatChip({ label, value, unit, warn }) {
  return (
    <span className={`as-feat-chip ${warn?"warn":""}`}>
      {label}: {value!=null?`${value}${unit}`:"—"}
    </span>
  );
}

function StreakBar({ count, threshold }) {
  const color = count>=threshold?"#ef4444":count>=Math.ceil(threshold*0.6)?"#f59e0b":"#22c55e";
  return (
    <div className="as-streak-wrap">
      {Array.from({length:threshold}).map((_,i)=>(
        <div key={i} className="as-streak-seg" style={{background:i<count?color:"#1e293b"}}/>
      ))}
      <span className="as-streak-label" style={{color}}>{count}/{threshold}</span>
    </div>
  );
}

// ── DashboardPanel for Hazard ─────────────────────────────────────────────────
function HazardDashPanel({ currentPoint, nextPoints, isFinished, totalDistance }) {
  const fmtDist = d => d >= 1000 ? `${(d/1000).toFixed(1)} km` : `${Math.round(d)} m`;
  const curDist = currentPoint?.distance || 0;
  const totalD  = totalDistance || 0;

  if (!currentPoint && !isFinished) return <div className="as-hz-msg">Click Play to begin route animation</div>;
  if (isFinished) return (
    <div className="as-hz-cards">
      {["Road","Terrain","High Risk","Critical Risk"].map(t=>(
        <div key={t} className="as-hz-card safe"><div className="as-hz-card-title">{t}</div><div className="as-hz-card-val">Finished</div><div className="as-hz-card-sub">{fmtDist(totalD)} total</div></div>
      ))}
    </div>
  );

  let distHigh=-1, distCrit=-1;
  if (nextPoints) {
    for (const p of nextPoints) {
      if (p.risk_label==="High Risk"&&distHigh===-1) distHigh=p.distance-currentPoint.distance;
      if (p.risk_label==="Critical Risk"&&distCrit===-1) distCrit=p.distance-currentPoint.distance;
    }
  }

  let hrState="safe",hrVal="Clear",hrSub="No High Risk";
  if (currentPoint.risk_label==="High Risk") { hrState="danger pulse";hrVal="ACTIVE";hrSub="In Zone"; }
  else if (distHigh!==-1&&distHigh<500) { hrState=distHigh<200?"danger pulse":"warn";hrVal=distHigh<200?"SLOW DOWN":"Caution";hrSub=`${Math.round(distHigh)} m`; }
  else if (distHigh!==-1) { hrSub=`Next in ${Math.round(distHigh)} m`; }

  let crState="safe",crVal="Clear",crSub="No Critical Risk";
  if (currentPoint.risk_label==="Critical Risk") { crState="critical pulse";crVal="CRITICAL";crSub="DANGER"; }
  else if (distCrit!==-1&&distCrit<500) { crState=distCrit<200?"critical pulse":"warn";crVal=distCrit<200?"DANGER":"Caution";crSub=`${Math.round(distCrit)} m`; }
  else if (distCrit!==-1) { crSub=`Next in ${Math.round(distCrit)} m`; }

  const terrain = String(currentPoint.terrain_feature||"Flat").toLowerCase();
  const isSteep = terrain.includes("steep") || terrain.includes("hill") || terrain.includes("downhill");

  // Find next steep hill / downhill ahead
  let nextSteepAbsDist = -1, nextSteepType = "";
  if (!isSteep && nextPoints) {
    for (const p of nextPoints) {
      const tf = String(p.terrain_feature||"").toLowerCase();
      if (tf.includes("steep") || tf.includes("hill") || tf.includes("downhill")) {
        nextSteepAbsDist = p.distance;  // distance from trip start
        nextSteepType = p.terrain_feature;
        break;
      }
    }
  }

  let terrainState = "safe", terrainVal = "Clear", terrainSub = "No steep terrain";
  if (isSteep) {
    terrainState = "warn";
    terrainVal = currentPoint.terrain_feature;
    terrainSub = `⚠ Slope: ${currentPoint.slope?.toFixed(1)||0}%`;
  } else if (nextSteepAbsDist > 0) {
    terrainVal = nextSteepType;
    terrainSub = `Next at ${fmtDist(nextSteepAbsDist)}`;
  }

  return (
    <div className="as-hz-cards">
      <div className="as-hz-card">
        <div className="as-hz-card-title">Road</div>
        <div className="as-hz-card-val">{currentPoint.road_name||"Unknown"}</div>
        <div className="as-hz-card-sub">{currentPoint.road_class||"—"} · Lanes: {currentPoint.lanes||"N/A"}</div>
      </div>
      <div className={`as-hz-card ${terrainState}`}>
        <div className="as-hz-card-title">Terrain</div>
        <div className="as-hz-card-val">{terrainVal}</div>
        <div className="as-hz-card-sub">{terrainSub}</div>
      </div>
      <div className={`as-hz-card ${hrState}`}>
        <div className="as-hz-card-title">High Risk</div>
        <div className="as-hz-card-val">{hrVal}</div>
        <div className="as-hz-card-sub">{hrSub}</div>
      </div>
      <div className={`as-hz-card ${crState}`}>
        <div className="as-hz-card-title">Critical Risk</div>
        <div className="as-hz-card-val">{crVal}</div>
        <div className="as-hz-card-sub">{crSub}</div>
      </div>
    </div>
  );
}

// (DangerCard removed — replaced by toast popups)

// ═══════════════════════════════════════════════════════════════════════════════
// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function ActiveShiftPage() {
  const navigate = useNavigate();
  const { state: routeState } = useLocation();
  const token = localStorage.getItem("token");
  const user  = JSON.parse(localStorage.getItem("user")||"{}");
  const driverId = user.id || user._id || "driver";

  // Schedule info from navigation state
  const scheduleInfo = routeState || {};
  const startTown = scheduleInfo.start_town || "Colombo";
  const endTown   = scheduleInfo.end_town   || "Kandy";
  const busId     = scheduleInfo.bus         || "BUS-001";
  const routeName = scheduleInfo.route_name  || "Route";
  const scheduleId = scheduleInfo.schedule_id || scheduleInfo.id || "";

  // ── Shift state ─────────────────────────────────────────────────────────
  const [shiftActive, setShiftActive] = useState(false);
  const [shiftStart, setShiftStart]   = useState(null);
  const [elapsed, setElapsed]         = useState("00:00");
  const [activePanel, setActivePanel] = useState("all"); // "all"|"emotion"|"drowsiness"|"roadscene"|"hazard"
  const [drivingMode, setDrivingMode] = useState(false);

  // ── Shared webcam ───────────────────────────────────────────────────────
  const videoRef   = useRef(null);      // Capture source for emotion + drowsiness
  const captureRef = useRef(null);
  const streamRef  = useRef(null);
  const videoRefEmotionDisplay = useRef(null);      // Display for emotion card
  const videoRefDrowsinessDisplay = useRef(null);   // Display for drowsiness card
  const [camError, setCamError] = useState("");
  // ── Second (road-facing) webcam ───────────────────────────────────────
  const videoRef2   = useRef(null);     // Capture source for road sign + road scene
  const captureRef2 = useRef(null);
  const streamRef2  = useRef(null);
  const videoRefRoadSignDisplay = useRef(null);      // Display for road sign card
  const videoRefRoadSceneDisplay = useRef(null);     // Display for road scene card
  const [cam2Error, setCam2Error] = useState("");
  const [devices, setDevices] = useState([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [driverDeviceId, setDriverDeviceId] = useState(null);
  const [roadDeviceId, setRoadDeviceId] = useState(null);

  const isLaptopCamera = (device) => {
    const label = (device?.label || "").toLowerCase();
    return (
      label.includes("integrated") ||
      label.includes("internal") ||
      label.includes("built-in") ||
      label.includes("builtin") ||
      label.includes("laptop") ||
      label.includes("default camera")
    );
  };

  const getExternalCameras = (cams) => cams.filter((device) => !isLaptopCamera(device));

  const findPreferredDriverDeviceId = (cams) => {
    const externalCams = getExternalCameras(cams);
    return externalCams[0]?.deviceId || cams[0]?.deviceId || null;
  };

  const findPreferredRoadDeviceId = (cams, driverId = null) => {
    const externalCams = getExternalCameras(cams);
    const roadExternalCam = externalCams.find((device) => device.deviceId !== driverId);
    if (roadExternalCam?.deviceId) {
      return roadExternalCam.deviceId;
    }

    const nonDriverCam = cams.find((device) => device.deviceId !== driverId);
    return nonDriverCam?.deviceId || cams[1]?.deviceId || cams[0]?.deviceId || null;
  };

  // ── Emotion state ───────────────────────────────────────────────────────
  const emSocketRef = useRef(null);
  const emOverlayRef = useRef(null);
  const emSendIvRef = useRef(null);
  const emRafRef    = useRef(null);
  const [emConnected, setEmConnected] = useState(false);
  const [emResult, setEmResult]       = useState(null);
  const [emSessionId, setEmSessionId] = useState(null);
  const [emFrames, setEmFrames]       = useState(0);

  // ── Drowsiness state ────────────────────────────────────────────────────
  const dwSocketRef   = useRef(null);
  const dwOverlayRef  = useRef(null);
  const dwSendIvRef   = useRef(null);
  const dwRafRef      = useRef(null);
  const dwInFlight    = useRef(false);
  const [dwConnected, setDwConnected] = useState(false);
  const [dwResult, setDwResult]       = useState(null);
  const [dwSessionId, setDwSessionId] = useState(null);
  const [dwFrames, setDwFrames]       = useState(0);
  const [dwAlerts, setDwAlerts]       = useState(0);
  const [dwDrowsyFrames, setDwDrowsyFrames] = useState(0);

  // ── Shift scoring accumulators ───────────────────────────────────────────
  const bviSumRef    = useRef(0);
  const bviCountRef  = useRef(0);
  const cheatCountRef = useRef(0);
  const [shiftScore, setShiftScore]     = useState(null); // score result to show in modal

  // ── Road Scene state ────────────────────────────────────────────────────
  const [rsResult, setRsResult]       = useState(null);
  const [rsLoading, setRsLoading]     = useState(false);
  const [rsActiveIdx, setRsActiveIdx] = useState(0);
  const [rsPlaying, setRsPlaying]     = useState(true);
  const rsPlayRef = useRef(null);

  // Toggle to show only the 4 live analyzer cards (keep page minimal)
  const showOnlyFeeds = false;

  // ── Hazard state ────────────────────────────────────────────────────────
  const [hzAnalysis, setHzAnalysis]   = useState(null);
  const [hzLoading, setHzLoading]     = useState(false);
  const [hzError, setHzError]         = useState("");
  const hzMapRef      = useRef(null);
  const hzMapInstance = useRef(null);
  const liveGpsMapInstance = useRef(null);
  const hzMarkerRef   = useRef(null);
  const hzAnimRef     = useRef(null);
  const hudMapRef     = useRef(null);
  const hudMapInst    = useRef(null);
  const hudMarkerRef  = useRef(null);
  const gpsMapRef     = useRef(null);
  const gpsMapInst    = useRef(null);
  const gpsMarkerRef  = useRef(null);
  const gpsSocketRef  = useRef(null);
  const [hzIdx, setHzIdx]             = useState(0);
  const [hzPoint, setHzPoint]         = useState(null);
  const [hzPlaying, setHzPlaying]     = useState(false);
  const [hzFinished, setHzFinished]   = useState(false);

  // ── Road Sign state ─────────────────────────────────────────────────────
  const [rsSignInfo, setRsSignInfo]         = useState(null); // {class_name, confidence, status}
  const rsSignPollRef = useRef(null);
  const rsSignLastRef = useRef(null);
  const [rsSignLog, setRsSignLog]           = useState([]);


  // ── Auth guard ──────────────────────────────────────────────────────────
  useEffect(() => { if (!token) navigate("/login"); }, [token, navigate]);

  // ── ESC exits driving mode ────────────────────────────────────────────
  useEffect(() => {
    const handler = e => { if (e.key === "Escape" && drivingMode) setDrivingMode(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drivingMode]);

  // ── HUD map — init + sync with hazard data ─────────────────────────────
  useEffect(() => {
    if (!drivingMode || !hudMapRef.current) return;
    if (hudMapInst.current) { hudMapInst.current.invalidateSize(); return; }
    const map = L.map(hudMapRef.current).setView([7.0, 80.0], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
    hudMapInst.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);

    // Draw route if hazard data is available
    const pd = hzAnalysis?.path_data;
    if (pd?.length) {
      const coords = pd.map(p => [p.lat, p.lon]);
      for (let i = 0; i < coords.length - 1; i++) {
        L.polyline([coords[i], coords[i + 1]], { color: pd[i].color || "green", weight: 4, opacity: 0.8 }).addTo(map);
      }
      L.circleMarker(coords[0], { radius: 8, color: "#0b5fff", fillColor: "#0b5fff", opacity: 0.9 }).addTo(map);
      L.circleMarker(coords[coords.length - 1], { radius: 8, color: "red", fillColor: "red", opacity: 0.8 }).addTo(map);
      hudMarkerRef.current = L.marker(coords[0], {
        icon: L.divIcon({
          className: "as-vehicle-icon",
          html: '<div class="as-bus-marker"><svg viewBox="0 0 24 24" width="22" height="22" fill="white"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M3 9h18" stroke="#0b5fff" stroke-width="1" fill="none"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/><path d="M5.5 16v2M18.5 16v2" stroke="white" stroke-width="1" fill="none"/></svg></div>',
          iconSize: [36, 36], iconAnchor: [18, 18]
        })
      }).addTo(map);
      map.fitBounds(L.latLngBounds(coords), { padding: [30, 30] });
    }
    return () => { map.remove(); hudMapInst.current = null; hudMarkerRef.current = null; };
  }, [drivingMode, hzAnalysis]);

  // ── HUD map — follow bus position ──────────────────────────────────────
  useEffect(() => {
    if (!drivingMode || !hudMapInst.current || !hzPoint) return;
    if (hudMarkerRef.current) {
      hudMarkerRef.current.setLatLng([hzPoint.lat, hzPoint.lon]);
      const el = hudMarkerRef.current.getElement();
      if (el) {
        const m = el.querySelector(".as-bus-marker");
        if (m) m.className = hzPoint.risk_label === "Critical Risk" ? "as-bus-marker danger-critical" : hzPoint.risk_label === "High Risk" ? "as-bus-marker danger-high" : "as-bus-marker";
      }
    }
    hudMapInst.current.panTo([hzPoint.lat, hzPoint.lon], { animate: true, duration: 0.3 });
  }, [drivingMode, hzPoint]);

  // ── GPS map — listen for phone GPS updates and show live marker ──────
  useEffect(() => {
    // init map once
    if (gpsMapInst.current || !gpsMapRef.current) return;
    try {
      const map = L.map(gpsMapRef.current, { zoomControl: false, attributionControl: false }).setView([7.0, 80.0], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "" }).addTo(map);
      gpsMapInst.current = map;
    } catch (e) {
      console.error("GPS map init error:", e);
    }
    return () => {
      try { if (gpsMapInst.current) { gpsMapInst.current.remove(); gpsMapInst.current = null; gpsMarkerRef.current = null; } } catch(e){}
    };
  }, []);

  // ── GPS map — draw route when analysis completes ──────────────────────
  useEffect(() => {
    const map = gpsMapInst.current;
    const pd = hzAnalysis?.path_data;
    if (!map || !pd?.length) return;

    // Clear old route
    map.eachLayer(layer => {
      if (layer instanceof L.Polyline || layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        if (layer !== gpsMarkerRef.current) {
          map.removeLayer(layer);
        }
      }
    });

    // Draw colored route segments
    const coords = pd.map(p => [p.lat, p.lon]);
    for (let i = 0; i < coords.length - 1; i++) {
      L.polyline([coords[i], coords[i + 1]], {
        color: pd[i].color || "green",
        weight: 5,
        opacity: 0.8,
      }).addTo(map);
    }

    // Start and end markers
    L.circleMarker(coords[0], { radius: 10, color: "#0b5fff", fillColor: "#0b5fff", opacity: 0.9, weight: 2 })
      .bindPopup("START").addTo(map);
    L.circleMarker(coords[coords.length - 1], { radius: 10, color: "red", fillColor: "red", opacity: 0.8, weight: 2 })
      .bindPopup("END").addTo(map);

    // Critical risk markers
    pd.forEach((p, idx) => {
      if (p.risk_label === "Critical Risk" && idx % 5 === 0) {
        L.circleMarker([p.lat, p.lon], { radius: 5, color: "darkred", fillColor: "darkred", opacity: 0.7 })
          .bindPopup(`Risk: ${p.risk?.toFixed(2)}`).addTo(map);
      }
    });

    // Fit bounds
    map.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
  }, [hzAnalysis]);

  useEffect(() => {
    // connect socket and listen for gps_update
    if (gpsSocketRef.current) return;
    try {
      const sock = io(SOCKET_URL, { transports: ["websocket"], reconnectionDelayMax: 10000 });
      gpsSocketRef.current = sock;
      sock.on("connect", () => {
        // console.log("gps socket connected");
      });
      sock.on("gps_update", (data) => {
        try {
          const lat = parseFloat(data.lat);
          const lon = parseFloat(data.lon);
          if (!isFinite(lat) || !isFinite(lon)) return;
          const map = gpsMapInst.current;
          if (!map) return;
          if (!gpsMarkerRef.current) {
            gpsMarkerRef.current = L.marker([lat, lon]).addTo(map);
            map.setView([lat, lon], 14);
          } else {
            gpsMarkerRef.current.setLatLng([lat, lon]);
          }
        } catch (e) {
          // ignore
        }
      });
      sock.on("gps_raw", () => {});
    } catch (e) {
      // ignore
    }
    return () => {
      try { if (gpsSocketRef.current) { gpsSocketRef.current.disconnect(); gpsSocketRef.current = null; } } catch(e){}
    };
  }, []);

  // ── Elapsed timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!shiftStart) { setElapsed("00:00"); return; }
    const iv = setInterval(() => {
      const diff = Math.floor((Date.now()-shiftStart)/1000);
      setElapsed(`${String(Math.floor(diff/60)).padStart(2,"0")}:${String(diff%60).padStart(2,"0")}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [shiftStart]);

  // ═══════════════════════════════════════════════════════════════════════
  // ── WEBCAM (shared by emotion + drowsiness) ────────────────────────────
  useEffect(() => {
    let active = true;
    async function loadDevices() {
      try {
        // Request camera permission first (triggers browser prompt)
        try {
          await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
          console.log("[Camera Debug] Permission granted");
        } catch (permErr) {
          console.warn("[Camera Debug] Permission grant attempt:", permErr.message);
        }
        
        // Now enumerate devices
        const list = await navigator.mediaDevices.enumerateDevices();
        const cams = list.filter(d => d.kind === "videoinput");
        console.log(`[Camera Debug] Found ${cams.length} cameras:`, cams.map(c => ({id: c.deviceId, label: c.label})));
        setDevices(cams);
        // Prefer previously selected device ids, otherwise choose the first two external webcams.
        const preferredDriverId = driverDeviceId || findPreferredDriverDeviceId(cams);
        if (cams.length > 0 && !driverDeviceId) setDriverDeviceId(preferredDriverId);
        if (cams.length > 0 && !roadDeviceId) setRoadDeviceId(findPreferredRoadDeviceId(cams, preferredDriverId));
        setDevicesLoaded(true);
      } catch (e) {
        console.error("[Camera Debug] Error enumerating devices:", e);
      }
    }
    loadDevices();
    return () => {
      active = false;
    };
  }, [driverDeviceId, roadDeviceId]);

  useEffect(() => {
    if (!devicesLoaded) return;
    let active = true;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;

    async function openDriverCamera() {
      try {
        const constraint = driverDeviceId ? { deviceId: { exact: driverDeviceId } } : { facingMode: "user" };
        const s = await navigator.mediaDevices.getUserMedia({ video: { ...constraint, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!active) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        if (videoRefEmotionDisplay.current) videoRefEmotionDisplay.current.srcObject = s;
        if (videoRefDrowsinessDisplay.current) videoRefDrowsinessDisplay.current.srcObject = s;
        setCamError("");
      } catch {
        setCamError("Driver camera not available or permission denied.");
      }
    }

    openDriverCamera();
    return () => { active = false; };
  }, [driverDeviceId, devicesLoaded]);

  useEffect(() => {
    if (!devicesLoaded) return;
    let active = true;
    if (streamRef2.current) {
      streamRef2.current.getTracks().forEach(t => t.stop());
      streamRef2.current = null;
    }
    if (videoRef2.current) videoRef2.current.srcObject = null;

    async function openRoadCamera() {
      try {
        const constraint = roadDeviceId ? { deviceId: { exact: roadDeviceId } } : { facingMode: "environment" };
        const s2 = await navigator.mediaDevices.getUserMedia({ video: { ...constraint, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!active) { s2.getTracks().forEach(t => t.stop()); return; }
        streamRef2.current = s2;
        if (videoRef2.current) videoRef2.current.srcObject = s2;
        if (videoRefRoadSignDisplay.current) videoRefRoadSignDisplay.current.srcObject = s2;
        if (videoRefRoadSceneDisplay.current) videoRefRoadSceneDisplay.current.srcObject = s2;
        setCam2Error("");
      } catch {
        // Fallback: try any remaining external camera other than the driver selection.
        try {
          const externalDevices = getExternalCameras(devices);
          const fallback = externalDevices.find(d => d.deviceId !== driverDeviceId) || devices.find(d => d.deviceId !== driverDeviceId);
          if (fallback?.deviceId) {
            const s2 = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: fallback.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
            if (!active) { s2.getTracks().forEach(t => t.stop()); return; }
            streamRef2.current = s2;
            if (videoRef2.current) videoRef2.current.srcObject = s2;
            if (videoRefRoadSignDisplay.current) videoRefRoadSignDisplay.current.srcObject = s2;
            if (videoRefRoadSceneDisplay.current) videoRefRoadSceneDisplay.current.srcObject = s2;
            setCam2Error("");
            return;
          }
        } catch {
          // fall through to error below
        }
        setCam2Error("Road camera not available or permission denied.");
      }
    }

    openRoadCamera();
    return () => { active = false; };
  }, [roadDeviceId, devicesLoaded, driverDeviceId, devices]);

  const handleEnableCamera = async () => {
    try {
      console.log("[Camera] Requesting permission...");
      
      // Try with different constraints
      let stream = null;
      const constraints = [
        { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        { video: { facingMode: "user" }, audio: false },
        { video: true, audio: false }
      ];
      
      for (const constraint of constraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraint);
          console.log("[Camera] Permission granted with constraint:", constraint);
          break;
        } catch (e) {
          console.log("[Camera] Constraint failed, trying next:", e.message);
        }
      }
      
      if (!stream) throw new Error("No camera constraint worked");
      
      stream.getTracks().forEach(t => t.stop());
      
      // Refresh device list
      setTimeout(async () => {
        const list = await navigator.mediaDevices.enumerateDevices();
        const cams = list.filter(d => d.kind === "videoinput");
        console.log(`[Camera] Found ${cams.length} cameras after permission:`, cams.map(c => ({id: c.deviceId, label: c.label})));
        setDevices(cams);
        if (cams.length > 0 && !driverDeviceId) setDriverDeviceId(cams[0].deviceId);
      }, 500);
    } catch (err) {
      console.error("[Camera] Error:", err);
      alert(`❌ Camera Error: ${err.message}\n\n✅ Fix:\n1. Close Skype/Teams/Zoom\n2. Enable camera in Windows Settings\n3. Check Device Manager for drivers`);
    }
  };

  // Re-assign camera stream when video element appears (shift started)
  useEffect(() => {
    if (shiftActive && videoRef.current && streamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
    }
    if (shiftActive && videoRef2.current && streamRef2.current && !videoRef2.current.srcObject) {
      videoRef2.current.srcObject = streamRef2.current;
    }
  }, [shiftActive]);

  // Propagate driver stream to display refs
  useEffect(() => {
    if (streamRef.current) {
      if (videoRefEmotionDisplay.current && !videoRefEmotionDisplay.current.srcObject) {
        videoRefEmotionDisplay.current.srcObject = streamRef.current;
      }
      if (videoRefDrowsinessDisplay.current && !videoRefDrowsinessDisplay.current.srcObject) {
        videoRefDrowsinessDisplay.current.srcObject = streamRef.current;
      }
    }
  }, [streamRef.current]);

  // Propagate road stream to display refs
  useEffect(() => {
    if (streamRef2.current) {
      if (videoRefRoadSignDisplay.current && !videoRefRoadSignDisplay.current.srcObject) {
        videoRefRoadSignDisplay.current.srcObject = streamRef2.current;
      }
      if (videoRefRoadSceneDisplay.current && !videoRefRoadSceneDisplay.current.srcObject) {
        videoRefRoadSceneDisplay.current.srcObject = streamRef2.current;
      }
    }
  }, [streamRef2.current]);

  // ═══════════════════════════════════════════════════════════════════════
  // ── EMOTION Socket ─────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, {transports:["polling","websocket"]});
    emSocketRef.current = socket;
    socket.on("connect",    ()=>setEmConnected(true));
    socket.on("disconnect", ()=>setEmConnected(false));
    socket.on("prediction", payload => {
      if (payload?.ok===false) return;
      setEmResult(payload);
      setEmFrames(c=>c+1);
      // Accumulate BVI for scoring
      if (payload?.bvi?.bvi_score != null) {
        bviSumRef.current += payload.bvi.bvi_score;
        bviCountRef.current += 1;
      }
      // Count cheating/distraction frames
      if (payload?.objects?.cheating) {
        cheatCountRef.current += 1;
      }
    });
    return () => { if(emSendIvRef.current) clearInterval(emSendIvRef.current); socket.disconnect(); };
  }, []);

  // Emotion frame send loop — only when shift active
  useEffect(() => {
    if (!shiftActive) { if(emSendIvRef.current) clearInterval(emSendIvRef.current); return; }
    emSendIvRef.current = setInterval(()=>{
      const v=videoRef.current, c=captureRef.current, s=emSocketRef.current;
      if(!v||!c||!s||v.readyState<2) return;
      const ctx=c.getContext("2d"); c.width=320; c.height=240;
      ctx.drawImage(v,0,0,320,240);
      s.emit("frame",{driver_id:driverId,image:c.toDataURL("image/jpeg",0.70),client_ts:Date.now()});
    }, 300);
    return () => clearInterval(emSendIvRef.current);
  }, [shiftActive, driverId]);

  // ═══════════════════════════════════════════════════════════════════════
  // ── DROWSINESS Socket ──────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, {transports:["polling","websocket"]});
    dwSocketRef.current = socket;
    socket.on("connect",    ()=>setDwConnected(true));
    socket.on("disconnect", ()=>setDwConnected(false));
    socket.on("drowsiness_result", payload => {
      dwInFlight.current = false;
      if (!payload?.ok) return;
      setDwResult(payload);
      setDwFrames(c=>c+1);
      if (payload.verdict==="Drowsy") setDwDrowsyFrames(c=>c+1);
      if (payload.alert) setDwAlerts(c=>c+1);
    });
    return () => { if(dwSendIvRef.current) clearInterval(dwSendIvRef.current); socket.disconnect(); };
  }, []);

  // Drowsiness frame send loop — only when shift active
  useEffect(() => {
    if (!shiftActive) { if(dwSendIvRef.current) clearInterval(dwSendIvRef.current); return; }
    dwSendIvRef.current = setInterval(()=>{
      const v=videoRef.current, c=captureRef.current, s=dwSocketRef.current;
      if(!v||!c||!s||!s.connected||v.readyState<2) return;
      if (dwInFlight.current) return;
      const ctx=c.getContext("2d"); c.width=640; c.height=480;
      ctx.drawImage(v,0,0,640,480);
      dwInFlight.current = true;
      s.emit("drowsiness_frame",{image:c.toDataURL("image/jpeg",0.80),session_id:dwSessionId,client_ts:Date.now()});
    }, 200);
    return () => { clearInterval(dwSendIvRef.current); dwInFlight.current=false; };
  }, [shiftActive, dwSessionId]);

  // ═══════════════════════════════════════════════════════════════════════
  // ── ROAD CAMERA: send frames to RSA and Road-Sign upload endpoints ──────
  useEffect(() => {
    if (!shiftActive) return;
    let iv = null;
    const sendFrame = async () => {
      const v = videoRef2.current, c = captureRef2.current;
      if (!v || !c || v.readyState < 2) return;
      c.width = 640; c.height = 480;
      const ctx = c.getContext("2d");
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const blob = await new Promise(res => c.toBlob(res, "image/jpeg", 0.8));
      if (!blob) return;
      try {
        const form = new FormData();
        form.append("file", blob, "frame.jpg");
        // Send to RSA analyse (scene analysis)
        fetch(`${API}/rsa/analyse`, { method: "POST", body: form }).then(r=>r.json()).then(data=>{
          if (data && !data.error) {
            const mappedFrame = {
              original: data.original,
              overlay: data.overlay,
              segments: data.segments || [],
              hazard: data.hazard || null,
            };
            setRsResult({ scene_latest: mappedFrame, frames: [mappedFrame] });
          }
        }).catch(()=>{});
        // Send to road-sign upload endpoint (if exists)
        fetch(`${API}/upload`, { method: "POST", body: form }).then(r=>r.json()).then(data=>{
          if (data && !data.error) {
            setRsSignInfo(data.class_name ? data : null);
            if (data.class_name && data.status === "Normal") {
              setRsSignLog(prev => [ { class_name: data.class_name, confidence: data.confidence, status: data.status, time: new Date().toLocaleTimeString() }, ...prev.slice(0,19) ]);
            }
          }
        }).catch(()=>{});
      } catch (e) {}
    };
    iv = setInterval(sendFrame, 1500);
    return () => clearInterval(iv);
  }, [shiftActive]);

  // ═══════════════════════════════════════════════════════════════════════
  // ── ROAD SIGN — Poll detection info when shift active ──────────────────
  useEffect(() => {
    if (!shiftActive) {
      if (rsSignPollRef.current) clearInterval(rsSignPollRef.current);
      return;
    }
    rsSignPollRef.current = setInterval(() => {
      fetch(`${API}/get_detection_info`)
        .then(r => r.json())
        .then(data => {
          const hasSign = data?.class_name;
          setRsSignInfo(hasSign ? data : null);
          if (hasSign && data.status === "Normal" && rsSignLastRef.current !== data.class_name) {
            rsSignLastRef.current = data.class_name;
            setRsSignLog(prev => [
              { class_name: data.class_name, confidence: data.confidence, status: data.status, time: new Date().toLocaleTimeString() },
              ...prev.slice(0, 19),
            ]);
          } else if (!hasSign) {
            rsSignLastRef.current = null;
          }
        })
        .catch(() => {});
    }, 400);

    return () => {
      clearInterval(rsSignPollRef.current);
    };
  }, [shiftActive, API]);

  // ═══════════════════════════════════════════════════════════════════════
  // ── HAZARD — Auto-analyze route on shift start ─────────────────────────
  async function analyzeRoute() {
    setHzLoading(true); setHzError(""); setHzAnalysis(null);
    try {
      const res = await fetch(`${API}/api/analyze-route`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({start_location:startTown,end_location:endTown,step_m:5}),
      });
      let data = await res.json();
      
      // Fallback to demo route if real analysis fails
      if (!res.ok||data.error) {
        console.log("Real route analysis failed, using demo route...");
        const demoRes = await fetch(`${API}/api/analyze-route-demo`);
        data = await demoRes.json();
        if (!demoRes.ok||data.error) { setHzError("Route analysis failed."); return; }
      }
      
      setHzAnalysis(data);
      // Start real GPS tracking from device
      startRealGpsTracking();
    } catch { 
      setHzError("Network error — backend not reachable."); 
    }
    finally { setHzLoading(false); }
  }

  // Initialize Leaflet map — depends on shiftActive + activePanel so the container exists
  useEffect(() => {
    if (!hzMapRef.current || hzMapInstance.current) return;
    const map = L.map(hzMapRef.current).setView([7.0,80.0],8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      attribution:"© OpenStreetMap"
    }).addTo(map);
    hzMapInstance.current = map;
    // Leaflet needs a size recalc after the container becomes visible
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);
    return () => { if(hzAnimRef.current) clearInterval(hzAnimRef.current); };
  }, [shiftActive, activePanel]);

  // Initialize Live GPS Map (for All Panels view)
  useEffect(() => {
    if (!liveGpsMapRef.current || !shiftActive || activePanel !== "all") return;
    if (liveGpsMapInstance.current) return; // Already initialized
    
    const map = L.map(liveGpsMapRef.current).setView([7.0, 80.0], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap"
    }).addTo(map);
    liveGpsMapInstance.current = map;
    // Add vehicle marker (div icon)
    liveGpsMarkerRef.current = L.marker([7.0, 80.0], {
      icon: L.divIcon({
        className: "as-vehicle-icon",
        html: '<div class="as-bus-marker"><svg viewBox="0 0 24 24" width="22" height="22" fill="white"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M3 9h18" stroke="#0b5fff" stroke-width="1" fill="none"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/><path d="M5.5 16v2M18.5 16v2" stroke="white" stroke-width="1" fill="none"/></svg></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      })
    }).addTo(map).bindPopup("Your Location");
    
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);
  }, [shiftActive, activePanel]);

  // Invalidate map size whenever the panel visibility changes
  useEffect(() => {
    if (hzMapInstance.current && shiftActive) {
      setTimeout(() => hzMapInstance.current.invalidateSize(), 150);
    }
    if (liveGpsMapInstance.current && shiftActive && activePanel === "all") {
      setTimeout(() => liveGpsMapInstance.current.invalidateSize(), 150);
    }
  }, [shiftActive, activePanel]);

  // Draw route on map when analysis completes
  useEffect(() => {
    const map = hzMapInstance.current;
    const pd = hzAnalysis?.path_data;
    if (!map||!pd?.length) return;

    map.eachLayer(layer => {
      if (layer instanceof L.Polyline||layer instanceof L.Marker||layer instanceof L.CircleMarker)
        map.removeLayer(layer);
    });
    if (hzAnimRef.current) clearTimeout(hzAnimRef.current);
    setHzIdx(0); setHzPoint(null); setHzPlaying(false); setHzFinished(false);

    const coords = pd.map(p=>[p.lat,p.lon]);
    for (let i=0;i<coords.length-1;i++) {
      L.polyline([coords[i],coords[i+1]],{color:pd[i].color||"green",weight:4,opacity:0.8}).addTo(map);
    }
    // Start/End markers
    L.circleMarker(coords[0],{radius:8,color:"#0b5fff",fillColor:"#0b5fff",opacity:0.9}).bindPopup("START").addTo(map);
    L.circleMarker(coords[coords.length-1],{radius:8,color:"red",fillColor:"red",opacity:0.8}).bindPopup("END").addTo(map);
    // Critical points
    pd.forEach((p,idx) => {
      if (p.risk_label==="Critical Risk"&&idx%3===0)
        L.circleMarker([p.lat,p.lon],{radius:4,color:"darkred",fillColor:"darkred",opacity:0.7}).addTo(map);
    });
    // Vehicle marker — large bus icon
    hzMarkerRef.current = L.marker(coords[0],{
      icon:L.divIcon({
        className:"as-vehicle-icon",
        html:'<div class="as-bus-marker"><svg viewBox="0 0 24 24" width="22" height="22" fill="white"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M3 9h18" stroke="#0b5fff" stroke-width="1" fill="none"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/><path d="M5.5 16v2M18.5 16v2" stroke="white" stroke-width="1" fill="none"/></svg></div>',
        iconSize:[36,36],iconAnchor:[18,18]
      })
    }).addTo(map);
    map.fitBounds(L.latLngBounds(coords),{padding:[30,30]});
    setTimeout(()=>map.invalidateSize(),200);

    // Auto-start playback after route is drawn
    setTimeout(() => {
      setHzPlaying(true);
    }, 800);
  }, [hzAnalysis]);

  // Hazard animation loop — skip points for smooth movement on large routes
  const getStepSize = useCallback((pd, pt) => {
    if (!pd) return 1;
    // Slow down to step=1 in danger zones so user sees every point
    if (pt?.risk_label === "Critical Risk" || pt?.risk_label === "High Risk") return 1;
    if (pd.length > 5000) return 8;
    if (pd.length > 2000) return 4;
    if (pd.length > 500) return 2;
    return 1;
  }, []);

  const getDelay = useCallback((pt) => {
    if(!pt) return 40;
    switch(pt.risk_label) {
      case "Critical Risk":return 500; case "High Risk":return 300; case "Medium Risk":return 60; default:return 30;
    }
  }, []);

  // Track previous risk level to detect zone entry
  const prevRiskRef = useRef(null);

  useEffect(() => {
    const pd=hzAnalysis?.path_data;
    if(!hzPlaying||!pd) return;
    if(hzIdx>=pd.length) { setHzPlaying(false);setHzFinished(true);setHzIdx(pd.length-1); return; }
    const pt=pd[hzIdx];
    setHzPoint(pt);

    const isDanger = pt.risk_label === "Critical Risk" || pt.risk_label === "High Risk";
    const wasDanger = prevRiskRef.current === "Critical Risk" || prevRiskRef.current === "High Risk";


    prevRiskRef.current = pt.risk_label;

    // Update bus marker style in danger zones
    if(hzMarkerRef.current) {
      hzMarkerRef.current.setLatLng([pt.lat,pt.lon]);
      const el = hzMarkerRef.current.getElement();
      if (el) {
        const marker = el.querySelector('.as-bus-marker');
        if (marker) {
          if (pt.risk_label === "Critical Risk") {
            marker.className = 'as-bus-marker danger-critical';
          } else if (pt.risk_label === "High Risk") {
            marker.className = 'as-bus-marker danger-high';
          } else {
            marker.className = 'as-bus-marker';
          }
        }
      }
      // Follow camera — smoothly pan map to keep vehicle centered
      const map = hzMapInstance.current;
      if (map) {
        map.panTo([pt.lat, pt.lon], { animate: true, duration: 0.3, noMoveStart: true });
        if (hzIdx < 3 && map.getZoom() < 13) map.setZoom(13, { animate: true });
      }
    }
    const step = getStepSize(pd, pt);
    hzAnimRef.current=setTimeout(()=>setHzIdx(i=>Math.min(i+step, pd.length)),getDelay(pt));
    return()=>{if(hzAnimRef.current) clearTimeout(hzAnimRef.current);};
  },[hzPlaying,hzIdx,hzAnalysis,getDelay,getStepSize]);

  // ═══════════════════════════════════════════════════════════════════════
  // ── Road Scene upload & analysis ───────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════
  // Real GPS Tracking - send live location updates from device
  const gpsSimulatorRef = useRef(null);
  const liveGpsMapRef = useRef(null);
  const liveGpsMarkerRef = useRef(null);

  function startRealGpsTracking() {
    // Stop any existing GPS listener
    if (gpsSimulatorRef.current) {
      if (gpsSimulatorRef.current.disconnect) {
        gpsSimulatorRef.current.disconnect();
      }
      gpsSimulatorRef.current = null;
    }
    
    // Connect to Socket.IO to receive live GPS updates from GPS2IP Lite (iPhone)
    const gpsSocket = io(SOCKET_URL, { transports: ["polling", "websocket"] });
    gpsSimulatorRef.current = gpsSocket;
    
    gpsSocket.on("connect", () => {
      console.log("Connected to GPS2IP stream");
    });
    
    gpsSocket.on("gps_update", (payload) => {
      console.debug("gps_update raw", payload);
      // payload may include _lat_raw/_lon_raw from backend for debugging
      const normalizeGps = (p) => {
        if (!p) return null;
        let lat = Number(p.lat);
        let lon = Number(p.lon);
        if (Number.isNaN(lat) || Number.isNaN(lon)) {
          // try raw fallbacks
          if (p._lat_raw) lat = parseFloat(p._lat_raw) || lat;
          if (p._lon_raw) lon = parseFloat(p._lon_raw) || lon;
        }
        // If values still not numbers, give up
        if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

        // Detect swapped lat/lon: lat must be within [-90,90], lon within [-180,180]
        const absLat = Math.abs(lat), absLon = Math.abs(lon);
        if (absLat > 90 && absLon <= 90) {
          // likely swapped
          const tmp = lat; lat = lon; lon = tmp;
        } else if (absLon > 180 && absLat <= 180 && absLat <= 90) {
          // lon invalid but lat looks like lon; try swap
          const tmp = lat; lat = lon; lon = tmp;
        }

        // Final sanity check
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
        return { lat, lon };
      };

      const np = normalizeGps(payload);
      console.debug("gps_update normalized", np);
      if (!np) {
        console.warn("Invalid gps_update payload, ignoring:", payload);
        return;
      }

      // Update vehicle marker position on hazard map in real-time
      if (hzMarkerRef.current) {
        hzMarkerRef.current.setLatLng([np.lat, np.lon]);
      }
      // Update live GPS map marker (for All Panels view)
      if (liveGpsMarkerRef.current && liveGpsMapInstance.current) {
        liveGpsMarkerRef.current.setLatLng([np.lat, np.lon]);
        // Center map on vehicle
        liveGpsMapInstance.current.setView([np.lat, np.lon], 16);
      }
    });
    
    gpsSocket.on("error", (err) => {
      console.error("GPS stream error:", err);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ── START / STOP SHIFT ─────────────────────────────────────────────────
  async function handleStartShift() {
    try {
      await fetch(`${API}/api/driver/shift/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          schedule_id: scheduleId,
          shift_time: scheduleInfo.shift_time || "",
          date: scheduleInfo.date || "",
          start_town: startTown,
          end_town: endTown,
          bus: busId,
          route_name: routeName,
          route: `${startTown} → ${endTown}`,
        }),
      });
    } catch {}
    setShiftActive(true);
    setActivePanel("hazard");
    setShiftStart(Date.now());
    setEmFrames(0); setDwFrames(0); setDwAlerts(0); setDwDrowsyFrames(0);
    bviSumRef.current = 0; bviCountRef.current = 0; cheatCountRef.current = 0;
    setShiftScore(null);
    // Auto-start hazard analysis; road-scene frames come from the live road camera
    analyzeRoute();
    // Start real GPS tracking from device
    startRealGpsTracking();
  }

  async function handleEndShift() {
    // Stop GPS tracking
    if (gpsSimulatorRef.current) {
      if (gpsSimulatorRef.current.disconnect) {
        gpsSimulatorRef.current.disconnect();
      }
      gpsSimulatorRef.current = null;
    }
    
    // Compute & send score before navigating away
    const durationSec = shiftStart ? Math.round((Date.now() - shiftStart) / 1000) : 0;
    const avgBvi = bviCountRef.current > 0 ? bviSumRef.current / bviCountRef.current : null;
    const avgSceneHazard = rsResult?.frames?.length
      ? rsResult.frames.reduce((s, f) => s + (f.hazard?.score || 0), 0) / rsResult.frames.length
      : null;
    const signLog = rsSignLog || [];
    const normalSigns = signLog.filter(s => s.status === "Normal").length;
    const damagedSigns = signLog.filter(s => s.status !== "Normal").length;

    const metrics = {
      schedule_id: scheduleId,
      shift_time: scheduleInfo.shift_time || "",
      date: scheduleInfo.date || "",
      start_town: startTown,
      end_town: endTown,
      bus: busId,
      route_name: routeName,
      route: `${startTown} → ${endTown}`,
      duration_sec: durationSec,
      em_frames: emFrames,
      avg_bvi: avgBvi != null ? Math.round(avgBvi * 1000) / 1000 : null,
      cheat_frames: cheatCountRef.current,
      dw_frames: dwFrames,
      dw_drowsy_frames: dwDrowsyFrames,
      dw_alerts: dwAlerts,
      signs_detected: normalSigns,
      damaged_signs: damagedSigns,
      avg_scene_hazard: avgSceneHazard != null ? Math.round(avgSceneHazard * 100) / 100 : null,
    };

    try {
      const res = await fetch(`${API}/api/driver/shift/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(metrics),
      });
      const scoreData = await res.json();
      if (res.ok) setShiftScore(scoreData);
    } catch {}

    try {
      await fetch(`${API}/api/driver/shift/stop`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch {}
    // Stop demo video
    setShiftActive(false); setShiftStart(null);
    setEmResult(null); setDwResult(null);
    setRsSignInfo(null); setRsSignLog([]);
    setHzPlaying(false);
    // Don't navigate yet — modal will show
  }

  function handleScoreClose() {
    setShiftScore(null);
    navigate("/driver/schedule");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ── Derived values ─────────────────────────────────────────────────────
  const emotion = emResult?.emotion;
  const emoColor = EMOTION_COLOR[(emotion||"").toLowerCase()]||"#64748b";
  const bvi     = emResult?.bvi;
  const bviScore = bvi?.bvi_score??null;
  const probs    = emResult?.probabilities||{};
  const cheating = Boolean(emResult?.objects?.cheating);

  const dwVerdict  = dwResult?.verdict;
  const dwConf     = dwResult?.confidence;
  const dwFeatures = dwResult?.features||{};
  const dwStreak   = dwResult?.consecutive_frames??0;

  const rsFrame = rsResult?.frames?.[rsActiveIdx];
  const liveSceneFrame = rsResult?.scene_latest
    ? {
        overlay: rsResult.scene_latest.overlay || rsResult.scene_latest.original,
        hazard: rsResult.scene_latest.hazard || { level: rsResult.scene_latest.hazard_level, score: rsResult.scene_latest.hazard_score },
        segments: rsResult.scene_latest.segments || [],
      }
    : null;
  const activeSceneFrame = rsFrame || liveSceneFrame;
  const rsHazardLevel = activeSceneFrame?.hazard?.level;

  const pd = hzAnalysis?.path_data;
  const hzProgress = pd?.length>1 ? (hzIdx/(pd.length-1))*100 : 0;

  // ═══════════════════════════════════════════════════════════════════════
  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <div className="dd-root">
      <Sidebar activeKey="schedule"/>

      <main className="as-main">
        {/* ── Top bar ──────────────────────────────────────────── */}
        <header className="as-topbar">
          <div className="as-topbar-left">
            <button className="as-back-btn" onClick={()=>navigate("/driver/schedule")}>← Back</button>
            <span className="as-topbar-title">Active Shift Monitor</span>
          </div>
          <div className="as-topbar-center">
            <span className="as-route-badge">{startTown} → {endTown}</span>
            <span className="as-route-meta">{routeName} · {busId}</span>
          </div>
          <div className="as-topbar-right">
            {shiftActive && <span className="as-elapsed">⏱ {elapsed}</span>}
            <div className={`as-status-pill ${shiftActive?"active":""}`}>
              <span className="as-status-dot"/>
              {shiftActive?"SHIFT ACTIVE":"READY"}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div className="as-avatar">{(user.username||"D")[0].toUpperCase()}</div>
                <div style={{display:"flex",gap:8,alignItems:"center"}} className="as-cam-selects">
                  <label style={{fontSize:12,color:'#94a3b8'}}>Driver</label>
                  <select value={driverDeviceId||""} onChange={e=>setDriverDeviceId(e.target.value)} style={{background:'#071025',color:'#e2e8f0',border:'1px solid #243447',padding:'4px',borderRadius:6}}>
                    <option value="">Default</option>
                    {devices.map((d,i)=>(<option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>))}
                  </select>
                  <label style={{fontSize:12,color:'#94a3b8'}}>Road</label>
                  <select value={roadDeviceId||""} onChange={e=>setRoadDeviceId(e.target.value)} style={{background:'#071025',color:'#e2e8f0',border:'1px solid #243447',padding:'4px',borderRadius:6}}>
                    <option value="">None</option>
                    {devices.map((d,i)=>(<option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>))}
                  </select>
                  <button onClick={handleEnableCamera} style={{background:'#0b5fff',color:'white',border:'none',padding:'4px 12px',borderRadius:6,fontSize:12,cursor:'pointer',fontWeight:600}}>🎥 Enable</button>
                </div>
              </div>
            </div>
            <div style={{marginLeft:12}}>
              <div ref={gpsMapRef} style={{width:160,height:96,borderRadius:8,overflow:'hidden',border:'1px solid #243447'}} />
            </div>
          </div>
        </header>

        {/* ── Shift control banner ─────────────────────────────── */}
        {!shiftActive ? (
          <div className="as-start-banner">
            <div className="as-start-info">
              <h2>Ready to Start Shift</h2>
              <p>{startTown} → {endTown} · {routeName} · {busId}</p>
              <p className="as-start-hint">
                Starting the shift will activate all monitoring systems: Emotion Detection, Drowsiness Monitor,
                Road Scene Analysis (manual video upload), and Hazard Analysis for the route.
              </p>
            </div>
            <button className="as-start-shift-btn" onClick={handleStartShift}>
              ▶ START SHIFT
            </button>
          </div>
        ) : (
          <div className="as-active-banner">
            <div className="as-active-left">
              <span className="as-live-dot"/>
              <span>Shift in progress — all systems active</span>
              <span className="as-active-meta">
                Emotion: {emFrames} frames · Drowsiness: {dwFrames} frames · Alerts: {dwAlerts}
              </span>
            </div>
            <button className="as-end-btn" onClick={handleEndShift}><IcoStop/> END SHIFT</button>
            <button className="as-drive-mode-btn" onClick={()=>setDrivingMode(true)}>🚗 Driving Mode</button>
          </div>
        )}

        {/* ── Panel selector tabs ──────────────────────────────── */}
        {shiftActive && (
          <div className="as-panel-tabs">
            {[
              {key:"all",label:"All Panels"},
              {key:"emotion",label:"Emotion"},
              {key:"drowsiness",label:"Drowsiness"},
              {key:"roadsign",label:"Road Sign"},
              {key:"roadscene",label:"Road Scene"},
              {key:"hazard",label:"Hazard"},
            ].map(t=>(
              <button key={t.key}
                className={`as-panel-tab ${activePanel===t.key?"active":""}`}
                onClick={()=>setActivePanel(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Four live analyzer camera feeds */}
        {shiftActive && activePanel !== "hazard" && (
          <div className="as-camera-grid" style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:"0.75rem",padding:"0 1.25rem 1rem"}}>
            {/* Emotion Camera Feed */}
            <div className="as-panel as-camera-panel" style={{padding:"0.75rem"}}>
              <div className="as-panel-head" style={{marginBottom:"0.5rem"}}>
                <span className="as-panel-title" style={{fontSize:"0.9rem"}}>😊 Emotion</span>
                <span className={`as-badge ${emConnected?"green":"gray"}`} style={{fontSize:"0.75rem"}}>
                  {emConnected ? "Live" : "Waiting"}
                </span>
              </div>
              {camError && <div className="as-cam-error">{camError}</div>}
              <div className="as-cam-wrap">
                <video ref={videoRefEmotionDisplay} autoPlay playsInline muted className="as-cam-video" style={{transform:"scaleX(-1)", borderRadius:"0.5rem"}}/>
              </div>
              {/* Full Emotion analysis panel (duplicated) */}
              <div className="as-em-body" style={{marginTop:"0.5rem"}}>
                <div className="as-em-gauge-row" style={{alignItems:"flex-start"}}>
                  <MiniGauge value={bviScore} label={bvi?.state||"Waiting"} color={bviColor(bviScore)} size={70}/>
                  <div className="as-em-metrics" style={{marginLeft:12}}>
                    <div className="as-metric-row"><span>BVI</span><span style={{color:bviColor(bviScore)}}>{bviScore?.toFixed(3)??"—"}</span></div>
                    <div className="as-metric-row"><span>Transition</span><span>{bvi?.transition_rate?.toFixed(3)??"—"}</span></div>
                    <div className="as-metric-row"><span>Entropy</span><span>{bvi?.entropy?.toFixed(3)??"—"}</span></div>
                  </div>
                </div>

                {Object.keys(probs).length>0 ? (
                  <div className="as-probs" style={{marginTop:8}}>
                    {Object.entries(probs).sort(([,a],[,b])=>b-a).map(([lbl,val])=>(
                      <ProbBar key={lbl} label={lbl.charAt(0).toUpperCase()+lbl.slice(1)} value={val}
                        color={EMOTION_COLOR[lbl.toLowerCase()]||"#64748b"}/>
                    ))}
                  </div>
                ) : <p className="as-no-data">Waiting for predictions…</p>}
              </div>
            </div>

            {/* Drowsiness Camera Feed */}
            <div className="as-panel as-camera-panel" style={{padding:"0.75rem"}}>
              <div className="as-panel-head" style={{marginBottom:"0.5rem"}}>
                <span className="as-panel-title" style={{fontSize:"0.9rem"}}>😴 Drowsiness</span>
                <span className={`as-badge ${dwConnected?"blue":"gray"}`} style={{fontSize:"0.75rem"}}>
                  {dwConnected ? "Live" : "Waiting"}
                </span>
              </div>
              {camError && <div className="as-cam-error">{camError}</div>}
              <div className="as-cam-wrap">
                <video ref={videoRefDrowsinessDisplay} autoPlay playsInline muted className="as-cam-video" style={{transform:"scaleX(-1)", borderRadius:"0.5rem"}}/>
              </div>
              {/* Full Drowsiness analysis panel (duplicated) */}
              <div className="as-dw-body" style={{marginTop:"0.5rem"}}>
                <div className="as-dw-gauge-row">
                  <MiniGauge value={dwConf} label={dwVerdict||"Waiting"} color={verdictColor(dwVerdict)} size={70}/>
                  <div className="as-dw-right" style={{marginLeft:12}}>
                    <div className="as-dw-streak-label">Alert Streak</div>
                    <StreakBar count={dwStreak} threshold={CONSECUTIVE_THRESHOLD}/>
                  </div>
                </div>

                <div className="as-feat-row" style={{marginTop:8}}>
                  <FeatChip label="EAR" value={dwFeatures.ear?.toFixed(2)} unit="" warn={dwFeatures.ear<0.22}/>
                  <FeatChip label="MAR" value={dwFeatures.mar?.toFixed(2)} unit="" warn={dwFeatures.mar>0.65}/>
                  <FeatChip label="Pitch" value={dwFeatures.pitch?.toFixed(1)} unit="°" warn={Math.abs(dwFeatures.pitch||0)>25}/>
                </div>
              </div>
            </div>

            {/* Road Sign Camera Feed */}
            <div className="as-panel as-camera-panel" style={{padding:"0.75rem"}}>
              <div className="as-panel-head" style={{marginBottom:"0.5rem"}}>
                <span className="as-panel-title" style={{fontSize:"0.9rem"}}>🚦 Road Sign</span>
                <span className={`as-badge ${rsSignInfo?"green":"gray"}`} style={{fontSize:"0.75rem"}}>
                  {rsSignInfo ? "Detected" : "Scanning"}
                </span>
              </div>
              {cam2Error && <div className="as-cam-error">{cam2Error}</div>}
              <div className="as-cam-wrap">
                <video ref={videoRefRoadSignDisplay} autoPlay playsInline muted className="as-cam-video" style={{transform:"scaleX(-1)", borderRadius:"0.5rem"}}/>
              </div>
              {/* Full Road Sign analysis panel (duplicated) */}
              <div className="as-rsign-body" style={{marginTop:"0.5rem"}}>
                <div className="as-rsign-stream-wrap">
                  <div className="as-rsign-no-stream">
                    <p>Live road feed is shown above</p>
                    <p style={{fontSize:"0.7rem",color:"#475569"}}>Road sign detection uses the road camera feed in the top row</p>
                  </div>
                </div>

                {rsSignInfo ? (() => {
                  const instr = getSignInstruction(rsSignInfo.class_name);
                  const pc = instr ? PRIORITY_COLORS[instr.priority] : null;
                  return (
                    <div className="as-rsign-detection" style={pc ? {background:pc.bg, borderColor:pc.border} : {}}>
                      <div className="as-rsign-det-head">
                        <span className="as-rsign-det-icon">{instr?.icon || "🔍"}</span>
                        <div>
                          <div className="as-rsign-det-name">{rsSignInfo.class_name.replace(/_/g," ")}</div>
                          <div className="as-rsign-det-conf">{(rsSignInfo.confidence*100).toFixed(0)}% confidence · {rsSignInfo.status}</div>
                        </div>
                        {instr && (
                          <span className="as-rsign-priority" style={{background:pc?.badge}}>
                            {instr.priorityLabel}
                          </span>
                        )}
                      </div>
                      {instr?.instructions && (
                        <ul className="as-rsign-instructions">
                          {instr.instructions.map((ins,i) => <li key={i}>{ins}</li>)}
                        </ul>
                      )}
                    </div>
                  );
                })() : (
                  <div className="as-rsign-no-detect">
                    <span style={{fontSize:"1.5rem"}}>👁</span>
                    <p>Scanning for road signs…</p>
                  </div>
                )}

                {rsSignLog.length > 0 && (
                  <div className="as-rsign-log">
                    <div className="as-rsign-log-title">Recent Detections</div>
                    {rsSignLog.slice(0,5).map((entry,i) => (
                      <div key={i} className="as-rsign-log-row">
                        <span className="as-rsign-log-name">{entry.class_name.replace(/_/g," ")}</span>
                        <span className="as-rsign-log-conf">{(entry.confidence*100).toFixed(0)}%</span>
                        <span className="as-rsign-log-time">{entry.time}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Road Scene Camera Feed */}
            <div className="as-panel as-camera-panel" style={{padding:"0.75rem"}}>
              <div className="as-panel-head" style={{marginBottom:"0.5rem"}}>
                <span className="as-panel-title" style={{fontSize:"0.9rem"}}>🛣 Road Scene</span>
                <span className={`as-badge ${rsResult?"green":"gray"}`} style={{fontSize:"0.75rem"}}>
                  {rsResult ? "Analyzing" : "Waiting"}
                </span>
              </div>
              {cam2Error && <div className="as-cam-error">{cam2Error}</div>}
              <div className="as-cam-wrap">
                <video ref={videoRefRoadSceneDisplay} autoPlay playsInline muted className="as-cam-video" style={{transform:"scaleX(-1)", borderRadius:"0.5rem"}}/>
              </div>
              {/* Full Road Scene analysis panel (duplicated) */}
              <div className="as-rs-body" style={{marginTop:"0.5rem"}}>
                {!rsResult && !rsLoading && (
                  <div className="as-rs-upload">
                    <p style={{color:"#94a3b8",textAlign:"center"}}>Road-scene analysis will follow the live road camera during the shift.</p>
                  </div>
                )}

                {activeSceneFrame && (
                  <div className="as-rs-results as-rs-live">
                    <div className="as-rs-live-img-wrap">
                      <img src={activeSceneFrame.overlay} alt="Scene analysis" className="as-rs-overlay"/>
                      <div className="as-rs-live-badge"><span className="as-rs-live-dot"/>Live road camera</div>
                      <div className="as-rs-live-hazard" style={{color:hazardColor(activeSceneFrame.hazard?.level), borderColor:hazardColor(activeSceneFrame.hazard?.level)}}>
                        {activeSceneFrame.hazard?.score?.toFixed(1)} — {activeSceneFrame.hazard?.level}
                      </div>
                    </div>
                    <div className="as-rs-segs">
                      {activeSceneFrame.segments?.slice(0,6).map(seg => (
                        <div key={seg.id} className="as-rs-seg-row">
                          <span className="as-rs-seg-dot" style={{background:seg.color}}/>
                          <span className="as-rs-seg-label">{seg.label}</span>
                          <span className="as-rs-seg-pct">{seg.pixel_pct?.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {rsLoading && <div className="as-rs-loading"><div className="dd-spinner"/><p>Analyzing video frames…</p></div>}
              </div>
            </div>
          </div>
        )}

        {/* Hidden canvas always mounted for frame capture */}
        <canvas ref={captureRef} style={{display:"none"}}/>

        {/* ═══════════════════ PANELS ═══════════════════════════ */}
        {shiftActive && !showOnlyFeeds && (
          <div className={`as-panels ${activePanel==="all"?"grid":"single"}`}>

            {/* ── EMOTION PANEL ─────────────────────────────────── */}
            {(activePanel==="all"||activePanel==="emotion") && (
              <div className={`as-panel as-em-panel ${activePanel!=="all"?"wide":""}`}>
                <div className="as-panel-head">
                  <span className="as-panel-title">😊 Emotion Analysis</span>
                  {emotion && (
                    <span className="as-emo-pill" style={{borderColor:emoColor,color:emoColor}}>
                      {emotion.toUpperCase()} · {((emResult?.confidence??0)*100).toFixed(0)}%
                    </span>
                  )}
                </div>

                <div className="as-em-body">
                  {/* BVI mini gauge */}
                  <div className="as-em-gauge-row">
                    <MiniGauge value={bviScore} label={bvi?.state||"Waiting"} color={bviColor(bviScore)} size={90}/>
                    <div className="as-em-metrics">
                      <div className="as-metric-row"><span>BVI</span><span style={{color:bviColor(bviScore)}}>{bviScore?.toFixed(3)??"—"}</span></div>
                      <div className="as-metric-row"><span>Transition</span><span>{bvi?.transition_rate?.toFixed(3)??"—"}</span></div>
                      <div className="as-metric-row"><span>Entropy</span><span>{bvi?.entropy?.toFixed(3)??"—"}</span></div>
                    </div>
                  </div>

                  {/* Probability bars */}
                  {Object.keys(probs).length>0 ? (
                    <div className="as-probs">
                      {Object.entries(probs).sort(([,a],[,b])=>b-a).map(([lbl,val])=>(
                        <ProbBar key={lbl} label={lbl.charAt(0).toUpperCase()+lbl.slice(1)} value={val}
                          color={EMOTION_COLOR[lbl.toLowerCase()]||"#64748b"}/>
                      ))}
                    </div>
                  ) : <p className="as-no-data">Waiting for predictions…</p>}
                </div>
              </div>
            )}

            {/* ── DROWSINESS PANEL ──────────────────────────────── */}
            {(activePanel==="all"||activePanel==="drowsiness") && (
              <div className={`as-panel as-dw-panel ${activePanel!=="all"?"wide":""}`}>
                <div className="as-panel-head">
                  <span className="as-panel-title">😴 Drowsiness Monitor</span>
                  {dwVerdict && (
                    <span className="as-verdict-pill" style={{color:verdictColor(dwVerdict),borderColor:verdictColor(dwVerdict)}}>
                      {dwVerdict}
                    </span>
                  )}
                </div>

                <div className="as-dw-body">
                  {/* Conf gauge + streak */}
                  <div className="as-dw-gauge-row">
                    <MiniGauge value={dwConf} label={dwVerdict||"Waiting"} color={verdictColor(dwVerdict)} size={90}/>
                    <div className="as-dw-right">
                      <div className="as-dw-streak-label">Alert Streak</div>
                      <StreakBar count={dwStreak} threshold={CONSECUTIVE_THRESHOLD}/>
                    </div>
                  </div>

                  {/* Feature chips */}
                  <div className="as-feat-row">
                    <FeatChip label="EAR" value={dwFeatures.ear?.toFixed(2)} unit="" warn={dwFeatures.ear<0.22}/>
                    <FeatChip label="MAR" value={dwFeatures.mar?.toFixed(2)} unit="" warn={dwFeatures.mar>0.65}/>
                    <FeatChip label="Pitch" value={dwFeatures.pitch?.toFixed(1)} unit="°" warn={Math.abs(dwFeatures.pitch||0)>25}/>
                  </div>
                </div>
              </div>
            )}

            {/* ── ROAD SIGN PANEL ───────────────────────────────── */}
            {(activePanel==="all"||activePanel==="roadsign") && (
              <div className={`as-panel as-rsign-panel ${activePanel!=="all"?"wide":""}`}>
                <div className="as-panel-head">
                  <span className="as-panel-title">🚦 Road Sign Detection</span>
                  {rsSignInfo && (
                    <span className="as-badge" style={{
                      color: rsSignInfo.status==="Normal"?"#22c55e":"#f59e0b",
                      borderColor: rsSignInfo.status==="Normal"?"#22c55e":"#f59e0b"
                    }}>
                      {rsSignInfo.status}
                    </span>
                  )}
                </div>

                <div className="as-rsign-body">
                  <div className="as-rsign-stream-wrap">
                    <div className="as-rsign-no-stream">
                      <p>Live road feed is shown above</p>
                      <p style={{fontSize:"0.7rem",color:"#475569"}}>Road sign detection uses the road camera feed in the top row</p>
                    </div>
                  </div>

                  {/* Detection info */}
                  {rsSignInfo ? (() => {
                    const instr = getSignInstruction(rsSignInfo.class_name);
                    const pc = instr ? PRIORITY_COLORS[instr.priority] : null;
                    return (
                      <div className="as-rsign-detection" style={pc ? {background:pc.bg, borderColor:pc.border} : {}}>
                        <div className="as-rsign-det-head">
                          <span className="as-rsign-det-icon">{instr?.icon || "🔍"}</span>
                          <div>
                            <div className="as-rsign-det-name">{rsSignInfo.class_name.replace(/_/g," ")}</div>
                            <div className="as-rsign-det-conf">
                              {(rsSignInfo.confidence*100).toFixed(0)}% confidence · {rsSignInfo.status}
                            </div>
                          </div>
                          {instr && (
                            <span className="as-rsign-priority" style={{background:pc?.badge}}>
                              {instr.priorityLabel}
                            </span>
                          )}
                        </div>
                        {instr?.instructions && (
                          <ul className="as-rsign-instructions">
                            {instr.instructions.map((ins,i) => <li key={i}>{ins}</li>)}
                          </ul>
                        )}
                      </div>
                    );
                  })() : (
                    <div className="as-rsign-no-detect">
                      <span style={{fontSize:"1.5rem"}}>👁</span>
                      <p>Scanning for road signs…</p>
                    </div>
                  )}

                  {/* Recent detection log */}
                  {rsSignLog.length > 0 && (
                    <div className="as-rsign-log">
                      <div className="as-rsign-log-title">Recent Detections</div>
                      {rsSignLog.slice(0,5).map((entry,i) => (
                        <div key={i} className="as-rsign-log-row">
                          <span className="as-rsign-log-name">{entry.class_name.replace(/_/g," ")}</span>
                          <span className="as-rsign-log-conf">{(entry.confidence*100).toFixed(0)}%</span>
                          <span className="as-rsign-log-time">{entry.time}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── ROAD SCENE PANEL ──────────────────────────────── */}
            {(activePanel==="all"||activePanel==="roadscene") && (
              <div className={`as-panel as-rs-panel ${activePanel!=="all"?"wide":""}`}>
                <div className="as-panel-head">
                  <span className="as-panel-title">🛣 Road Scene Analysis</span>
                  {activeSceneFrame && (
                    <span className="as-badge" style={{color:hazardColor(rsHazardLevel),borderColor:hazardColor(rsHazardLevel)}}>
                      Hazard: {rsHazardLevel}
                    </span>
                  )}
                </div>

                <div className="as-rs-body">
                  {/* Live analysis from the road-facing camera */}
                  {!rsResult && !rsLoading && (
                    <div className="as-rs-upload">
                      <p style={{color:"#94a3b8",textAlign:"center"}}>Road-scene analysis will follow the live road camera during the shift.</p>
                    </div>
                  )}

                  {/* Results — live road-camera frame */}
                  {activeSceneFrame && (
                    <div className="as-rs-results as-rs-live">
                      {/* Large overlay image */}
                      <div className="as-rs-live-img-wrap">
                        <img src={activeSceneFrame.overlay} alt="Scene analysis" className="as-rs-overlay"/>
                        <div className="as-rs-live-badge">
                          <span className="as-rs-live-dot"/>
                          Live road camera
                        </div>
                        <div className="as-rs-live-hazard" style={{color:hazardColor(activeSceneFrame.hazard?.level), borderColor:hazardColor(activeSceneFrame.hazard?.level)}}>
                          {activeSceneFrame.hazard?.score?.toFixed(1)} — {activeSceneFrame.hazard?.level}
                        </div>
                      </div>

                      {/* Segment breakdown bar */}
                      <div className="as-rs-segs">
                        {activeSceneFrame.segments?.slice(0,6).map(seg => (
                          <div key={seg.id} className="as-rs-seg-row">
                            <span className="as-rs-seg-dot" style={{background:seg.color}}/>
                            <span className="as-rs-seg-label">{seg.label}</span>
                            <span className="as-rs-seg-pct">{seg.pixel_pct?.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Loading state */}
                  {rsLoading && <div className="as-rs-loading"><div className="dd-spinner"/><p>Analyzing video frames…</p></div>}
                </div>
              </div>
            )}

            {/* ── HAZARD PANEL ──────────────────────────────────── */}
            {(activePanel==="all"||activePanel==="hazard") && (
              <div className={`as-panel as-hz-panel ${activePanel!=="all"?"wide":""}`}>
                <div className="as-panel-head">
                  <span className="as-panel-title">🗺 Hazard Analysis</span>
                  <span className="as-route-small">{startTown} → {endTown}</span>
                </div>

                <div className="as-hz-body">
                  {hzLoading && <div className="as-rs-loading"><div className="dd-spinner"/><p>Analyzing route hazards…</p></div>}
                  {hzError && <div className="as-hz-error">{hzError}</div>}

                  {/* Map */}
                  <div ref={hzMapRef} className="as-hz-map"/>

                  {/* Controls */}
                  {pd && (
                    <div className="as-hz-controls">
                      <button className="as-hz-btn" onClick={()=>{if(!hzPlaying&&hzFinished){setHzIdx(0);setHzFinished(false);} setHzPlaying(!hzPlaying);}}>
                        {hzPlaying?"⏸ Pause":"▶ Play"}
                      </button>
                      <button className="as-hz-btn" onClick={()=>{setHzIdx(0);setHzPlaying(false);setHzFinished(false);setHzPoint(null);
                        if(hzMarkerRef.current&&pd.length) hzMarkerRef.current.setLatLng([pd[0].lat,pd[0].lon]);}}>
                        ⟲ Reset
                      </button>
                      <div className="as-hz-progress">
                        <div className="as-hz-progress-fill" style={{width:`${hzProgress}%`}}/>
                      </div>
                      <span className="as-hz-progress-text">{hzIdx}/{pd?.length||0}</span>
                      <span className="as-hz-dist-text">
                        {hzPoint ? (hzPoint.distance >= 1000 ? `${(hzPoint.distance/1000).toFixed(1)} km` : `${Math.round(hzPoint.distance)} m`) : "0 m"}
                        {" / "}
                        {pd?.length ? (pd[pd.length-1].distance >= 1000 ? `${(pd[pd.length-1].distance/1000).toFixed(1)} km` : `${Math.round(pd[pd.length-1].distance)} m`) : "0 m"}
                      </span>
                    </div>
                  )}

                  {/* Dashboard cards */}
                  <HazardDashPanel currentPoint={hzPoint} nextPoints={pd?.slice(hzIdx)} isFinished={hzFinished} totalDistance={pd?.length ? pd[pd.length-1].distance : 0}/>
                </div>
              </div>
            )}

            {/* ── LIVE GPS TRACKING (All Panels Only) ──────────────── */}
            {activePanel==="all" && (
              <div className="as-panel as-gps-panel">
                <div className="as-panel-head">
                  <span className="as-panel-title">📍 Live GPS Tracking</span>
                </div>
                <div ref={liveGpsMapRef} className="as-live-gps-map"/>
              </div>
            )}

          </div>
        )}


      </main>

      {/* ── SHIFT SCORE MODAL ─────────────────────────────────────── */}
      {shiftScore && (
        <div className="as-score-overlay" onClick={handleScoreClose}>
          <div className="as-score-modal" onClick={e => e.stopPropagation()}>
            <h2 className="as-score-title">Shift Complete</h2>

            <div className={`as-score-ring ${shiftScore.tier?.replace(/\s+/g, "-").toLowerCase()}`}>
              <span className="as-score-number">{shiftScore.total_score}</span>
              <span className="as-score-max">/ 100</span>
            </div>
            <div className="as-score-tier">{shiftScore.tier}</div>

            <div className="as-score-bars">
              {shiftScore.components && Object.entries(shiftScore.components).map(([key, comp]) => (
                <div key={key} className="as-score-bar-row">
                  <span className="as-score-bar-label">{comp.label}</span>
                  <div className="as-score-bar-track">
                    <div
                      className="as-score-bar-fill"
                      style={{ width: `${(comp.score / comp.max) * 100}%` }}
                    />
                  </div>
                  <span className="as-score-bar-val">{comp.score}/{comp.max}</span>
                </div>
              ))}
            </div>

            <button className="as-score-close-btn" onClick={handleScoreClose}>
              Done — Back to Schedule
            </button>
          </div>
        </div>
      )}

      {/* ── DRIVING MODE HUD ──────────────────────────────────────── */}
      {drivingMode && shiftActive && (
        <div className="hud-overlay">
          {/* HUD Top Bar */}
          <div className="hud-topbar">
            <div className="hud-topbar-left">
              <span className="hud-live-dot"/>
              <span className="hud-route">{startTown} → {endTown}</span>
              <span className="hud-meta">{routeName} · {busId}</span>
            </div>
            <div className="hud-topbar-center">
              <span className="hud-elapsed">⏱ {elapsed}</span>
            </div>
            <div className="hud-topbar-right">
              <button className="hud-exit-btn" onClick={()=>setDrivingMode(false)}>✕ Exit Driving Mode</button>
            </div>
          </div>

          {/* HUD Main Area */}
          <div className="hud-body">
            {/* Large Map */}
            <div className="hud-map-area">
              <div ref={hudMapRef} className="hud-map"/>
              {/* Hazard dashboard cards overlay on map */}
              <div className="hud-hz-cards">
                <HazardDashPanel currentPoint={hzPoint} nextPoints={pd?.slice(hzIdx)} isFinished={hzFinished} totalDistance={pd?.length ? pd[pd.length-1].distance : 0}/>
              </div>
            </div>

            {/* Right sidebar — camera + alerts */}
            <div className="hud-sidebar">
              {/* PIP Camera */}
              <div className="hud-cam">
                <video ref={el => { if (el && streamRef.current) el.srcObject = streamRef.current; }} autoPlay playsInline muted className="hud-cam-video" style={{transform:"scaleX(-1)"}}/>
              </div>

              {/* Alert banners */}
              {cheating && (
                <div className="hud-alert red">
                  <IcoAlert/> DISTRACTION: {emResult?.objects?.labels?.join(", ")}
                </div>
              )}
              {dwResult?.alert && (
                <div className="hud-alert red">
                  <IcoAlert/> DROWSINESS — Pull over!
                </div>
              )}

              {/* Drowsiness quick status */}
              <div className="hud-status-card">
                <div className="hud-status-head">😴 Drowsiness</div>
                <div className="hud-status-row">
                  <span>Status</span>
                  <span style={{color: verdictColor(dwVerdict), fontWeight: 700}}>{dwVerdict || "Waiting"}</span>
                </div>
                <div className="hud-status-row">
                  <span>Confidence</span>
                  <span>{dwConf != null ? `${(dwConf*100).toFixed(0)}%` : "—"}</span>
                </div>
                <div className="hud-status-row">
                  <span>Alert Streak</span>
                  <span style={{color: dwStreak >= CONSECUTIVE_THRESHOLD ? "#ef4444" : "#94a3b8"}}>{dwStreak}/{CONSECUTIVE_THRESHOLD}</span>
                </div>
              </div>

              {/* Emotion quick status */}
              <div className="hud-status-card">
                <div className="hud-status-head">😊 Emotion</div>
                <div className="hud-status-row">
                  <span>Current</span>
                  <span style={{color: emoColor, fontWeight: 700}}>{emotion ? emotion.toUpperCase() : "—"}</span>
                </div>
                <div className="hud-status-row">
                  <span>BVI</span>
                  <span style={{color: bviColor(bviScore)}}>{bviScore?.toFixed(3) ?? "—"}</span>
                </div>
              </div>

              {/* Road sign detection */}
              {rsSignInfo && (() => {
                const instr = getSignInstruction(rsSignInfo.class_name);
                const pc = instr ? PRIORITY_COLORS[instr.priority] : null;
                return (
                  <div className="hud-sign-card" style={pc ? {borderColor: pc.border, background: pc.bg} : {}}>
                    <div className="hud-sign-head">
                      <span className="hud-sign-icon">{instr?.icon || "🔍"}</span>
                      <div>
                        <div className="hud-sign-name">{rsSignInfo.class_name.replace(/_/g," ")}</div>
                        <div className="hud-sign-conf">{(rsSignInfo.confidence*100).toFixed(0)}%</div>
                      </div>
                      {instr && <span className="hud-sign-priority" style={{background: pc?.badge}}>{instr.priorityLabel}</span>}
                    </div>
                    {instr?.instructions && (
                      <ul className="hud-sign-instructions">
                        {instr.instructions.slice(0,2).map((ins,i) => <li key={i}>{ins}</li>)}
                      </ul>
                    )}
                  </div>
                );
              })()}
              {!rsSignInfo && (
                <div className="hud-status-card" style={{textAlign:"center", color:"#475569"}}>
                  <div className="hud-status-head">🚦 Road Signs</div>
                  <p style={{margin:"0.3rem 0 0",fontSize:"0.72rem"}}>Scanning…</p>
                </div>
              )}

              {/* ESC hint */}
              <div className="hud-esc-hint">Press <kbd>ESC</kbd> to exit</div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden capture elements for camera processing */}
      <video ref={videoRef} autoPlay muted playsInline style={{display:'none'}} />
      <canvas ref={captureRef} style={{display:'none'}} />
      <video ref={videoRef2} autoPlay muted playsInline style={{display:'none'}} />
      <canvas ref={captureRef2} style={{display:'none'}} />

      <style>{`
        .as-vehicle-icon {
          background: transparent !important;
          border: none !important;
        }
        .as-bus-marker {
          width: 36px; height: 36px;
          background: #0b5fff;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          border: 3px solid white;
          box-shadow: 0 0 12px rgba(11,95,255,0.7), 0 2px 8px rgba(0,0,0,0.5);
          animation: as-vpulse 1.2s ease infinite;
          transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
        }
        .as-bus-marker.danger-high {
          background: #f59e0b;
          border-color: #fbbf24;
          box-shadow: 0 0 18px rgba(245,158,11,0.8), 0 2px 8px rgba(0,0,0,0.5);
          animation: as-danger-pulse 0.6s ease infinite;
        }
        .as-bus-marker.danger-critical {
          background: #ef4444;
          border-color: #f87171;
          box-shadow: 0 0 24px rgba(239,68,68,0.9), 0 2px 8px rgba(0,0,0,0.5);
          animation: as-critical-pulse 0.4s ease infinite;
        }
        @keyframes as-vpulse {
          0%,100% { box-shadow: 0 0 12px rgba(11,95,255,0.7), 0 2px 8px rgba(0,0,0,0.5); transform: scale(1); }
          50% { box-shadow: 0 0 22px rgba(11,95,255,0.95), 0 2px 8px rgba(0,0,0,0.5); transform: scale(1.1); }
        }
        @keyframes as-danger-pulse {
          0%,100% { transform: scale(1); box-shadow: 0 0 18px rgba(245,158,11,0.8); }
          50% { transform: scale(1.2); box-shadow: 0 0 30px rgba(245,158,11,1); }
        }
        @keyframes as-critical-pulse {
          0%,100% { transform: scale(1); box-shadow: 0 0 24px rgba(239,68,68,0.9); }
          50% { transform: scale(1.3); box-shadow: 0 0 40px rgba(239,68,68,1); }
        }


      `}</style>
    </div>
  );
}
