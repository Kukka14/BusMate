import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { io } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Sidebar from "../../components/common/Sidebar";
import "./ActiveShiftPage.css";

const API        = import.meta.env.VITE_API_URL || "http://localhost:5000";
const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Color helpers ─────────────────────────────────────────────────────────────
const EMOTION_COLOR = {
  happy:"#22c55e", neutral:"#64748b", sad:"#a78bfa", angry:"#ef4444",
  fearful:"#f97316", surprised:"#f59e0b", disgust:"#84cc16", disgusted:"#84cc16",
};
function bviColor(s) { return s==null?"#475569":s<0.30?"#22c55e":s<0.60?"#f59e0b":"#ef4444"; }
function verdictColor(v) { return v==="Drowsy"?"#ef4444":v==="Alert"?"#22c55e":"#475569"; }
function confColor(p) { return p==null?"#475569":p<0.30?"#22c55e":p<0.60?"#f59e0b":"#ef4444"; }
function hazardColor(l) { return l==="High"?"#ef4444":l==="Medium"?"#f59e0b":"#22c55e"; }

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoStop  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;
const IcoAlert = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const IcoUpload = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;

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

  // ── Shift state ─────────────────────────────────────────────────────────
  const [shiftActive, setShiftActive] = useState(false);
  const [shiftStart, setShiftStart]   = useState(null);
  const [elapsed, setElapsed]         = useState("00:00");
  const [activePanel, setActivePanel] = useState("all"); // "all"|"emotion"|"drowsiness"|"roadscene"|"hazard"

  // ── Shared webcam ───────────────────────────────────────────────────────
  const videoRef   = useRef(null);
  const captureRef = useRef(null);
  const streamRef  = useRef(null);
  const [camError, setCamError] = useState("");

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

  // ── Road Scene state ────────────────────────────────────────────────────
  const [rsFile, setRsFile]           = useState(null);
  const [rsVideoUrl, setRsVideoUrl]   = useState(null);
  const [rsResult, setRsResult]       = useState(null);
  const [rsLoading, setRsLoading]     = useState(false);
  const [rsActiveIdx, setRsActiveIdx] = useState(0);
  const rsVideoRef = useRef(null);

  // ── Hazard state ────────────────────────────────────────────────────────
  const [hzAnalysis, setHzAnalysis]   = useState(null);
  const [hzLoading, setHzLoading]     = useState(false);
  const [hzError, setHzError]         = useState("");
  const hzMapRef      = useRef(null);
  const hzMapInstance = useRef(null);
  const hzMarkerRef   = useRef(null);
  const hzAnimRef     = useRef(null);
  const [hzIdx, setHzIdx]             = useState(0);
  const [hzPoint, setHzPoint]         = useState(null);
  const [hzPlaying, setHzPlaying]     = useState(false);
  const [hzFinished, setHzFinished]   = useState(false);


  // ── Auth guard ──────────────────────────────────────────────────────────
  useEffect(() => { if (!token) navigate("/login"); }, [token, navigate]);

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
    navigator.mediaDevices
      .getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:"user"},audio:false})
      .then(s => {
        if (!active) { s.getTracks().forEach(t=>t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setCamError("Camera permission denied or not available."));
    return () => {
      active = false;
      if (streamRef.current) { streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  // Re-assign camera stream when video element appears (shift started)
  useEffect(() => {
    if (shiftActive && videoRef.current && streamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [shiftActive]);

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
  // ── HAZARD — Auto-analyze route on shift start ─────────────────────────
  async function analyzeRoute() {
    setHzLoading(true); setHzError(""); setHzAnalysis(null);
    try {
      const res = await fetch(`${API}/api/analyze-route`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({start_location:startTown,end_location:endTown,step_m:5}),
      });
      const data = await res.json();
      if (!res.ok||data.error) { setHzError(data.error||"Hazard analysis failed."); return; }
      setHzAnalysis(data);
    } catch { setHzError("Network error — backend not reachable."); }
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
    return () => { if(hzAnimRef.current) clearTimeout(hzAnimRef.current); };
  }, [shiftActive, activePanel]);

  // Invalidate map size whenever the panel visibility changes
  useEffect(() => {
    if (hzMapInstance.current && shiftActive) {
      setTimeout(() => hzMapInstance.current.invalidateSize(), 150);
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
  function handleRsFile(e) {
    const f=e.target.files[0]; if(!f) return;
    setRsFile(f); setRsVideoUrl(URL.createObjectURL(f)); setRsResult(null); setRsActiveIdx(0);
  }

  async function analyzeRsVideo() {
    if(!rsFile) return;
    setRsLoading(true); setRsResult(null);
    try {
      const fd=new FormData(); fd.append("file",rsFile);
      const res=await fetch(`${API}/rsa/analyse-video`,{method:"POST",body:fd});
      const data=await res.json();
      if(!res.ok||data.error) return;
      setRsResult(data);
    } catch {} finally { setRsLoading(false); }
  }

  function handleRsTimeUpdate() {
    if(!rsVideoRef.current||!rsResult?.frames?.length) return;
    const t=rsVideoRef.current.currentTime;
    let best=0,bestD=Infinity;
    rsResult.frames.forEach((f,i) => { const d=Math.abs(f.timestamp-t); if(d<bestD){bestD=d;best=i;} });
    if(best!==rsActiveIdx) setRsActiveIdx(best);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ── START / STOP SHIFT ─────────────────────────────────────────────────
  async function handleStartShift() {
    try {
      await fetch(`${API}/api/driver/shift/start`,{method:"POST",headers:{Authorization:`Bearer ${token}`}});
    } catch {}
    setShiftActive(true);
    setShiftStart(Date.now());
    setEmFrames(0); setDwFrames(0); setDwAlerts(0); setDwDrowsyFrames(0);
    // Auto-start hazard analysis
    analyzeRoute();
  }

  async function handleEndShift() {
    try {
      await fetch(`${API}/api/driver/shift/stop`,{method:"POST",headers:{Authorization:`Bearer ${token}`}});
    } catch {}
    setShiftActive(false); setShiftStart(null);
    setEmResult(null); setDwResult(null);
    setHzPlaying(false);
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
  const dwModels   = dwResult?.models||{};
  const dwFeatures = dwResult?.features||{};
  const dwStreak   = dwResult?.consecutive_frames??0;

  const rsFrame = rsResult?.frames?.[rsActiveIdx];
  const rsHazardLevel = rsFrame?.hazard?.level;

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
            <div className="as-avatar">{(user.username||"D")[0].toUpperCase()}</div>
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
          </div>
        )}

        {/* ── Panel selector tabs ──────────────────────────────── */}
        {shiftActive && (
          <div className="as-panel-tabs">
            {[
              {key:"all",label:"All Panels"},
              {key:"emotion",label:"Emotion"},
              {key:"drowsiness",label:"Drowsiness"},
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

        {/* Hidden canvas always mounted for frame capture */}
        <canvas ref={captureRef} style={{display:"none"}}/>

        {/* ═══════════════════ PANELS ═══════════════════════════ */}
        {shiftActive && (
          <div className={`as-panels ${activePanel==="all"?"grid":"single"}`}>

            {/* ── WEBCAM FEED (shared) ─────────────────────────── */}
            {(activePanel==="all"||activePanel==="emotion"||activePanel==="drowsiness") && (
              <div className={`as-panel as-cam-panel ${activePanel!=="all"?"wide":""}`}>
                <div className="as-panel-head">
                  <span className="as-panel-title">📹 Camera Feed</span>
                  <div className="as-panel-badges">
                    {emConnected && <span className="as-badge green">Emotion</span>}
                    {dwConnected && <span className="as-badge blue">Drowsiness</span>}
                  </div>
                </div>
                {camError && <div className="as-cam-error">{camError}</div>}
                <div className="as-cam-wrap">
                  <video ref={videoRef} autoPlay playsInline muted className="as-cam-video" style={{transform:"scaleX(-1)"}}/>
                </div>

                {/* Quick alert banners */}
                {cheating && (
                  <div className="as-alert-strip red"><IcoAlert/> DISTRACTION: {emResult?.objects?.labels?.join(", ")}</div>
                )}
                {dwResult?.alert && (
                  <div className="as-alert-strip red"><IcoAlert/> DROWSINESS ALERT — Pull over safely!</div>
                )}
              </div>
            )}

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

                  {/* Model bars */}
                  <div className="as-probs">
                    <ModelBar name="LSTM" weight="0.60" prob={dwModels.lstm} color={confColor(dwModels.lstm)}/>
                    <ModelBar name="RGB CNN" weight="0.25" prob={dwModels.rgb} color={confColor(dwModels.rgb)}/>
                    <ModelBar name="IR CNN" weight="0.15" prob={dwModels.ir} color={confColor(dwModels.ir)}/>
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

            {/* ── ROAD SCENE PANEL ──────────────────────────────── */}
            {(activePanel==="all"||activePanel==="roadscene") && (
              <div className={`as-panel as-rs-panel ${activePanel!=="all"?"wide":""}`}>
                <div className="as-panel-head">
                  <span className="as-panel-title">🛣 Road Scene Analysis</span>
                  {rsFrame && (
                    <span className="as-badge" style={{color:hazardColor(rsHazardLevel),borderColor:hazardColor(rsHazardLevel)}}>
                      Hazard: {rsHazardLevel}
                    </span>
                  )}
                </div>

                <div className="as-rs-body">
                  {/* Upload area */}
                  {!rsResult && (
                    <div className="as-rs-upload">
                      <label className="as-rs-upload-label">
                        <IcoUpload/> {rsFile ? rsFile.name : "Select a video file"}
                        <input type="file" accept="video/*" onChange={handleRsFile} style={{display:"none"}}/>
                      </label>
                      {rsFile && (
                        <button className="as-rs-analyze-btn" onClick={analyzeRsVideo} disabled={rsLoading}>
                          {rsLoading ? "Analyzing…" : "Analyze Video"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Video player + results */}
                  {rsVideoUrl && rsResult && (
                    <div className="as-rs-results">
                      <video ref={rsVideoRef} src={rsVideoUrl} controls className="as-rs-video"
                        onTimeUpdate={handleRsTimeUpdate}/>

                      {rsFrame && (
                        <div className="as-rs-detail">
                          {/* Overlay image */}
                          {rsFrame.overlay && (
                            <img src={`data:image/jpeg;base64,${rsFrame.overlay}`} alt="overlay" className="as-rs-overlay"/>
                          )}
                          {/* Hazard info */}
                          <div className="as-rs-hazard">
                            <div className="as-rs-hazard-score" style={{color:hazardColor(rsFrame.hazard?.level)}}>
                              {rsFrame.hazard?.score?.toFixed(1)} <small>hazard</small>
                            </div>
                            <div className="as-rs-hazard-level" style={{color:hazardColor(rsFrame.hazard?.level)}}>
                              {rsFrame.hazard?.level}
                            </div>
                          </div>
                          {/* Segment breakdown */}
                          <div className="as-rs-segs">
                            {rsFrame.segments?.slice(0,5).map(seg=>(
                              <div key={seg.id} className="as-rs-seg-row">
                                <span className="as-rs-seg-dot" style={{background:seg.color}}/>
                                <span className="as-rs-seg-label">{seg.label}</span>
                                <span className="as-rs-seg-pct">{seg.pixel_pct?.toFixed(1)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <button className="as-rs-reset-btn" onClick={()=>{setRsFile(null);setRsVideoUrl(null);setRsResult(null);}}>
                        Upload New Video
                      </button>
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

          </div>
        )}


      </main>

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
