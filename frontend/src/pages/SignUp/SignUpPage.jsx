import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./SignUpPage.css";

// ── Icons ────────────────────────────────────────────────────────────────────
const IconMail    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;
const IconLock    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IconUser    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IconBuilding = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="15" rx="1"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="12.01"/></svg>;
const IconEyeOn   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconEyeOff  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
const IconArrow   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
const IconCheck   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>;
const IconAdmin   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IconDriver  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
const IconTick    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>;

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Password strength ─────────────────────────────────────────────────────────
function getStrength(pw) {
  let score = 0;
  if (pw.length >= 8)              score++;
  if (/[A-Z]/.test(pw))           score++;
  if (/[0-9]/.test(pw))           score++;
  if (/[^A-Za-z0-9]/.test(pw))   score++;
  return score; // 0–4
}
const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"];
const strengthColor = ["", "#ef4444", "#f59e0b", "#22c55e", "#10b981"];

// ── SignUp Page ────────────────────────────────────────────────────────────────
export default function SignUpPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: "",
    company: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [role, setRole]             = useState("driver");
  const [showPw, setShowPw]         = useState(false);
  const [showCPw, setShowCPw]       = useState(false);
  const [agree, setAgree]           = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState(false);

  const strength = getStrength(form.password);

  function set(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function validate() {
    if (!form.fullName.trim())           return "Full name is required.";
    if (!form.email.trim())              return "Email address is required.";
    if (!/\S+@\S+\.\S+/.test(form.email)) return "Enter a valid email address.";
    if (form.password.length < 8)        return "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword) return "Passwords do not match.";
    if (!agree)                          return "You must agree to the Terms of Service.";
    return null;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSignUp(e) {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          company: form.company.trim(),
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed. Please try again.");
        return;
      }
      setSuccess(true);
      setTimeout(() => navigate("/login", { state: { registered: true } }), 2000);
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="sp-root">
        <div className="sp-success-wrap">
          <div className="sp-success-icon"><IconCheck /></div>
          <h2>Account Created!</h2>
          <p>Redirecting you to the login page…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-root">
      {/* ── Header ── */}
      <header className="sp-header">
        <div className="sp-brand" onClick={() => navigate("/")}>
          <div className="sp-brand-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M3 9h18"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/><path d="M5.5 16v2M18.5 16v2"/></svg>
          </div>
          <span>BusMate</span>
        </div>
        <a className="sp-header-link" href="#">AI Driver Safety Platform</a>
      </header>

      {/* ── Card ── */}
      <main className="sp-main">
        <div className="sp-card">
          <div className="sp-card-header">
            <h1>Create Account</h1>
            <p>Join BusMate to access AI-powered driver safety monitoring.</p>
          </div>

          {error && <div className="sp-error" role="alert">{error}</div>}

          <form className="sp-form" onSubmit={handleSignUp} noValidate>
            <div className="sp-field-group">
              <label htmlFor="fullName">Full Name</label>
              <div className="sp-input-wrap">
                <span className="sp-input-icon"><IconUser /></span>
                <input
                  id="fullName"
                  type="text"
                  placeholder="John Smith"
                  value={form.fullName}
                  onChange={set("fullName")}
                  autoComplete="name"
                  required
                />
              </div>
            </div>

            {/* Company */}
            <div className="sp-field-group">
              <label htmlFor="company">Company / Fleet Name <span className="sp-optional">(optional)</span></label>
              <div className="sp-input-wrap">
                <span className="sp-input-icon"><IconBuilding /></span>
                <input
                  id="company"
                  type="text"
                  placeholder="Acme Logistics Ltd."
                  value={form.company}
                  onChange={set("company")}
                  autoComplete="organization"
                />
              </div>
            </div>

            {/* Email */}
            <div className="sp-field-group">
              <label htmlFor="email">Email Address</label>
              <div className="sp-input-wrap">
                <span className="sp-input-icon"><IconMail /></span>
                <input
                  id="email"
                  type="email"
                  placeholder="manager@fleet.com"
                  value={form.email}
                  onChange={set("email")}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="sp-field-group">
              <label htmlFor="password">Password</label>
              <div className="sp-input-wrap">
                <span className="sp-input-icon"><IconLock /></span>
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={set("password")}
                  autoComplete="new-password"
                  required
                />
                <button type="button" className="sp-eye-btn" onClick={() => setShowPw(!showPw)}>
                  {showPw ? <IconEyeOff /> : <IconEyeOn />}
                </button>
              </div>
              {form.password && (
                <div className="sp-strength">
                  <div className="sp-strength-bars">
                    {[1,2,3,4].map((n) => (
                      <div
                        key={n}
                        className="sp-strength-bar"
                        style={{ background: n <= strength ? strengthColor[strength] : "#1e293b" }}
                      />
                    ))}
                  </div>
                  <span className="sp-strength-label" style={{ color: strengthColor[strength] }}>
                    {strengthLabel[strength]}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="sp-field-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className={`sp-input-wrap ${form.confirmPassword && form.confirmPassword !== form.password ? "sp-input-error" : ""}`}>
                <span className="sp-input-icon"><IconLock /></span>
                <input
                  id="confirmPassword"
                  type={showCPw ? "text" : "password"}
                  placeholder="Re-enter password"
                  value={form.confirmPassword}
                  onChange={set("confirmPassword")}
                  autoComplete="new-password"
                  required
                />
                <button type="button" className="sp-eye-btn" onClick={() => setShowCPw(!showCPw)}>
                  {showCPw ? <IconEyeOff /> : <IconEyeOn />}
                </button>
              </div>
              {form.confirmPassword && form.confirmPassword !== form.password && (
                <span className="sp-field-err">Passwords do not match.</span>
              )}
            </div>

            {/* Terms */}
            <label className="sp-agree">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span className="sp-custom-check" />
              <span>
                I agree to the{" "}
                <a href="#" className="sp-link">Terms of Service</a> and{" "}
                <a href="#" className="sp-link">Privacy Policy</a>
              </span>
            </label>

            {/* Submit */}
            <button type="submit" className="sp-btn-signup" disabled={loading}>
              {loading ? <span className="sp-spinner" /> : <>Create Account <IconArrow /></>}
            </button>
          </form>

          {/* Already have account */}
          <p className="sp-signin-prompt">
            Already have an account?{" "}
            <button className="sp-signin-link" onClick={() => navigate("/login")}>
              Sign In
            </button>
          </p>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="sp-footer">
        <div className="sp-footer-links">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Compliance</a>
        </div>
        <span>&copy; {new Date().getFullYear()} BusMate. All rights reserved.</span>
      </footer>
    </div>
  );
}
