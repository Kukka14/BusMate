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

// ── Road Sign audio helpers ────────────────────────────────────────────────────
function playBeep(freq = 880, duration = 0.2, vol = 0.35) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type            = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt  = new SpeechSynthesisUtterance(text);
  utt.lang   = "en-US";
  utt.rate   = 0.95;
  utt.pitch  = 1;
  utt.volume = 1;
  window.speechSynthesis.speak(utt);
}

function formatDistance(m) {
  if (m === null || m === undefined || Number.isNaN(Number(m))) return "—";
  return `${Number(m).toFixed(2)} m`;
}

const IcoStop  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;
const IcoAlert = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;

const CHEATING_LABELS = new Set(["cell phone","laptop","phone","hand raise","extra person"]);
const CONSECUTIVE_THRESHOLD = 5;

// ═══════════════════════════════════════════════════════════════════════════════
// ── Helper components ─────────────────────────────────────────────────────────

// Large confidence gauge (matches DrowsinessMonitorPage style)
function DwConfGauge({ value, label, color }) {
  const cx = 60, cy = 60, r = 50;
  const circ = 2 * Math.PI * r;
  const pct  = value != null ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="9"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color || "#64748b"} strokeWidth="9"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s" }}/>
      <text x={cx} y={cy - 5} textAnchor="middle" fill="#f1f5f9" fontSize="18" fontWeight="700" fontFamily="Inter,sans-serif">
        {value != null ? `${Math.round(value * 100)}%` : "—"}
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="Inter,sans-serif">
        {label ?? "Waiting"}
      </text>
    </svg>
  );
}

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
  const [shiftLogId, setShiftLogId]   = useState(null);  // UUID for drowsiness analytics
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
  const [driverStreamReady, setDriverStreamReady] = useState(false);
  const [roadStreamReady, setRoadStreamReady] = useState(false);

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

  // ── Road Sign socket state ──────────────────────────────────────────────
  const rsSocketRef    = useRef(null);
  const rsSendIvRef    = useRef(null);
  const rsInFlight     = useRef(false);
  const rsCaptureRef   = useRef(null); // hidden canvas for frame capture

  // ── Emotion state ───────────────────────────────────────────────────────
  const emSocketRef = useRef(null);
  const emOverlayRef = useRef(null);
  const emSendIvRef = useRef(null);
  const emRafRef    = useRef(null);
  const emInFlight  = useRef(false);
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
  const [rsSignInfo, setRsSignInfo]         = useState(null);
  const rsSignPollRef   = useRef(null);
  const rsSignLastRef   = useRef(null);
  const rsSignFailRef   = useRef(0);          // consecutive failure counter
  const rsSignAudioEnabledRef = useRef(true);
  const [rsSignLog, setRsSignLog]           = useState([]);
  const [rsSignAudioEnabled, setRsSignAudioEnabled] = useState(true);
  const [rsSignOnline, setRsSignOnline]     = useState(true);


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
    setDriverStreamReady(false);

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
        setDriverStreamReady(true);
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
    setRoadStreamReady(false);

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
        setRoadStreamReady(true);
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
            setRoadStreamReady(true);
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
  }, [driverStreamReady]);

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
  }, [roadStreamReady]);

  // Ensure all video elements play when stream is assigned
  useEffect(() => {
    const playVideos = () => {
      const videos = [videoRef, videoRef2, videoRefEmotionDisplay, videoRefDrowsinessDisplay, videoRefRoadSignDisplay, videoRefRoadSceneDisplay];
      videos.forEach(ref => {
        if (ref?.current && ref.current.srcObject && ref.current.paused) {
          console.log("[Video] Playing video:", ref.current.className || ref.current.id || "video");
          ref.current.play().catch(err => {
            // Autoplay might be blocked by browser policy - this is normal
            console.warn("[Video] Autoplay blocked (browser policy):", err.message);
          });
        }
      });
    };
    
    // Try to play immediately and periodically
    playVideos();
    const timer = setInterval(playVideos, 1000);
    return () => clearInterval(timer);
  }, [shiftActive, driverStreamReady, roadStreamReady]);

  // ═══════════════════════════════════════════════════════════════════════
  // ── EMOTION Socket ─────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, {transports:["websocket"], reconnectionDelayMax: 10000});
    emSocketRef.current = socket;
    socket.on("connect",    ()=>{setEmConnected(true); console.log("[Emotion] Socket connected");});
    socket.on("disconnect", ()=>{setEmConnected(false); console.log("[Emotion] Socket disconnected");});
    socket.on("prediction", payload => {
      console.log("[Emotion] Received prediction:", payload);
      emInFlight.current = false;
      if (payload?.ok===false) { console.warn("[Emotion] Error response:", payload.error); return; }
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
    socket.on("error", (err) => console.error("[Emotion] Socket error:", err));
    return () => { if(emSendIvRef.current) clearInterval(emSendIvRef.current); emInFlight.current = false; socket.disconnect(); };
  }, []);

  // Emotion frame send loop — only when shift active
  useEffect(() => {
    if (!shiftActive) { if(emSendIvRef.current) clearInterval(emSendIvRef.current); emInFlight.current = false; return; }
    emSendIvRef.current = setInterval(()=>{
      const v=videoRef.current, c=captureRef.current, s=emSocketRef.current;
      if(!v||!c||!s||!s.connected||v.readyState<2) {
        if (s && !s.connected) console.log("[Emotion] Socket not connected, skipping frame");
        if (v && v.readyState < 2) console.log("[Emotion] Video not ready, skipping frame");
        return;
      }
      if (emInFlight.current) {
        console.log("[Emotion] Frame already in flight, skipping");
        return;
      }
      const ctx=c.getContext("2d"); c.width=320; c.height=240;
      ctx.drawImage(v,0,0,320,240);
      emInFlight.current = true;
      s.emit("frame",{driver_id:driverId,image:c.toDataURL("image/jpeg",0.70),client_ts:Date.now()});
      console.log("[Emotion] Frame sent to server");
    }, 400);
    return () => { clearInterval(emSendIvRef.current); emInFlight.current = false; };
  }, [shiftActive, driverId]);

  // ═══════════════════════════════════════════════════════════════════════
  // ── DROWSINESS Socket ──────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, {transports:["websocket"], reconnectionDelayMax: 10000});
    dwSocketRef.current = socket;
    socket.on("connect",    ()=>{setDwConnected(true); console.log("[Drowsiness] Socket connected");});
    socket.on("disconnect", ()=>{setDwConnected(false); console.log("[Drowsiness] Socket disconnected");});
    socket.on("drowsiness_result", payload => {
      console.log("[Drowsiness] Received result:", payload);
      dwInFlight.current = false;
      if (!payload?.ok) { console.warn("[Drowsiness] Error response:", payload.error); return; }
      setDwResult(payload);
      setDwFrames(c=>c+1);
      if (payload.verdict==="Drowsy") setDwDrowsyFrames(c=>c+1);
      if (payload.alert) setDwAlerts(c=>c+1);
    });
    socket.on("error", (err) => console.error("[Drowsiness] Socket error:", err));
    return () => { if(dwSendIvRef.current) clearInterval(dwSendIvRef.current); socket.disconnect(); };
  }, []);

  // Drowsiness frame send loop — only when shift active
  useEffect(() => {
    if (!shiftActive) { if(dwSendIvRef.current) clearInterval(dwSendIvRef.current); return; }
    dwSendIvRef.current = setInterval(()=>{
      const v=videoRef.current, c=captureRef.current, s=dwSocketRef.current;
      if(!v||!c||!s||!s.connected||v.readyState<2) {
        if (s && !s.connected) console.log("[Drowsiness] Socket not connected, skipping frame");
        if (v && v.readyState < 2) console.log("[Drowsiness] Video not ready, skipping frame");
        return;
      }
      if (dwInFlight.current) {
        console.log("[Drowsiness] Frame already in flight, skipping");
        return;
      }
      const ctx=c.getContext("2d"); c.width=640; c.height=480;
      ctx.drawImage(v,0,0,640,480);
      dwInFlight.current = true;
      s.emit("drowsiness_frame",{image:c.toDataURL("image/jpeg",0.80),session_id:dwSessionId,client_ts:Date.now()});
      console.log("[Drowsiness] Frame sent to server");
    }, 200);
    return () => { clearInterval(dwSendIvRef.current); dwInFlight.current=false; };
  }, [shiftActive, dwSessionId]);

  // ── Periodic drowsiness analytics logging (every 30 s) ──────────────────
  useEffect(() => {
    if (!shiftActive || !shiftLogId) return;
    const iv = setInterval(() => {
      const result = dwResult;
      if (!result || result.confidence == null) return;
      const elapsed = shiftStart ? Math.floor((Date.now() - shiftStart) / 1000) : 0;
      fetch(`${API}/api/drowsiness/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          shift_id:              shiftLogId,
          driver_id:             driverId,
          schedule_id:           scheduleId,
          route_name:            routeName,
          start_town:            startTown,
          end_town:              endTown,
          shift_elapsed_seconds: elapsed,
          drowsy_prob:           result.confidence,
          verdict:               result.verdict || "Alert",
          alert_triggered:       result.verdict === "Drowsy" && result.confidence > 0.6,
          face_detected:         result.face_detected ?? true,
          features:              result.features || {},
          models: {
            m1: result.models?.m1?.drowsy_prob,
            m2: result.models?.m2?.drowsy_prob,
            m3: result.models?.m3?.drowsy_prob,
            m4: result.models?.m4?.drowsy_prob,
            m5: result.models?.m5?.drowsy_prob,
          },
        }),
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, [shiftActive, shiftLogId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════════
  // ── ROAD CAMERA: send frames to RSA endpoint for scene analysis ──────────
  useEffect(() => {
    if (!shiftActive) return;
    let iv = null;
    const sendFrame = async () => {
      const v = videoRef2.current, c = captureRef2.current;
      if (!v || !c || v.readyState < 2) {
        if (v && v.readyState < 2) console.log("[Road] Video not ready, skipping frame");
        return;
      }
      c.width = 640; c.height = 480;
      const ctx = c.getContext("2d");
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const blob = await new Promise(res => c.toBlob(res, "image/jpeg", 0.8));
      if (!blob) {
        console.warn("[Road] Blob creation failed");
        return;
      }
      try {
        const form = new FormData();
        form.append("file", blob, "frame.jpg");
        // Send to RSA analyse (scene analysis)
        fetch(`${API}/rsa/analyse`, { method: "POST", body: form })
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .then(data => {
            if (data && !data.error) {
              console.log("[RSA] Received scene data:", data);
              const mappedFrame = {
                original: data.original,
                overlay: data.overlay,
                segments: data.segments || [],
                hazard: data.hazard || null,
              };
              setRsResult({ scene_latest: mappedFrame, frames: [mappedFrame] });
            } else {
              console.warn("[RSA] Error response:", data?.error || "unknown");
            }
          })
          .catch(err => console.warn("[RSA] Fetch error:", err.message));
      } catch (e) {
        console.error("[Road] Frame processing error:", e);
      }
    };
    iv = setInterval(sendFrame, 1500);
    return () => clearInterval(iv);
  }, [shiftActive]);

  // ═══════════════════════════════════════════════════════════════════════
  // ── ROAD SIGN — Socket-based frame sending (same pattern as emotion/drowsiness)
  useEffect(() => {
    if (!shiftActive) {
      // cleanup on shift end
      clearInterval(rsSendIvRef.current);
      rsSendIvRef.current = null;
      if (rsSocketRef.current) { rsSocketRef.current.disconnect(); rsSocketRef.current = null; }
      return;
    }

    // Connect socket
    const sock = io(SOCKET_URL, { transports: ["websocket"], reconnectionDelayMax: 10000 });
    rsSocketRef.current = sock;

    sock.on("connect", () => {
      setRsSignOnline(true);
      rsSignFailRef.current = 0;
    });

    sock.on("disconnect", () => {
      setRsSignOnline(false);
    });

    sock.on("connect_error", () => {
      rsSignFailRef.current += 1;
      if (rsSignFailRef.current >= 3) setRsSignOnline(false);
    });

    // Handle detection results
    sock.on("road_sign_result", (data) => {
      rsInFlight.current = false;
      const hasSign = data?.class_name;
      const hasVehicleMeta =
        data?.nearest_vehicle_distance_m !== undefined ||
        data?.vehicle_collision_risk !== undefined;

      if (hasSign || hasVehicleMeta) {
        setRsSignInfo(data);
        if (hasSign && data.status === "Normal" && rsSignLastRef.current !== data.class_name) {
          rsSignLastRef.current = data.class_name;
          if (rsSignAudioEnabledRef.current) {
            playBeep(880, 0.2, 0.35);
            setTimeout(() => speakText(`Road sign detected: ${formatLabel(data.class_name)}`), 250);
          }
          setRsSignLog(prev => [
            { class_name: data.class_name, confidence: data.confidence,
              status: data.status, estimated_distance_m: data.estimated_distance_m,
              time: new Date().toLocaleTimeString() },
            ...prev.slice(0, 29),
          ]);
        } else if (!hasSign) {
          rsSignLastRef.current = null;
        }
      } else {
        setRsSignInfo(null);
        rsSignLastRef.current = null;
      }
    });

    // Send frames every 400ms from road-facing camera
    const canvas = rsCaptureRef.current || document.createElement("canvas");
    rsCaptureRef.current = canvas;

    rsSendIvRef.current = setInterval(() => {
      if (rsInFlight.current) return;
      const video = videoRefRoadSignDisplay.current;
      if (!video || !video.srcObject || video.readyState < 2) return;
      canvas.width  = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, 320, 240);
      const b64 = canvas.toDataURL("image/jpeg", 0.7);
      rsInFlight.current = true;
      sock.emit("road_sign_frame", { image: b64 });
    }, 400);

    return () => {
      clearInterval(rsSendIvRef.current);
      rsSendIvRef.current = null;
      if (rsSocketRef.current) { rsSocketRef.current.disconnect(); rsSocketRef.current = null; }
    };
  }, [shiftActive]);

  // Sync audio enabled ref with state
  useEffect(() => {
    rsSignAudioEnabledRef.current = rsSignAudioEnabled;
  }, [rsSignAudioEnabled]);

  // ── Road Sign — Start webcam session on shift start ──────────────────────
  useEffect(() => {
    if (!shiftActive) {
      // Stop session when shift ends
      fetch("/road-sign/stop_webcam_session", { method: "POST" }).catch(() => {});
      return;
    }
    
    // Start session when shift starts
    const startSession = async () => {
      try {
        const res = await fetch("/road-sign/start_webcam_session", { method: "POST" });
        if (!res.ok) {
          console.warn("[Road Sign Session] Failed to start:", res.status);
          return;
        }
        const data = await res.json();
        if (data?.webcam_session_id) {
          console.log("[Road Sign Session] Started:", data.webcam_session_id);
          // Reset detection info when session starts
          setRsSignInfo(null);
          setRsSignLog([]);
          rsSignLastRef.current = null;
        }
      } catch (err) {
        console.error("[Road Sign Session] Error:", err.message);
      }
    };
    
    startSession();
  }, [shiftActive]);

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
    if (pd.length > 5000) return 4;
    if (pd.length > 2000) return 2;
    if (pd.length > 500) return 1;
    return 1;
  }, []);

  const getDelay = useCallback((pt) => {
    if(!pt) return 120;
    switch(pt.risk_label) {
      case "Critical Risk":return 700; case "High Risk":return 450; case "Medium Risk":return 180; default:return 120;
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
        map.panTo([pt.lat, pt.lon], { animate: true, duration: 0.9, noMoveStart: true });
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
    setShiftLogId(crypto.randomUUID());
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
    setShiftActive(false); setShiftStart(null); setShiftLogId(null);
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
  const formatLabel = (value) => (typeof value === "string" ? value.replace(/_/g, " ") : (value == null ? "—" : String(value).replace(/_/g, " ")));
  
  const getEmotionAlert = () => {
    if (bviScore == null) return { label: "Waiting", tone: "idle", message: "Waiting for emotion analysis." };
    if (bviScore < 0.3) return { label: "Safe", tone: "safe", message: "Emotion is stable and looks normal." };
    if (bviScore < 0.6) return { label: "Unsafe", tone: "warn", message: "Emotion is shifting. Keep the driver focused." };
    return { label: "Erratic", tone: "danger", message: "Emotion is unstable. Check the driver now." };
  };
  
  const getDrowsinessAlert = () => {
    if (dwConf == null) return { label: "Waiting", tone: "idle", message: "Waiting for drowsiness analysis." };
    if ((dwVerdict || "").toLowerCase() === "drowsy" || dwConf >= 0.75) return { label: "Warning", tone: "danger", message: "Drowsiness risk is high. Take action now." };
    if (dwConf >= 0.45) return { label: "Warning", tone: "warn", message: "Driver attention is dropping. Stay alert." };
    return { label: "Safe", tone: "safe", message: "Driver looks alert and stable." };
  };
  
  const getRoadSignAttention = (instr) => {
    if (!instr) return "Attention: watch the road";
    if (instr.priorityLabel === "Critical") return "Attention: critical warning";
    if (instr.priorityLabel === "High") return "Attention: high caution";
    if (instr.priorityLabel === "Medium") return "Attention: moderate caution";
    return "Attention: low caution";
  };
  
  const rsHasSign = typeof rsSignInfo?.class_name === "string" && rsSignInfo.class_name.trim().length > 0;
  const rsHasVehicleMeta =
    rsSignInfo?.nearest_vehicle_distance_m !== undefined ||
    rsSignInfo?.vehicle_collision_risk !== undefined ||
    rsSignInfo?.vehicle_count !== undefined ||
    rsSignInfo?.traffic_congestion !== undefined;

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
            {/* GPS map removed for cleaner header */}
          </div>
        </header>

        {/* ── Debug Status Bar ──────────────────────────────── */}
        {shiftActive && (
          <div style={{display:"flex",gap:12,alignItems:"center",padding:"0.5rem 1.25rem",background:"#0d1f35",borderBottom:"1px solid #1e3a5f",fontSize:"0.75rem",color:"#94a3b8",overflow:"auto"}}>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{color:"#64748b",fontWeight:600}}>📊 Status:</span>
            </div>
            <div style={{display:"flex",gap:12,alignItems:"center",marginLeft:8}}>
              {[
                {label:"Emotion",label2:"Em",connected:emConnected,hasData:!!emResult},
                {label:"Drowsiness",label2:"Dw",connected:dwConnected,hasData:!!dwResult},
                {label:"Road Scene",label2:"RS",connected:true,hasData:!!activeSceneFrame},
                {label:"Road Sign",label2:"RSi",connected:true,hasData:!!rsSignInfo},
              ].map(({label,label2,connected,hasData})=>(
                <div key={label} style={{display:"flex",gap:4,alignItems:"center",padding:"2px 8px",background:connected?"#16a34a22":"#dc262622",border:`1px solid ${connected?"#22c55e55":"#ef444455"}`,borderRadius:4}}>
                  <span style={{color:connected?"#22c55e":"#ef4444",fontSize:"0.7rem",fontWeight:600}}>●</span>
                  <span style={{color:connected?"#22c55e":"#ef4444",fontSize:"0.7rem"}}>{label2}</span>
                  {hasData && <span style={{marginLeft:2,color:"#22c55e",fontSize:"0.65rem"}}>✓ data</span>}
                </div>
              ))}
              <div style={{marginLeft:12,paddingLeft:12,borderLeft:"1px solid #334155",color:"#64748b",fontSize:"0.7rem"}}>
                Em: {emFrames} frames | Dw: {dwFrames} frames | Road: {rsResult?"analyzing":"waiting"}
              </div>
            </div>
          </div>
        )}

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
              {/* Drowsiness analysis — DrowsinessMonitor style */}
              <div style={{marginTop:"0.5rem",display:"flex",flexDirection:"column",gap:"0.5rem"}}>

                {/* Confidence gauge row */}
                <div style={{background:"#0d1f35",borderRadius:10,padding:"0.6rem 0.75rem",border:"1px solid #1e3a5f"}}>
                  <div style={{fontSize:"0.62rem",color:"#64748b",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6}}>
                    Drowsiness Confidence
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <DwConfGauge value={dwConf} label={dwVerdict||"Waiting"} color={verdictColor(dwVerdict)}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"1.6rem",fontWeight:800,color:verdictColor(dwVerdict),lineHeight:1}}>
                        {dwConf!=null?`${Math.round(dwConf*100)}%`:"—"}
                      </div>
                      <div style={{fontSize:"0.65rem",color:"#64748b",marginBottom:8}}>Drowsy probability</div>
                      <div style={{fontSize:"0.65rem",color:"#94a3b8",fontWeight:600,marginBottom:3}}>Alert Streak</div>
                      <StreakBar count={dwStreak} threshold={CONSECUTIVE_THRESHOLD}/>
                    </div>
                  </div>
                </div>

                {/* Facial features grid */}
                <div style={{background:"#0d1f35",borderRadius:10,padding:"0.6rem 0.75rem",border:"1px solid #1e3a5f"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:"0.62rem",color:"#64748b",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase"}}>Facial Features</span>
                    {dwResult?.face_detected!=null&&(
                      <span style={{fontSize:"0.6rem",padding:"1px 6px",borderRadius:8,fontWeight:600,
                        background:dwResult.face_detected?"#16a34a22":"#dc262622",
                        color:dwResult.face_detected?"#22c55e":"#ef4444",
                        border:`1px solid ${dwResult.face_detected?"#22c55e44":"#ef444444"}`}}>
                        {dwResult.face_detected?"Face OK":"No Face"}
                      </span>
                    )}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"0.3rem"}}>
                    {[
                      {label:"EAR",       val:dwFeatures.ear?.toFixed(3),        unit:"",  warn:dwFeatures.ear!=null&&dwFeatures.ear<0.25},
                      {label:"MAR",       val:dwFeatures.mar?.toFixed(3),        unit:"",  warn:dwFeatures.mar!=null&&dwFeatures.mar>0.60},
                      {label:"Pitch",     val:dwFeatures.pitch?.toFixed(1),      unit:"°", warn:dwFeatures.pitch!=null&&Math.abs(dwFeatures.pitch)>20},
                      {label:"Yaw",       val:dwFeatures.yaw?.toFixed(1),        unit:"°", warn:dwFeatures.yaw!=null&&Math.abs(dwFeatures.yaw)>30},
                      {label:"Eye Blink", val:dwFeatures.eye_closure?.toFixed(2),unit:"",  warn:dwFeatures.eye_closure!=null&&dwFeatures.eye_closure>0.45},
                      {label:"PERCLOS",   val:dwFeatures.perclos!=null?`${Math.round(dwFeatures.perclos*100)}`:null, unit:"%", warn:dwFeatures.perclos!=null&&dwFeatures.perclos>0.30},
                      {label:"Yawn",      val:dwFeatures.yawn_freq!=null?`${Math.round(dwFeatures.yawn_freq*100)}`:null, unit:"%", warn:dwFeatures.yawn_freq!=null&&dwFeatures.yawn_freq>0.20},
                    ].map(({label,val,unit,warn})=>(
                      <div key={label} style={{background:warn?"#7f1d1d22":"#071828",borderRadius:6,padding:"0.3rem 0.5rem",border:`1px solid ${warn?"#ef444433":"#1e293b"}`}}>
                        <div style={{fontSize:"0.58rem",color:warn?"#f87171":"#64748b",fontWeight:600,letterSpacing:"0.04em"}}>{label}</div>
                        <div style={{fontSize:"0.78rem",fontWeight:700,color:warn?"#ef4444":"#e2e8f0"}}>{val!=null?`${val}${unit}`:"—"}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Model bars */}
                <div style={{background:"#0d1f35",borderRadius:10,padding:"0.6rem 0.75rem",border:"1px solid #1e3a5f"}}>
                  <div style={{fontSize:"0.62rem",color:"#64748b",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:6}}>Model Ensemble</div>
                  {[
                    {name:"M1 EffNet",  w:"10%",key:"m1"},
                    {name:"M2 LSTM",    w:"35%",key:"m2"},
                    {name:"M3 Fusion",  w:"25%",key:"m3"},
                    {name:"M4 Trans",   w:"15%",key:"m4"},
                    {name:"M5 TCN",     w:"15%",key:"m5"},
                  ].map(({name,w,key})=>{
                    const prob=dwResult?.models?.[key]?.drowsy_prob;
                    const pct=prob!=null?Math.round(prob*100):null;
                    const col=prob==null?null:prob>0.6?"#ef4444":prob>0.4?"#f59e0b":"#22c55e";
                    return(
                      <div key={key} style={{marginBottom:5}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.65rem",marginBottom:2}}>
                          <span style={{color:"#94a3b8"}}>{name} <span style={{color:"#475569"}}>·{w}</span></span>
                          <span style={{color:col??"#475569",fontWeight:700}}>{pct!=null?`${pct}%`:"—"}</span>
                        </div>
                        <div style={{height:4,background:"#1e293b",borderRadius:2,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${pct??0}%`,background:col??"#334155",borderRadius:2,transition:"width 0.4s ease"}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            </div>

            {/* ── Road Sign Card ────────────────────────────────────────── */}
            {(() => {
              const rsInstr   = rsHasSign ? getSignInstruction(rsSignInfo.class_name) : null;
              const rsPc      = rsInstr ? PRIORITY_COLORS[rsInstr.priority] : null;
              const rsRiskCol = {"HIGH":"#ef4444","MEDIUM":"#f59e0b","LOW":"#22c55e"}[rsSignInfo?.vehicle_collision_risk] ?? "#64748b";
              const statusBadge = !rsSignOnline ? "red" : rsHasSign ? "green" : rsHasVehicleMeta ? "blue" : "gray";
              const statusLabel = !rsSignOnline ? "Offline" : rsHasSign ? "Detected" : rsHasVehicleMeta ? "Tracking" : "Scanning";
              return (
                <div className="as-panel as-camera-panel" style={{padding:"0.75rem", ...(rsPc ? {borderColor:rsPc.border} : {})}}>
                  {/* header */}
                  <div className="as-panel-head" style={{marginBottom:"0.5rem"}}>
                    <span className="as-panel-title" style={{fontSize:"0.9rem"}}>🚦 Road Sign</span>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <button onClick={()=>setRsSignAudioEnabled(v=>!v)}
                        style={{padding:"2px 8px",borderRadius:6,fontSize:"0.7rem",fontWeight:600,border:"1px solid #334155",
                          background:rsSignAudioEnabled?"#0b5fff22":"#1e293b",color:rsSignAudioEnabled?"#60a5fa":"#94a3b8",cursor:"pointer"}}
                        title={rsSignAudioEnabled?"Mute":"Enable audio"}>
                        {rsSignAudioEnabled?"🔊":"🔇"}
                      </button>
                      <span className={`as-badge ${statusBadge}`} style={{fontSize:"0.7rem"}}>{statusLabel}</span>
                    </div>
                  </div>

                  {/* live road camera */}
                  <div className="as-cam-wrap" style={{position:"relative",marginBottom:"0.5rem"}}>
                    <video ref={videoRefRoadSignDisplay} autoPlay playsInline muted className="as-cam-video"
                      style={{borderRadius:"0.5rem"}}/>
                    {rsHasSign && (
                      <div style={{position:"absolute",top:6,left:6,display:"flex",gap:5,alignItems:"center",
                        background:"rgba(0,0,0,0.75)",padding:"3px 9px",borderRadius:6}}>
                        <span style={{fontSize:"0.6rem",color:"#22c55e",fontWeight:700}}>● LIVE</span>
                        <span style={{fontSize:"0.72rem",color:"#f1f5f9",fontWeight:600}}>{formatLabel(rsSignInfo.class_name)}</span>
                        <span style={{fontSize:"0.68rem",color:"#94a3b8"}}>{Math.round((rsSignInfo.confidence??0)*100)}%</span>
                      </div>
                    )}
                    {!rsSignOnline && (
                      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",
                        justifyContent:"center",background:"rgba(0,0,0,0.55)",borderRadius:"0.5rem",gap:6}}>
                        <span style={{fontSize:"1.4rem"}}>🔌</span>
                        <span style={{fontSize:"0.75rem",color:"#ef4444",fontWeight:700}}>Detection Backend Offline</span>
                        <span style={{fontSize:"0.65rem",color:"#64748b"}}>Start the road sign server to enable</span>
                      </div>
                    )}
                  </div>

                  {/* detection result or idle state */}
                  {rsHasSign ? (
                    <div style={{display:"flex",flexDirection:"column",gap:"0.4rem"}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:"0.55rem",padding:"0.45rem 0.6rem",
                        background:"rgba(7,24,40,0.7)",borderRadius:9,border:`1px solid ${rsPc?.border??"#1e293b"}`}}>
                        <span style={{fontSize:"1.35rem"}}>{rsInstr?.icon??"🔍"}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:"0.86rem",fontWeight:800,color:"#f1f5f9",marginBottom:2}}>{formatLabel(rsSignInfo.class_name)}</div>
                          {rsInstr && <div style={{fontSize:"0.67rem",color:"#94a3b8"}}>{rsInstr.instruction}</div>}
                        </div>
                        {rsInstr && (
                          <span style={{fontSize:"0.6rem",fontWeight:700,padding:"2px 7px",borderRadius:999,flexShrink:0,
                            background:rsPc?.badge??"rgba(245,158,11,0.2)",color:rsPc?.text??"#f59e0b"}}>
                            {rsInstr.priorityLabel}
                          </span>
                        )}
                      </div>
                      <div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.6rem",color:"#64748b",marginBottom:3}}>
                          <span>Confidence</span>
                          <span style={{fontWeight:700,color:(rsSignInfo.confidence??0)>0.7?"#22c55e":(rsSignInfo.confidence??0)>0.45?"#f59e0b":"#ef4444"}}>
                            {Math.round((rsSignInfo.confidence??0)*100)}%
                          </span>
                        </div>
                        <div style={{height:5,background:"#1e293b",borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${Math.round((rsSignInfo.confidence??0)*100)}%`,borderRadius:3,transition:"width 0.5s",
                            background:(rsSignInfo.confidence??0)>0.7?"#22c55e":(rsSignInfo.confidence??0)>0.45?"#f59e0b":"#ef4444"}}/>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.3rem"}}>
                        {[
                          {label:"Sign Dist.",     val:formatDistance(rsSignInfo.estimated_distance_m), color:"#38bdf8"},
                          {label:"Status",         val:rsSignInfo.status??"—",                          color:rsSignInfo.status==="Normal"?"#22c55e":"#f59e0b"},
                          {label:"Collision Risk", val:rsSignInfo.vehicle_collision_risk??"—",           color:rsRiskCol},
                          {label:"Vehicle Dist.",  val:formatDistance(rsSignInfo.nearest_vehicle_distance_m), color:rsRiskCol},
                          {label:"Vehicles",       val:rsSignInfo.vehicle_count!=null?`${rsSignInfo.vehicle_count}`:rsHasVehicleMeta?"0":"—"},
                          {label:"Traffic",        val:rsSignInfo.traffic_congestion??"—",               color:{"HIGH":"#ef4444","MEDIUM":"#f59e0b","LOW":"#22c55e"}[rsSignInfo?.traffic_congestion]??"#64748b"},
                        ].map(({label,val,color})=>(
                          <div key={label} style={{background:"rgba(7,24,40,0.6)",borderRadius:7,padding:"0.3rem 0.5rem",border:"1px solid #1e293b"}}>
                            <div style={{fontSize:"0.57rem",color:"#64748b",fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase"}}>{label}</div>
                            <div style={{fontSize:"0.78rem",fontWeight:700,color:color??"#e2e8f0"}}>{val}</div>
                          </div>
                        ))}
                      </div>
                      {rsSignLog.length > 0 && (
                        <div style={{background:"rgba(7,24,40,0.5)",borderRadius:8,padding:"0.4rem 0.55rem",border:"1px solid #1e293b"}}>
                          <div style={{fontSize:"0.58rem",color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Recent</div>
                          {rsSignLog.slice(0,3).map((e,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0",borderBottom:i<2?"1px solid #0e1e2f":"none"}}>
                              <span style={{fontSize:"0.72rem"}}>{e.icon??"🔍"}</span>
                              <span style={{flex:1,fontSize:"0.67rem",color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:600}}>{formatLabel(e.class_name??e.name)}</span>
                              <span style={{fontSize:"0.58rem",color:"#475569"}}>{e.time}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                      gap:"0.3rem",padding:"0.75rem",color:"#475569",textAlign:"center"}}>
                      {rsSignOnline
                        ? <><span style={{fontSize:"1.4rem"}}>👁</span><p style={{margin:0,fontSize:"0.78rem",color:"#64748b"}}>Scanning for road signs…</p></>
                        : <p style={{margin:0,fontSize:"0.75rem",color:"#475569"}}>Camera feed active — detection paused</p>
                      }
                      {rsHasVehicleMeta && rsSignOnline && (
                        <div style={{display:"flex",gap:10,marginTop:4}}>
                          <span style={{fontSize:"0.7rem",color:rsRiskCol,fontWeight:700}}>🚗 {rsSignInfo?.vehicle_collision_risk??"—"} RISK</span>
                          <span style={{fontSize:"0.7rem",color:"#64748b"}}>{rsSignInfo?.vehicle_count??0} vehicles</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

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
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {dwResult?.face_detected != null && (
                      <span style={{padding:"2px 8px",borderRadius:10,fontSize:"0.68rem",fontWeight:600,
                        background: dwResult.face_detected?"#16a34a22":"#dc262622",
                        color: dwResult.face_detected?"#22c55e":"#ef4444",
                        border:`1px solid ${dwResult.face_detected?"#22c55e55":"#ef444455"}`}}>
                        {dwResult.face_detected?"Face OK":"No Face"}
                      </span>
                    )}
                    {dwVerdict && (
                      <span className="as-verdict-pill" style={{color:verdictColor(dwVerdict),borderColor:verdictColor(dwVerdict)+"55"}}>
                        {dwVerdict}
                      </span>
                    )}
                  </div>
                </div>

                <div className="as-dw-body" style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>

                  {/* ── Confidence gauge + streak ── */}
                  <div style={{background:"#0d1f35",borderRadius:10,padding:"0.75rem",border:"1px solid #1e3a5f"}}>
                    <div style={{fontSize:"0.7rem",color:"#64748b",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>
                      Drowsiness Confidence
                      <span style={{marginLeft:6,color:"#475569",fontWeight:400,textTransform:"none",letterSpacing:0}}>
                        M1(10%) · M2(35%) · M3(25%) · M4(15%) · M5(15%)
                      </span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:16}}>
                      <DwConfGauge value={dwConf} label={dwVerdict||"Waiting"} color={verdictColor(dwVerdict)}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:"2rem",fontWeight:800,color:verdictColor(dwVerdict),lineHeight:1}}>
                          {dwConf!=null ? `${Math.round(dwConf*100)}%` : "—"}
                        </div>
                        <div style={{fontSize:"0.7rem",color:"#64748b",marginBottom:10}}>Drowsy probability</div>
                        <div style={{fontSize:"0.7rem",color:"#94a3b8",fontWeight:600,marginBottom:4}}>Alert Streak</div>
                        <StreakBar count={dwStreak} threshold={CONSECUTIVE_THRESHOLD}/>
                      </div>
                    </div>
                  </div>

                  {/* ── Session analytics (solo tab only) ── */}
                  {activePanel==="drowsiness" && <div style={{background:"#0d1f35",borderRadius:10,padding:"0.75rem",border:"1px solid #1e3a5f"}}>
                    <div style={{fontSize:"0.7rem",color:"#64748b",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>
                      Session Analytics
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem"}}>
                      {[
                        {label:"Frames Analyzed", val: dwFrames>0?dwFrames:"—", color:"#f1f5f9"},
                        {label:"Drowsy Frames",   val: dwFrames>0?`${dwDrowsyFrames} (${Math.round(dwDrowsyFrames/Math.max(1,dwFrames)*100)}%)`:"—", color: dwDrowsyFrames>0?"#f59e0b":"#22c55e"},
                        {label:"Alerts Triggered",val: shiftActive?dwAlerts:"—", color: dwAlerts>0?"#ef4444":"#22c55e"},
                        {label:"Verdict",          val: dwVerdict||"—", color: verdictColor(dwVerdict)},
                      ].map(({label,val,color})=>(
                        <div key={label} style={{background:"#071828",borderRadius:7,padding:"0.4rem 0.6rem",border:"1px solid #1e293b"}}>
                          <div style={{fontSize:"0.62rem",color:"#64748b",marginBottom:2}}>{label}</div>
                          <div style={{fontSize:"0.85rem",fontWeight:700,color}}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>}

                  {/* ── Facial features ── */}
                  <div style={{background:"#0d1f35",borderRadius:10,padding:"0.75rem",border:"1px solid #1e3a5f"}}>
                    <div style={{fontSize:"0.7rem",color:"#64748b",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>
                      Facial Features
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"0.35rem"}}>
                      {[
                        {label:"EAR",       val:dwFeatures.ear?.toFixed(3),       unit:"",  warn:dwFeatures.ear!=null&&dwFeatures.ear<0.25},
                        {label:"MAR",       val:dwFeatures.mar?.toFixed(3),       unit:"",  warn:dwFeatures.mar!=null&&dwFeatures.mar>0.60},
                        {label:"Pitch",     val:dwFeatures.pitch?.toFixed(1),     unit:"°", warn:dwFeatures.pitch!=null&&Math.abs(dwFeatures.pitch)>20},
                        {label:"Yaw",       val:dwFeatures.yaw?.toFixed(1),       unit:"°", warn:dwFeatures.yaw!=null&&Math.abs(dwFeatures.yaw)>30},
                        {label:"Eye Blink", val:dwFeatures.eye_closure?.toFixed(2),unit:"", warn:dwFeatures.eye_closure!=null&&dwFeatures.eye_closure>0.45},
                        {label:"PERCLOS",   val:dwFeatures.perclos!=null?`${Math.round(dwFeatures.perclos*100)}`:null, unit:"%", warn:dwFeatures.perclos!=null&&dwFeatures.perclos>0.30},
                        {label:"Yawn",      val:dwFeatures.yawn_freq!=null?`${Math.round(dwFeatures.yawn_freq*100)}`:null, unit:"%", warn:dwFeatures.yawn_freq!=null&&dwFeatures.yawn_freq>0.20},
                      ].map(({label,val,unit,warn})=>(
                        <div key={label} style={{background: warn?"#7f1d1d22":"#071828", borderRadius:7,padding:"0.35rem 0.6rem",
                          border:`1px solid ${warn?"#ef444444":"#1e293b"}`}}>
                          <div style={{fontSize:"0.6rem",color:warn?"#f87171":"#64748b",fontWeight:600,letterSpacing:"0.04em"}}>{label}</div>
                          <div style={{fontSize:"0.82rem",fontWeight:700,color:warn?"#ef4444":"#e2e8f0"}}>
                            {val!=null?`${val}${unit}`:"—"}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{marginTop:6,fontSize:"0.62rem",color:"#475569",display:"flex",gap:8,flexWrap:"wrap"}}>
                      <span>EAR &lt;0.25 → closing</span>
                      <span>PERCLOS &gt;30% → sustained</span>
                      <span>Yawn &gt;20% → frequent</span>
                    </div>
                  </div>

                  {/* ── Model probability bars ── */}
                  <div style={{background:"#0d1f35",borderRadius:10,padding:"0.75rem",border:"1px solid #1e3a5f"}}>
                    <div style={{fontSize:"0.7rem",color:"#64748b",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>
                      Model Ensemble
                    </div>
                    {[
                      {name:"M1 EfficientNet-B0", weight:"10%", key:"m1"},
                      {name:"M2 CNN + LSTM",       weight:"35%", key:"m2"},
                      {name:"M3 Reliability Fusion",weight:"25%",key:"m3"},
                      {name:"M4 CNN + Transformer",weight:"15%", key:"m4"},
                      {name:"M5 CNN + MS-TCN",     weight:"15%", key:"m5"},
                    ].map(({name,weight,key})=>{
                      const prob = dwResult?.models?.[key]?.drowsy_prob;
                      const avail = dwResult?.models?.[key]?.available;
                      const pct = prob!=null ? Math.round(prob*100) : null;
                      const col = prob==null?null : prob>0.6?"#ef4444":prob>0.4?"#f59e0b":"#22c55e";
                      return (
                        <div key={key} style={{marginBottom:6}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.68rem",marginBottom:2}}>
                            <span style={{color:"#94a3b8"}}>{name} <span style={{color:"#475569"}}>({weight})</span></span>
                            <span style={{color:col??"#475569",fontWeight:600}}>{pct!=null?`${pct}%`:avail===false?"—":"…"}</span>
                          </div>
                          <div style={{height:4,background:"#1e293b",borderRadius:2,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${pct??0}%`,background:col??"#334155",borderRadius:2,transition:"width 0.4s ease"}}/>
                          </div>
                        </div>
                      );
                    })}
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
                            <div className="as-rsign-det-name">{formatLabel(rsSignInfo?.class_name)}</div>
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
                          <span className="as-rsign-log-name">{formatLabel(entry?.class_name)}</span>
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

          {/* ── Top Bar ── */}
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

          {/* ── Alerts bar ── */}
          {(cheating || dwResult?.alert) && (
            <div className="hud-alerts-bar">
              {dwResult?.alert && (
                <div className="hud-alert red"><IcoAlert/> DROWSINESS — Pull over immediately!</div>
              )}
              {cheating && (
                <div className="hud-alert red"><IcoAlert/> DISTRACTION: {emResult?.objects?.labels?.join(", ")}</div>
              )}
            </div>
          )}

          {/* ── Body: Left cams | Map | Right panels ── */}
          <div className="hud-body">

            {/* ── LEFT: Two webcam feeds ── */}
            <div className="hud-left-col">
              <div className="hud-cam-wrap">
                <span className="hud-cam-label">
                  <span className="hud-cam-dot" style={{background: dwConnected ? "#22c55e" : "#64748b"}}/>
                  Driver
                </span>
                <video
                  ref={el => { if (el && streamRef.current && !el.srcObject) el.srcObject = streamRef.current; }}
                  autoPlay playsInline muted
                  className="hud-cam-video"
                  style={{transform:"scaleX(-1)"}}
                />
                {dwResult?.face_detected != null && (
                  <span className="hud-cam-badge" style={{color: dwResult.face_detected?"#22c55e":"#ef4444"}}>
                    {dwResult.face_detected ? "Face OK" : "No Face"}
                  </span>
                )}
              </div>

              <div className="hud-cam-wrap">
                <span className="hud-cam-label">
                  <span className="hud-cam-dot" style={{background:"#3b82f6"}}/>
                  Road
                </span>
                <video
                  ref={el => { if (el && streamRef2.current && !el.srcObject) el.srcObject = streamRef2.current; }}
                  autoPlay playsInline muted
                  className="hud-cam-video"
                />
                {activeSceneFrame && (
                  <span className="hud-cam-badge" style={{color: hazardColor(rsHazardLevel)}}>
                    {rsHazardLevel || "Clear"}
                  </span>
                )}
              </div>

              {/* ── SCENE ANALYSE (left col) ── */}
              {(()=>{
                const hCol = hazardColor(rsHazardLevel);
                return (
                  <div className="hud-ac hud-ac--scene-mini" style={{marginTop:"0.4rem"}}>
                    <div className="hud-ac-header">
                      <span className="hud-ac-icon">🎬</span>
                      <span className="hud-ac-title">Scene Analyse</span>
                      {rsHazardLevel && (
                        <span className="hud-ac-badge" style={{color:hCol,borderColor:hCol+"55",background:hCol+"11"}}>
                          {rsHazardLevel}
                        </span>
                      )}
                    </div>
                    {activeSceneFrame ? (
                      <>
                        <div className="hud-ac-score-row">
                          <div className="hud-ac-score" style={{color:hCol,fontSize:"1.3rem"}}>
                            {activeSceneFrame.hazard?.score!=null?activeSceneFrame.hazard.score.toFixed(1):"—"}
                          </div>
                          <div className="hud-ac-score-label">scene score</div>
                        </div>
                        <div className="hud-scene-segs" style={{marginTop:"0.2rem"}}>
                          {activeSceneFrame.segments?.slice(0,3).map(seg=>(
                            <div key={seg.id} className="hud-scene-seg">
                              <span className="hud-scene-dot" style={{background:seg.color}}/>
                              <span className="hud-scene-seg-label">{seg.label}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="hud-ac-idle">Analysing…</div>
                    )}
                  </div>
                );
              })()}

              {/* ── MAP RISK (left col) ── */}
              {(()=>{
                const mapRisk = hzPoint ? Math.min(100, Math.max(0, hzPoint.risk * 100)) : null;
                const mapLabel = hzPoint?.risk_label || "—";
                const mCol = hzPoint?.risk >= 0.7 ? "#ef4444" : hzPoint?.risk >= 0.4 ? "#f59e0b" : "#22c55e";
                return (
                  <div className="hud-ac" style={{marginTop:"0.4rem"}}>
                    <div className="hud-ac-header">
                      <span className="hud-ac-icon">🗺️</span>
                      <span className="hud-ac-title">Map Risk</span>
                      {hzPoint && (
                        <span className="hud-ac-badge" style={{color:mCol,borderColor:mCol+"55",background:mCol+"11"}}>
                          {mapLabel}
                        </span>
                      )}
                    </div>
                    <div className="hud-ac-score-row">
                      <div className="hud-ac-score" style={{color:mCol,fontSize:"1.3rem"}}>
                        {mapRisk!=null?mapRisk.toFixed(1):"—"}
                      </div>
                      <div className="hud-ac-score-label">terrain score</div>
                    </div>
                    {hzPoint?.road_name && (
                      <div style={{fontSize:"0.62rem",color:"#64748b",marginTop:"0.2rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        📍 {hzPoint.road_name}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="hud-esc-hint" style={{marginTop:"auto"}}>Press <kbd>ESC</kbd> to exit</div>
            </div>

            {/* ── CENTER: Map + Hazard cards ── */}
            <div className="hud-map-area">
              <div ref={hudMapRef} className="hud-map"/>
              <div className="hud-hz-cards">
                <HazardDashPanel currentPoint={hzPoint} nextPoints={pd?.slice(hzIdx)} isFinished={hzFinished} totalDistance={pd?.length ? pd[pd.length-1].distance : 0}/>
              </div>
            </div>

            {/* ── RIGHT: Alert-focused analysis panels ── */}
            <div className="hud-right-col">

              {/* ── DROWSINESS ── */}
              {(()=>{
                const isDrowsy  = dwVerdict === "Drowsy";
                const isAlert   = !!dwResult?.alert;
                const cardCls   = `hud-ac${isAlert?" hud-ac--danger":isDrowsy?" hud-ac--warn":""}`;
                const scoreCol  = isAlert?"#ef4444":isDrowsy?"#f59e0b":"#22c55e";
                return (
                  <div className={cardCls}>
                    <div className="hud-ac-header">
                      <span className="hud-ac-icon">😴</span>
                      <span className="hud-ac-title">Drowsiness</span>
                      <span className="hud-ac-badge" style={{background: isAlert?"#ef444422":isDrowsy?"#f59e0b22":"#22c55e22",
                        color: scoreCol, borderColor: scoreCol+"55"}}>
                        {isAlert?"⚠ ALERT":isDrowsy?"DROWSY":"ALERT"}
                      </span>
                    </div>
                    <div className="hud-ac-score-row">
                      <div className="hud-ac-score" style={{color: scoreCol}}>
                        {dwConf!=null?`${(dwConf*100).toFixed(0)}%`:"—"}
                      </div>
                      <div className="hud-ac-score-label">confidence</div>
                    </div>
                    <div className="hud-ac-streak">
                      {Array.from({length:CONSECUTIVE_THRESHOLD}).map((_,i)=>(
                        <div key={i} className={`hud-streak-dot${i<dwStreak?" active":""}`}
                          style={{background: i<dwStreak?(isAlert?"#ef4444":"#f59e0b"):"#1e293b"}}/>
                      ))}
                      <span className="hud-streak-label">{dwStreak}/{CONSECUTIVE_THRESHOLD} streak</span>
                    </div>
                  </div>
                );
              })()}

              {/* ── EMOTION ── */}
              {(()=>{
                const isDistract = cheating;
                const ea = getEmotionAlert();
                const alertColor = ea.tone==="safe"?"#22c55e":ea.tone==="warn"?"#f59e0b":ea.tone==="danger"?"#ef4444":"#475569";
                const cardCls = `hud-ac${isDistract?" hud-ac--danger":ea.tone==="danger"?" hud-ac--warn":""}`;
                return (
                  <div className={cardCls}>
                    <div className="hud-ac-header">
                      <span className="hud-ac-icon">😊</span>
                      <span className="hud-ac-title">Emotion</span>
                      {isDistract && (
                        <span className="hud-ac-badge" style={{background:"#ef444422",color:"#ef4444",borderColor:"#ef444455"}}>
                          ⚠ DISTRACTION
                        </span>
                      )}
                    </div>
                    <div className="hud-ac-score-row">
                      <div className="hud-ac-score" style={{color: alertColor, fontSize:"1.5rem", fontWeight:800, letterSpacing:"0.05em"}}>
                        {ea.label.toUpperCase()}
                      </div>
                    </div>
                    <div className="hud-ac-sub-row">
                      <span style={{color:"#64748b",fontSize:"0.68rem"}}>{ea.message}</span>
                    </div>
                    <div className="hud-ac-sub-row" style={{marginTop:2}}>
                      <span style={{color:"#64748b"}}>BVI</span>
                      <span style={{color: alertColor, fontWeight:700}}>
                        {bviScore?.toFixed(3)??"—"}
                      </span>
                      {isDistract && (
                        <span style={{color:"#ef4444",fontSize:"0.62rem",marginLeft:"auto"}}>
                          {emResult?.objects?.labels?.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── ROAD SIGN ── */}
              {(()=>{
                const instr = rsSignInfo ? getSignInstruction(rsSignInfo.class_name) : null;
                const pc    = instr ? PRIORITY_COLORS[instr.priority] : null;
                const isHighPriority = instr?.priority === "critical" || instr?.priority === "high";
                const cardCls = `hud-ac${isHighPriority?" hud-ac--warn":""}`;
                return (
                  <div className={cardCls}>
                    <div className="hud-ac-header">
                      <span className="hud-ac-icon">🚦</span>
                      <span className="hud-ac-title">Road Sign</span>
                      {instr && (
                        <span className="hud-ac-badge" style={{background:pc?.badge ? pc.badge+"33" : "transparent",
                          color:"#fff", borderColor:pc?.border||"#334155"}}>
                          {instr.priorityLabel}
                        </span>
                      )}
                    </div>
                    {rsSignInfo ? (
                      <>
                        <div className="hud-ac-score-row" style={{gap:10}}>
                          <span style={{fontSize:"1.8rem"}}>{instr?.icon||"🔍"}</span>
                          <div>
                            <div style={{fontSize:"0.82rem",fontWeight:700,color:"#f1f5f9",textTransform:"capitalize",lineHeight:1.2}}>
                              {formatLabel(rsSignInfo.class_name)}
                            </div>
                            <div style={{fontSize:"0.62rem",color:"#64748b"}}>
                              {(rsSignInfo.confidence*100).toFixed(0)}% confidence
                            </div>
                          </div>
                        </div>
                        {instr?.instructions?.[0] && (
                          <div style={{fontSize:"0.65rem",color:"#94a3b8",borderTop:"1px solid #1e2d44",paddingTop:"0.3rem",marginTop:"0.2rem"}}>
                            {instr.instructions[0]}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="hud-ac-idle">Scanning for road signs…</div>
                    )}
                  </div>
                );
              })()}

              {/* ── FUSION OUTPUT ── */}
              {(()=>{
                const sceneScore = activeSceneFrame?.hazard?.score ?? null;
                const mapScore   = hzPoint ? Math.min(100, Math.max(0, hzPoint.risk * 100)) : null;
                const fusionScore = (sceneScore != null && mapScore != null)
                  ? Math.min(100, Math.max(0, sceneScore * 0.56 + mapScore * 0.44))
                  : sceneScore != null ? sceneScore
                  : mapScore != null  ? mapScore
                  : null;
                const fusionLevel = fusionScore == null ? "—"
                  : fusionScore >= 70 ? "Critical"
                  : fusionScore >= 40 ? "High"
                  : fusionScore >= 20 ? "Medium"
                  : "Low";
                const LEVELS = ["Low","Medium","High","Critical"];
                const levelColors = { Low:"#22c55e", Medium:"#f59e0b", High:"#ef4444", Critical:"#dc2626" };
                const fCol = levelColors[fusionLevel] || "#475569";
                const isHighFusion = fusionLevel === "High" || fusionLevel === "Critical";
                const cardCls = `hud-ac hud-ac--fusion${isHighFusion?" hud-ac--warn":""}`;
                return (
                  <div className={cardCls}>
                    <div className="hud-ac-header">
                      <span className="hud-ac-icon">🧠</span>
                      <span className="hud-ac-title">Fusion Output</span>
                      {fusionLevel !== "—" && (
                        <span className="hud-ac-badge" style={{color:fCol,borderColor:fCol+"55",background:fCol+"11"}}>
                          {fusionLevel}
                        </span>
                      )}
                    </div>
                    <div className="hud-ac-score-row">
                      <div className="hud-ac-score" style={{color:fCol,fontSize:"2rem",fontWeight:800}}>
                        {fusionScore!=null?fusionScore.toFixed(1):"—"}
                      </div>
                      <div className="hud-ac-score-label">final risk</div>
                    </div>
                    <div className="hud-fusion-levels">
                      {LEVELS.map(lvl=>(
                        <div key={lvl} className={`hud-fusion-chip${fusionLevel===lvl?" hud-fusion-chip--active":""}`}
                          style={{
                            color: fusionLevel===lvl ? levelColors[lvl] : "#475569",
                            borderColor: fusionLevel===lvl ? levelColors[lvl]+"88" : "#1e293b",
                            background: fusionLevel===lvl ? levelColors[lvl]+"18" : "transparent",
                          }}>
                          {lvl}
                        </div>
                      ))}
                    </div>
                    <div className="hud-fusion-inputs" style={{marginTop:"0.35rem"}}>
                      <div className="hud-fusion-input-row">
                        <span style={{color:"#64748b",fontSize:"0.62rem"}}>Scene</span>
                        <div className="hud-fusion-bar-wrap">
                          <div className="hud-fusion-bar" style={{width:`${sceneScore??0}%`,background:"#3b82f6"}}/>
                        </div>
                        <span style={{color:"#94a3b8",fontSize:"0.62rem",minWidth:"2.2rem",textAlign:"right"}}>{sceneScore!=null?sceneScore.toFixed(0):"—"}</span>
                      </div>
                      <div className="hud-fusion-input-row">
                        <span style={{color:"#64748b",fontSize:"0.62rem"}}>Route</span>
                        <div className="hud-fusion-bar-wrap">
                          <div className="hud-fusion-bar" style={{width:`${mapScore??0}%`,background:"#10b981"}}/>
                        </div>
                        <span style={{color:"#94a3b8",fontSize:"0.62rem",minWidth:"2.2rem",textAlign:"right"}}>{mapScore!=null?mapScore.toFixed(0):"—"}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>{/* end hud-right-col */}
          </div>{/* end hud-body */}
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
