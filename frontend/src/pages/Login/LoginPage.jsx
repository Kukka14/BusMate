import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";

// ── Icons ────────────────────────────────────────────────────────────────────
const IconMail    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;
const IconLock    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IconEyeOn   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconEyeOff  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
const IconArrow   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
const IconShield  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IconAdmin   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IconDriver  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IconTick    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>;

// ── Fleet Login Card ─────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate = useNavigate();
  const [role, setRole]           = useState("driver");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [remember, setRemember]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [error, setError]         = useState("");

  // ── Standard login ─────────────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, role }),
        }
      );
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed."); return; }
      localStorage.setItem("token", data.token);
      localStorage.setItem("user",  JSON.stringify(data.user));
      if (remember) localStorage.setItem("remember_email", email);
      // Navigate based on role
      if (data.user.role === "admin") {
        navigate("/admin/dashboard");
      } else {
        navigate("/driver/dashboard");
      }
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  // ── SSO login ──────────────────────────────────────────────────────────────
  async function handleSSO() {
    setSsoLoading(true);
    setError("");
    try {
      const res  = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/auth/sso/login`
      );
      const data = await res.json();
      if (data.sso_url) {
        window.location.href = data.sso_url;          // redirect to IdP
      } else if (data.stub) {
        setError("SSO not configured — set SSO_PROVIDER_URL in backend .env");
      }
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setSsoLoading(false);
    }
  }

  return (
    <div className="lp-root">
      {/* ── Top bar ── */}
      <header className="lp-header">
        <div className="lp-brand" onClick={() => navigate("/")}>
          <div className="lp-brand-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <span>DriveGuard</span>
        </div>
        <a className="lp-header-link" href="#">Fleet Management Solutions</a>
      </header>

      {/* ── Card ── */}
      <main className="lp-main">
        <div className="lp-card">
          <div className="lp-card-header">
            <h1>Fleet Login</h1>
            <p>Access your secure dashboard to manage your fleet operations.</p>
          </div>

          {/* ── Role selector ── */}
          <div className="lp-role-group">
            <span className="lp-role-label">Sign in as</span>
            <div className="lp-role-toggle">
              <button
                type="button"
                className={`lp-role-btn ${role === "admin" ? "active" : ""}`}
                onClick={() => setRole("admin")}
              >
                <span className="lp-role-tick">{role === "admin" && <IconTick />}</span>
                <IconAdmin />
                Admin
              </button>
              <button
                type="button"
                className={`lp-role-btn ${role === "driver" ? "active" : ""}`}
                onClick={() => setRole("driver")}
              >
                <span className="lp-role-tick">{role === "driver" && <IconTick />}</span>
                <IconDriver />
                Driver
              </button>
            </div>
          </div>

          {error && <div className="lp-error" role="alert">{error}</div>}

          <form className="lp-form" onSubmit={handleLogin} noValidate>
            {/* Email */}
            <div className="lp-field-group">
              <label htmlFor="email">Email Address</label>
              <div className="lp-input-wrap">
                <span className="lp-input-icon"><IconMail /></span>
                <input
                  id="email"
                  type="email"
                  placeholder="manager@fleet.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="lp-field-group">
              <div className="lp-field-row">
                <label htmlFor="password">Password</label>
                <a href="#" className="lp-forgot">Forgot password?</a>
              </div>
              <div className="lp-input-wrap">
                <span className="lp-input-icon"><IconLock /></span>
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="lp-eye-btn"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <IconEyeOff /> : <IconEyeOn />}
                </button>
              </div>
            </div>

            {/* Remember */}
            <label className="lp-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className="lp-custom-check" />
              <span>Remember this device</span>
            </label>

            {/* Sign In */}
            <button
              type="submit"
              className="lp-btn-signin"
              disabled={loading}
            >
              {loading ? <span className="lp-spinner" /> : <>Sign In <IconArrow /></>}
            </button>
          </form>

          {/* Enterprise / SSO divider */}
          <div className="lp-divider">
            <span>ENTERPRISE ACCESS</span>
          </div>

          <button
            className="lp-btn-sso"
            onClick={handleSSO}
            disabled={ssoLoading}
          >
            {ssoLoading
              ? <span className="lp-spinner dark" />
              : <><IconShield /> Sign in with SSO</>}
          </button>

          <p className="lp-support">
            Need assistance?{" "}
            <a href="mailto:support@driveguard.ai">Contact IT Support</a>
          </p>
          <p className="lp-support" style={{ marginTop: "0.5rem" }}>
            Don&apos;t have an account?{" "}
            <button
              style={{ background:"none", border:"none", padding:0, color:"#3b82f6", cursor:"pointer", fontSize:"inherit", fontWeight:600 }}
              onClick={() => navigate("/signup")}
            >
              Sign Up
            </button>
          </p>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-footer-links">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Compliance</a>
        </div>
        <span>© 2026 DriveGuard Intelligent Fleet Systems. All rights reserved.</span>
      </footer>
    </div>
  );
}
