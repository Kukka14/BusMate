import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";

// ── Inline SVG Icons ─────────────────────────────────────────────────────────
const IconEyeClose = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
const IconSmile    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>;
const IconSign     = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/></svg>;
const IconRoad     = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19L8 5"/><path d="M16 5l4 14"/><line x1="12" y1="6" x2="12" y2="8"/><line x1="12" y1="11" x2="12" y2="13"/><line x1="12" y1="16" x2="12" y2="19"/></svg>;
const IconCheck    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>;
const IconMenu     = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
const IconArrow    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;

// Component color map
const COMP_COLORS = {
  drowsiness: { bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.35)", accent: "#a78bfa", glow: "#8b5cf6" },
  emotion:    { bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.35)",  accent: "#60a5fa", glow: "#3b82f6" },
  roadsign:   { bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.35)",  accent: "#34d399", glow: "#10b981" },
  roadscene:  { bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.35)",  accent: "#fbbf24", glow: "#f59e0b" },
};

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <nav className="hp-nav">
      <div className="hp-nav-inner">
        <span className="hp-logo" onClick={() => navigate("/")}>
          <span className="hp-logo-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M3 9h18"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/><path d="M5.5 16v2M18.5 16v2"/></svg></span>BusMate
        </span>
        <div className={`hp-nav-links ${open ? "open" : ""}`}>
          <a href="#features">Features</a>
          <a href="#technology">How It Works</a>
          <a href="#stats">Analytics</a>
          <a href="#about">About</a>
        </div>
        <div className="hp-nav-actions">
          <button className="hp-btn-ghost" onClick={() => navigate("/login")}>Sign In</button>
          <button className="hp-btn-primary" onClick={() => navigate("/signup")}>Get Started</button>
        </div>
        <button className="hp-hamburger" onClick={() => setOpen(!open)}><IconMenu /></button>
      </div>
    </nav>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  const navigate = useNavigate();
  return (
    <section className="hp-hero">
      <div className="hp-hero-inner">
        <div className="hp-hero-text">
          <span className="hp-hero-badge">4-in-1 AI Safety Platform</span>
          <h1 className="hp-hero-title">
            Real-time <span className="hp-accent">AI-driven</span> driver
            monitoring for safer fleets
          </h1>
          <p className="hp-hero-sub">
            Drowsiness detection, emotion analysis, road sign recognition, and
            scene understanding — all working together to keep drivers safe.
          </p>
          <div className="hp-hero-btns">
            <button className="hp-btn-primary hp-btn-lg" onClick={() => navigate("/signup")}>
              Get Started Free
            </button>
            <button className="hp-btn-outline hp-btn-lg" onClick={() => navigate("/login")}>
              Sign In
            </button>
          </div>
        </div>
        <div className="hp-hero-visual">
          {/* 2x2 mini panels for each component */}
          <div className="hp-hero-grid">
            {/* Drowsiness */}
            <div className="hp-hero-panel" style={{borderColor: COMP_COLORS.drowsiness.border}}>
              <div className="hp-hp-header">
                <span className="hp-hp-dot" style={{background: COMP_COLORS.drowsiness.glow}} />
                <span className="hp-hp-label">Drowsiness</span>
              </div>
              <div className="hp-hp-body hp-hp-drowsiness">
                <div className="hp-hp-eye-wrap">
                  <svg width="48" height="28" viewBox="0 0 48 28">
                    <ellipse cx="24" cy="14" rx="22" ry="12" fill="none" stroke="#a78bfa" strokeWidth="2"/>
                    <circle cx="24" cy="14" r="6" fill="#a78bfa" opacity="0.8">
                      <animate attributeName="r" values="6;3;6" dur="3s" repeatCount="indefinite"/>
                    </circle>
                  </svg>
                </div>
                <div className="hp-hp-meter">
                  <div className="hp-hp-meter-fill" style={{width:"18%", background: COMP_COLORS.drowsiness.glow}} />
                </div>
                <span className="hp-hp-val" style={{color: COMP_COLORS.drowsiness.accent}}>Alert</span>
              </div>
            </div>
            {/* Emotion */}
            <div className="hp-hero-panel" style={{borderColor: COMP_COLORS.emotion.border}}>
              <div className="hp-hp-header">
                <span className="hp-hp-dot" style={{background: COMP_COLORS.emotion.glow}} />
                <span className="hp-hp-label">Emotion</span>
              </div>
              <div className="hp-hp-body hp-hp-emotion">
                <div className="hp-hp-bars">
                  {[{n:"Happy",w:"72%",c:"#22c55e"},{n:"Neutral",w:"48%",c:"#eab308"},{n:"Angry",w:"8%",c:"#ef4444"}].map(b=>(
                    <div className="hp-hp-bar-row" key={b.n}>
                      <span className="hp-hp-bar-lbl">{b.n}</span>
                      <div className="hp-hp-bar-track"><div className="hp-hp-bar-fill" style={{width:b.w, background:b.c}} /></div>
                    </div>
                  ))}
                </div>
                <span className="hp-hp-val" style={{color: COMP_COLORS.emotion.accent}}>BVI 82</span>
              </div>
            </div>
            {/* Road Sign */}
            <div className="hp-hero-panel" style={{borderColor: COMP_COLORS.roadsign.border}}>
              <div className="hp-hp-header">
                <span className="hp-hp-dot" style={{background: COMP_COLORS.roadsign.glow}} />
                <span className="hp-hp-label">Road Signs</span>
              </div>
              <div className="hp-hp-body hp-hp-roadsign">
                <div className="hp-hp-sign-icons">
                  <div className="hp-hp-sign-circle" style={{borderColor:"#ef4444"}}><span style={{color:"#ef4444", fontWeight:700, fontSize:"0.65rem"}}>50</span></div>
                  <div className="hp-hp-sign-triangle"><span style={{color:"#fbbf24", fontWeight:700, fontSize:"0.55rem"}}>!</span></div>
                  <div className="hp-hp-sign-circle" style={{borderColor:"#3b82f6"}}><span style={{color:"#3b82f6", fontWeight:700, fontSize:"0.55rem"}}>P</span></div>
                </div>
                <span className="hp-hp-val" style={{color: COMP_COLORS.roadsign.accent}}>3 detected</span>
              </div>
            </div>
            {/* Road Scene */}
            <div className="hp-hero-panel" style={{borderColor: COMP_COLORS.roadscene.border}}>
              <div className="hp-hp-header">
                <span className="hp-hp-dot" style={{background: COMP_COLORS.roadscene.glow}} />
                <span className="hp-hp-label">Road Scene</span>
              </div>
              <div className="hp-hp-body hp-hp-roadscene">
                <div className="hp-hp-scene-layers">
                  <div className="hp-hp-layer" style={{background:"#1e3a5f", height:"14px"}} />
                  <div className="hp-hp-layer" style={{background:"#374151", height:"10px"}} />
                  <div className="hp-hp-layer" style={{background:"#065f46", height:"18px"}} />
                  <div className="hp-hp-layer" style={{background:"#1e3a5f", height:"8px"}} />
                </div>
                <span className="hp-hp-val" style={{color: COMP_COLORS.roadscene.accent}}>16 classes</span>
              </div>
            </div>
            {/* Scan overlay */}
            <div className="hp-hero-grid-scan" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function Stats() {
  const stats = [
    { value: "4",     label: "AI Components",       sub: "Working together in real time" },
    { value: "16",    label: "Scene Classes",        sub: "Semantic road segmentation"    },
    { value: "7",     label: "Emotion Categories",   sub: "Continuous facial analysis"    },
    { value: "<1s",   label: "Detection Latency",    sub: "Real-time processing pipeline" },
  ];
  return (
    <section className="hp-stats" id="stats">
      {stats.map((s) => (
        <div className="hp-stat-item" key={s.label}>
          <div className="hp-stat-value">{s.value}</div>
          <div className="hp-stat-label">{s.label}</div>
          <div className="hp-stat-sub">{s.sub}</div>
        </div>
      ))}
    </section>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: <IconEyeClose />,
    color: COMP_COLORS.drowsiness,
    title: "Drowsiness Detection",
    desc: "Continuous eye-tracking and blink pattern analysis detecting fatigue before it becomes dangerous, with real-time alerts to keep drivers awake.",
    bullets: ["Eye aspect ratio monitoring", "Yawn detection", "Real-time alerts"],
  },
  {
    icon: <IconSmile />,
    color: COMP_COLORS.emotion,
    title: "Emotion Shift Profile Analysis",
    desc: "Monitors facial micro-expressions to identify stress, distraction, or road aggression. Computes a Behavioural Volatility Index (BVI) per driving shift.",
    bullets: ["7 emotion categories", "BVI scoring", "Shift-level analytics"],
  },
  {
    icon: <IconSign />,
    color: COMP_COLORS.roadsign,
    title: "Road Sign Detection",
    desc: "Industry-leading computer vision recognising speed limits, warnings, and regulatory signs with support for image, video, and live webcam feeds.",
    bullets: ["Image & video upload", "Live webcam detection", "Multi-model ensemble"],
  },
  {
    icon: <IconRoad />,
    color: COMP_COLORS.roadscene,
    title: "Road Scene Analysis",
    desc: "SegFormer-based semantic segmentation classifying road scenes into 16 categories with integrated hazard analysis using terrain and traffic data.",
    bullets: ["16-class segmentation", "Hazard risk scoring", "Elevation & traffic context"],
  },
];

function Features() {
  return (
    <section className="hp-features" id="features">
      <div className="hp-section-header">
        <span className="hp-hero-badge" style={{marginBottom:"1rem"}}>Core Components</span>
        <h2>Four AI Systems, One Platform</h2>
        <p>
          Each component runs independently yet feeds into a unified driver
          safety profile — giving fleet managers a complete picture.
        </p>
      </div>
      <div className="hp-features-grid">
        {FEATURES.map((f) => (
          <div className="hp-feature-card" key={f.title} style={{borderColor: f.color.border}}>
            <div className="hp-feature-icon" style={{background: f.color.bg, color: f.color.accent}}>
              {f.icon}
            </div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
            <ul className="hp-feature-bullets">
              {f.bullets.map(b => <li key={b}><IconCheck />{b}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── How It Works ──────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { num: "01", title: "Driver starts a shift", desc: "The system activates all 4 AI components simultaneously when the driver begins monitoring." },
    { num: "02", title: "Real-time analysis", desc: "Drowsiness, emotion, road signs, and scene data are processed in parallel with sub-second latency." },
    { num: "03", title: "Instant alerts", desc: "Critical safety events trigger immediate audio-visual alerts to the driver and notifications to fleet managers." },
    { num: "04", title: "Shift report", desc: "At the end of each shift, a comprehensive safety profile with BVI, drowsiness events, and scene logs is generated." },
  ];
  return (
    <section className="hp-howitworks" id="technology">
      <div className="hp-section-header">
        <span className="hp-hero-badge" style={{marginBottom:"1rem"}}>Technology</span>
        <h2>How It Works</h2>
        <p>From login to shift report — a seamless monitoring pipeline.</p>
      </div>
      <div className="hp-hiw-timeline">
        {steps.map((s, i) => (
          <div className="hp-hiw-step" key={s.num}>
            <div className="hp-hiw-num">{s.num}</div>
            <div className="hp-hiw-content">
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
            {i < steps.length - 1 && <div className="hp-hiw-connector" />}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── CTA Banner ────────────────────────────────────────────────────────────────
function CTABanner() {
  const navigate = useNavigate();
  return (
    <section className="hp-cta" id="about">
      <div className="hp-cta-inner">
        <h2>Ready to make every drive safer?</h2>
        <p>
          BusMate combines drowsiness detection, emotion analysis, road sign
          recognition, and scene understanding into one powerful platform.
        </p>
        <div className="hp-cta-btns">
          <button className="hp-btn-white" onClick={() => navigate("/signup")}>Get Started Free</button>
          <button className="hp-btn-outline-white" onClick={() => navigate("/login")}>Sign In</button>
        </div>
        <ul className="hp-cta-checks">
          {["4 AI components included", "Real-time monitoring", "No hardware required"].map((c) => (
            <li key={c}><IconCheck />{c}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="hp-footer">
      <div className="hp-footer-inner">
        <span className="hp-logo"><span className="hp-logo-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M3 9h18"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/><path d="M5.5 16v2M18.5 16v2"/></svg></span>BusMate</span>
        <div className="hp-footer-links">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
        </div>
        <span className="hp-footer-copy">&copy; {new Date().getFullYear()} BusMate. All rights reserved.</span>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div className="hp-root">
      <Navbar />
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <CTABanner />
      <Footer />
    </div>
  );
}
