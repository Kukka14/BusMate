import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";

// ── Inline SVG Icons ─────────────────────────────────────────────────────────
const IconBrain  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2 13a3 3 0 0 1 3-3 .5.5 0 0 0 .5-.5 3 3 0 0 1 4-2.83"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 22 13a3 3 0 0 0-3-3 .5.5 0 0 1-.5-.5 3 3 0 0 0-4-2.83"/></svg>;
const IconEye    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconShield = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IconStar   = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const IconCheck  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>;
const IconMenu   = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <nav className="hp-nav">
      <div className="hp-nav-inner">
        <span className="hp-logo" onClick={() => navigate("/")}>
          <span className="hp-logo-dot" />DriveGuard
        </span>
        <div className={`hp-nav-links ${open ? "open" : ""}`}>
          <a href="#features">Features</a>
          <a href="#technology">Technology</a>
          <a href="#stats">Analytics</a>
          <a href="#about">About</a>
        </div>
        <div className="hp-nav-actions">
          <button className="hp-btn-outline" onClick={() => navigate("/live")}>Live Demo</button>
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
          <span className="hp-hero-badge">AI-Powered Driver Safety</span>
          <h1 className="hp-hero-title">
            Preventing <span className="hp-accent">94%</span> of human-error
            road accidents with AI-driven real-time behavioral analysis
          </h1>
          <p className="hp-hero-sub">
            Empowering fleets with professional-grade AI to ensure safety,
            efficiency, and real-time monitoring of driver behaviour.
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
          <div className="hp-dashboard-mock">
            <div className="hp-mock-bar">
              <span className="hp-mock-dot red" /><span className="hp-mock-dot yellow" /><span className="hp-mock-dot green" />
              <span className="hp-mock-title">Live Monitor — Driver Cam</span>
            </div>
            <div className="hp-mock-body">
              <div className="hp-mock-cam">
                <div className="hp-mock-face">
                  <div className="hp-mock-eye left" />
                  <div className="hp-mock-eye right" />
                  <div className="hp-mock-mouth" />
                </div>
                <div className="hp-mock-scan" />
                <div className="hp-mock-label">● LIVE</div>
              </div>
              <div className="hp-mock-metrics">
                <div className="hp-mock-metric">
                  <span className="hp-mock-metric-name">Happy</span>
                  <div className="hp-mock-metric-bar"><div className="hp-bar-fill green" style={{width:"82%"}} /></div>
                  <span className="hp-mock-metric-pct">82%</span>
                </div>
                <div className="hp-mock-metric">
                  <span className="hp-mock-metric-name">Neutral</span>
                  <div className="hp-mock-metric-bar"><div className="hp-bar-fill yellow" style={{width:"55%"}} /></div>
                  <span className="hp-mock-metric-pct">55%</span>
                </div>
                <div className="hp-mock-metric">
                  <span className="hp-mock-metric-name">Drowsy</span>
                  <div className="hp-mock-metric-bar"><div className="hp-bar-fill red" style={{width:"12%"}} /></div>
                  <span className="hp-mock-metric-pct">12%</span>
                </div>
                <div className="hp-mock-metric">
                  <span className="hp-mock-metric-name">Angry</span>
                  <div className="hp-mock-metric-bar"><div className="hp-bar-fill orange" style={{width:"5%"}} /></div>
                  <span className="hp-mock-metric-pct">5%</span>
                </div>
              </div>
            </div>
            <div className="hp-mock-badge">
              Safety Improvement&nbsp;<strong>94% ↑</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function Stats() {
  const stats = [
    { value: "94%",   label: "Accident Reduction",  sub: "Based on verified fleet data 2025" },
    { value: "99.9%", label: "Real-Time Accuracy",   sub: "Emotion & object detection uptime" },
    { value: "500+",  label: "Active Fleets",         sub: "Deploying DriveGuard globally"    },
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
    icon: <IconBrain />,
    title: "Hybrid Drowsiness Detection",
    desc: "Continuous eye-tracking and neural pattern analysis detecting fatigue patterns through monitoring and steering behaviour before it becomes a risk.",
  },
  {
    icon: <IconEye />,
    title: "Emotion Shift Profile Analysis",
    desc: "Monitors emotional patterns and facial micro-expressions to identify stress, distraction, or road aggression in real time.",
  },
  {
    icon: <IconShield />,
    title: "Robust Road Sign Detection",
    desc: "Industry-leading computer vision with accurate recognition of traffic signs and temporary roadworks in all weather conditions.",
  },
  {
    icon: <IconStar />,
    title: "Score Validation",
    desc: "Comprehensive accumulative safety score calculation, consistently updating for higher accountability in compliance and reporting.",
  },
];

function Features() {
  return (
    <section className="hp-features" id="features">
      <div className="hp-section-header">
        <h2>Advanced AI Safety Suite</h2>
        <p>
          Our modern B2B SaaS platform provides comprehensive monitoring and detection tools
          for modern transportation fleets, ensuring driver wellness and operational excellence.
        </p>
      </div>
      <div className="hp-features-grid">
        {FEATURES.map((f) => (
          <div className="hp-feature-card" key={f.title}>
            <div className="hp-feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Product Screenshots ───────────────────────────────────────────────────────
function ProductScreenshots() {
  return (
    <section className="hp-products" id="technology">
      {/* Fleet Portal */}
      <div className="hp-product-card">
        <div className="hp-product-screen fleet-screen">
          <div className="hp-ps-bar">
            <span className="hp-ps-dot" style={{background:"#ff5f57"}}/>
            <span className="hp-ps-dot" style={{background:"#febc2e"}}/>
            <span className="hp-ps-dot" style={{background:"#28c840"}}/>
            <span className="hp-ps-title">Fleet Management Portal</span>
          </div>
          <div className="hp-ps-body">
            <div className="hp-ps-sidebar">
              {["Dashboard","Drivers","Alerts","Reports","Settings"].map(i=>(
                <div className="hp-ps-nav" key={i}>{i}</div>
              ))}
            </div>
            <div className="hp-ps-main">
              <div className="hp-ps-row">
                <div className="hp-ps-block" style={{width:"58%"}}/>
                <div className="hp-ps-block" style={{width:"36%"}}/>
              </div>
              <div className="hp-ps-row">
                <div className="hp-ps-block" style={{width:"100%", height:"48px"}}/>
              </div>
              <div className="hp-ps-row">
                <div className="hp-ps-block" style={{width:"46%"}}/>
                <div className="hp-ps-block" style={{width:"46%"}}/>
              </div>
              <div className="hp-ps-row">
                <div className="hp-ps-block" style={{width:"100%"}}/>
              </div>
            </div>
          </div>
        </div>
        <h3>Fleet Management Portal</h3>
        <p>Centralised B2B fleet-level metrics for operations managers.</p>
      </div>

      {/* Driver App */}
      <div className="hp-product-card">
        <div className="hp-product-screen driver-screen">
          <div className="hp-ps-bar">
            <span className="hp-ps-dot" style={{background:"#ff5f57"}}/>
            <span className="hp-ps-dot" style={{background:"#febc2e"}}/>
            <span className="hp-ps-dot" style={{background:"#28c840"}}/>
            <span className="hp-ps-title">Driver Safety App</span>
          </div>
          <div className="hp-ds-body">
            <div className="hp-ds-ring">
              <svg viewBox="0 0 80 80" width="80" height="80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#1e3a5f" strokeWidth="8"/>
                <circle cx="40" cy="40" r="34" fill="none" stroke="#3b82f6" strokeWidth="8"
                  strokeDasharray="180 214" strokeDashoffset="55" strokeLinecap="round"/>
              </svg>
              <span className="hp-ds-score">92</span>
            </div>
            <div className="hp-ds-label">Safety Score</div>
            <div className="hp-ds-rows">
              <div className="hp-ps-block" style={{width:"75%"}}/>
              <div className="hp-ps-block" style={{width:"55%", background:"#3b82f6"}}/>
              <div className="hp-ps-block" style={{width:"75%"}}/>
              <div className="hp-ps-block" style={{width:"90%"}}/>
            </div>
          </div>
        </div>
        <h3>Driver Safety App</h3>
        <p>Real-time safety feedback and wellness alerts for operators.</p>
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
        <h2>Ready to transform your fleet's safety standards?</h2>
        <p>Join 500+ global fleets reducing accidents and improving operational efficiency with DriveGuard AI.</p>
        <div className="hp-cta-btns">
          <button className="hp-btn-white" onClick={() => navigate("/signup")}>Get Started Free</button>
          <button className="hp-btn-outline-white" onClick={() => navigate("/contact")}>Contact Sales</button>
        </div>
        <ul className="hp-cta-checks">
          {["No credit card required", "Setup in under 10 minutes", "24/7 support included"].map((c) => (
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
        <span className="hp-logo"><span className="hp-logo-dot" />DriveGuard</span>
        <div className="hp-footer-links">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Cookie Policy</a>
          <a href="#">Sitemap</a>
        </div>
        <span className="hp-footer-copy">© 2026 DriveGuard. All rights reserved.</span>
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
      <ProductScreenshots />
      <CTABanner />
      <Footer />
    </div>
  );
}
