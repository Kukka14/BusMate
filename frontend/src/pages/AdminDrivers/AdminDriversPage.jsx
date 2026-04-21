import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar/AdminSidebar";
import "./AdminDrivers.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* ── Tiny inline SVG icons ───────────────────────────────────────────────── */

const IcoPlus  = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IcoSearch= () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IcoEye   = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoPen   = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IcoTrash = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IcoX     = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;


/* ── helpers ─────────────────────────────────────────────────────────────── */
const initials = (name = "") =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

const fmt = (v) => v || <span className="drv-na">—</span>;

const EMPTY_FORM = {
  username: "", email: "", password: "", company: "",
  phone: "",
  license_number: "", license_expiry: "",
  experience_years: "",
};

/* ══════════════════════════════════════════════════════════════════════════ */
export default function AdminDriversPage() {
  const navigate = useNavigate();

  /* auth state is stored in a ref so StrictMode re-mount doesn't re-trigger */
  const tokenRef = useRef(null);
  const userRef  = useRef(null);

  const [drivers,  setDrivers ] = useState([]);
  const [loading,  setLoading ] = useState(true);
  const [error,    setError   ] = useState("");
  const [query,    setQuery   ] = useState("");

  /* modals */
  const [addOpen,   setAddOpen  ] = useState(false);
  const [editDriver,setEditDriver] = useState(null);   // driver object
  const [delDriver, setDelDriver ] = useState(null);   // driver object
  const [viewDriver,setViewDriver] = useState(null);   // driver object

  /* ── bootstrap: read token once ───────────────────────────────────────── */
  useEffect(() => {
    const tok  = localStorage.getItem("token");
    const usr  = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();

    if (!tok || usr.role !== "admin") {
      navigate("/login", { replace: true });
      return;
    }
    tokenRef.current = tok;
    userRef.current  = usr;
    fetchDrivers(tok);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── fetch ─────────────────────────────────────────────────────────────── */
  async function fetchDrivers(tok) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/admin/drivers/detailed`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.status === 401) { navigate("/login", { replace: true }); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load drivers");
      setDrivers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  /* ── add driver ────────────────────────────────────────────────────────── */
  async function handleAdd(form) {
    const tok = tokenRef.current;
    const res = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body: JSON.stringify({
        username: form.username,
        email:    form.email,
        password: form.password,
        company:  form.company,
        role:     "driver",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");

    /* update profile fields if provided */
    const profileFields = ["phone","license_number","license_expiry","experience_years"];
    const hasProfile = profileFields.some((k) => form[k]);
    if (hasProfile) {
      const newId = data.user?.id || data.user?._id || data.user_id;
      if (newId) {
        const body = {};
        profileFields.forEach((k) => { if (form[k]) body[k] = form[k]; });
        await fetch(`${API}/api/admin/drivers/${newId}/profile`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
          body: JSON.stringify(body),
        });
      }
    }
    await fetchDrivers(tok);
  }

  /* ── edit driver ───────────────────────────────────────────────────────── */
  async function handleEdit(id, form) {
    const tok = tokenRef.current;
    const accountBody = {};
    ["username","email","company","is_active"].forEach((k) => {
      if (form[k] !== undefined) accountBody[k] = form[k];
    });
    if (form.password) accountBody.password = form.password;

    if (Object.keys(accountBody).length) {
      const r = await fetch(`${API}/api/admin/drivers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify(accountBody),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || "Update failed"); }
    }

    const profileBody = {};
    ["phone","license_number","license_expiry","experience_years"].forEach((k) => {
      if (form[k] !== undefined) profileBody[k] = form[k];
    });
    if (Object.keys(profileBody).length) {
      await fetch(`${API}/api/admin/drivers/${id}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify(profileBody),
      });
    }
    await fetchDrivers(tok);
  }

  /* ── delete driver ─────────────────────────────────────────────────────── */
  async function handleDelete(id) {
    const tok = tokenRef.current;
    const res = await fetch(`${API}/api/admin/drivers/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Delete failed"); }
    setDelDriver(null);
    setDrivers((prev) => prev.filter((d) => d._id !== id));
  }

  /* ── filtered list ─────────────────────────────────────────────────────── */
  const filtered = drivers.filter((d) => {
    const q = query.toLowerCase();
    return (
      (d.username || "").toLowerCase().includes(q) ||
      (d.email    || "").toLowerCase().includes(q) ||
      (d.company  || "").toLowerCase().includes(q) ||
      (d.profile?.vehicle || "").toLowerCase().includes(q)
    );
  });

  /* ── render ─────────────────────────────────────────────────────────────── */
  const user = userRef.current || {};
  return (
    <div className="drv-root">

      {/* ── SIDEBAR ── */}
      <AdminSidebar activeKey="drivers" />

      {/* ── MAIN ── */}
      <div className="drv-main">

        {/* topbar */}
        <div className="drv-topbar">
          <div className="drv-topbar-left">
            <h1>Driver Management</h1>
            <p>View, add, and manage fleet drivers</p>
          </div>
          <div className="drv-topbar-right">
            <div className="drv-topbar-avatar">{initials(user.username || "A")}</div>
          </div>
        </div>

        {/* toolbar */}
        <div className="drv-toolbar">
          <label className="drv-search-box">
            <IcoSearch />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, company…"
            />
          </label>
          <span className="drv-count">{filtered.length} driver{filtered.length !== 1 ? "s" : ""}</span>
          <button className="drv-btn-primary" onClick={() => setAddOpen(true)}>
            <IcoPlus /> Add Driver
          </button>
        </div>

        {/* body */}
        <div className="drv-body">
          {loading && (
            <div className="drv-placeholder">
              <div className="drv-spinner" />
              <span>Loading drivers…</span>
            </div>
          )}

          {!loading && error && (
            <div className="drv-placeholder" style={{ color: "#f87171" }}>
              {error}
              <button className="drv-btn-ghost" onClick={() => fetchDrivers(tokenRef.current)}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && (
            <table className="drv-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Company</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "3rem", color: "#2d3f5a" }}>
                      No drivers found
                    </td>
                  </tr>
                )}
                {filtered.map((d) => (
                  <tr key={d._id}>
                    <td>
                      <div className="drv-who">
                        <div className="drv-who-av">{initials(d.username)}</div>
                        <div>
                          <span className="drv-who-name">{d.username}</span>
                          <span className="drv-who-email">{d.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>{fmt(d.company)}</td>
                    <td>{fmt(d.profile?.phone)}</td>
                    <td>
                      <span className={`drv-badge ${d.is_active ? "on" : "off"}`}>
                        {d.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="drv-actions">
                        <button className="drv-act view" title="View" onClick={() => setViewDriver(d)}><IcoEye /></button>
                        <button className="drv-act edit" title="Edit" onClick={() => setEditDriver(d)}><IcoPen /></button>
                        <button className="drv-act del"  title="Delete" onClick={() => setDelDriver(d)}><IcoTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── ADD MODAL ── */}
      {addOpen && (
        <DriverFormModal
          title="Add New Driver"
          initial={EMPTY_FORM}
          showPassword
          onClose={() => setAddOpen(false)}
          onSubmit={async (form) => { await handleAdd(form); setAddOpen(false); }}
        />
      )}

      {/* ── EDIT MODAL ── */}
      {editDriver && (
        <DriverFormModal
          title={`Edit — ${editDriver.username}`}
          initial={{
            username:        editDriver.username        || "",
            email:           editDriver.email           || "",
            password:        "",
            company:         editDriver.company         || "",
            phone:           editDriver.profile?.phone  || "",
            license_number:  editDriver.profile?.license_number || "",
            license_expiry:  editDriver.profile?.license_expiry || "",
            experience_years:editDriver.profile?.experience_years || "",
            is_active:       editDriver.is_active,
          }}
          showPassword
          showActive
          onClose={() => setEditDriver(null)}
          onSubmit={async (form) => { await handleEdit(editDriver._id, form); setEditDriver(null); }}
        />
      )}

      {/* ── DELETE CONFIRM ── */}
      {delDriver && (
        <DeleteModal
          driver={delDriver}
          onClose={() => setDelDriver(null)}
          onConfirm={() => handleDelete(delDriver._id)}
        />
      )}

      {/* ── VIEW DRAWER ── */}
      {viewDriver && (
        <ViewDrawer
          driver={viewDriver}
          onClose={() => setViewDriver(null)}
          onEdit={() => { setViewDriver(null); setEditDriver(viewDriver); }}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DriverFormModal — used for both Add and Edit
   ══════════════════════════════════════════════════════════════════════════ */
function DriverFormModal({ title, initial, showPassword, showActive, onClose, onSubmit }) {
  const [form, setForm] = useState({ ...initial });
  const [busy, setBusy] = useState(false);
  const [err,  setErr ] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await onSubmit(form);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drv-overlay" onClick={onClose}>
      <div className="drv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="drv-modal-head">
          <h3>{title}</h3>
          <button className="drv-icon-btn" onClick={onClose}><IcoX /></button>
        </div>

        {err && <div className="drv-err-bar">{err}</div>}

        <form className="drv-form" onSubmit={submit}>
          <p className="drv-section-label">Account</p>
          <div className="drv-field-row">
            <Field label="Username *" value={form.username} onChange={set("username")} required />
            <Field label="Email *"    value={form.email}    onChange={set("email")}    required type="email" />
          </div>
          <div className="drv-field-row">
            <Field label="Company"    value={form.company}  onChange={set("company")} />
            {showPassword && (
              <Field label={initial.password === "" && !showActive ? "Password *" : "New Password"}
                value={form.password} onChange={set("password")}
                type="password"
                required={!showActive}
              />
            )}
          </div>

          {showActive && (
            <div className="drv-field-row full">
              <div className="drv-field">
                <label>Status</label>
                <select
                  value={form.is_active ? "true" : "false"}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === "true" }))}
                  style={{ background:"#0a0f1e", border:"1px solid #1a2744", borderRadius:"7px",
                           color:"#e2e8f0", padding:"0.5rem 0.7rem", fontSize:"0.82rem",
                           fontFamily:"inherit", outline:"none" }}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>
          )}

          <p className="drv-section-label">Profile</p>
          <div className="drv-field-row full">
            <Field label="Phone" value={form.phone} onChange={set("phone")} />
          </div>

          <p className="drv-section-label">License</p>
          <div className="drv-field-row">
            <Field label="License Number"  value={form.license_number}  onChange={set("license_number")} />
            <Field label="License Expiry"  value={form.license_expiry}  onChange={set("license_expiry")} type="date" />
          </div>
          <div className="drv-field-row">
            <Field label="Experience (yrs)" value={form.experience_years} onChange={set("experience_years")} type="number" />
          </div>

          <div className="drv-form-footer">
            <button type="button" className="drv-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="drv-btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save Driver"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, placeholder }) {
  return (
    <div className="drv-field">
      <label>{label}</label>
      <input type={type} value={value} onChange={onChange} required={required} placeholder={placeholder} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DeleteModal
   ══════════════════════════════════════════════════════════════════════════ */
function DeleteModal({ driver, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr ] = useState("");

  async function go() {
    setBusy(true); setErr("");
    try { await onConfirm(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="drv-overlay" onClick={onClose}>
      <div className="drv-modal drv-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="drv-modal-head">
          <h3>Delete Driver</h3>
          <button className="drv-icon-btn" onClick={onClose}><IcoX /></button>
        </div>
        {err && <div className="drv-err-bar">{err}</div>}
        <p className="drv-del-msg">
          Permanently delete <strong>{driver.username}</strong>?<br />
          All associated sessions and profile data will also be removed.
          This cannot be undone.
        </p>
        <div className="drv-form-footer">
          <button className="drv-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="drv-btn-danger" onClick={go}     disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ViewDrawer
   ══════════════════════════════════════════════════════════════════════════ */
function ViewDrawer({ driver, onClose, onEdit }) {
  const p = driver.profile || {};

  function Row({ label, value }) {
    return (
      <div className="drv-drawer-cell">
        <span>{label}</span>
        <strong>{value || "—"}</strong>
      </div>
    );
  }

  return (
    <div className="drv-drawer-overlay" onClick={onClose}>
      <div className="drv-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drv-drawer-head">
          <h3>Driver Details</h3>
          <button className="drv-icon-btn" onClick={onClose}><IcoX /></button>
        </div>

        <div className="drv-drawer-hero">
          <div className="drv-drawer-av">{initials(driver.username)}</div>
          <div>
            <p className="drv-drawer-name">{driver.username}</p>
            <p className="drv-drawer-email">{driver.email}</p>
            <span className={`drv-badge ${driver.is_active ? "on" : "off"}`}>
              {driver.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        <div className="drv-drawer-section">
          <p className="drv-drawer-section-title">Account</p>
          <div className="drv-drawer-grid">
            <Row label="Company"   value={driver.company} />
            <Row label="Role"      value={driver.role} />
            <Row label="Joined"    value={driver.created_at ? new Date(driver.created_at).toLocaleDateString() : ""} />
          </div>
        </div>

        <div className="drv-drawer-section">
          <p className="drv-drawer-section-title">Contact</p>
          <div className="drv-drawer-grid">
            <Row label="Phone" value={p.phone} />
          </div>
        </div>

        <div className="drv-drawer-section">
          <p className="drv-drawer-section-title">License</p>
          <div className="drv-drawer-grid">
            <Row label="Licence No."   value={p.license_number} />
            <Row label="Expiry"        value={p.license_expiry} />
            <Row label="Experience"    value={p.experience_years != null ? `${p.experience_years} yrs` : ""} />
          </div>
        </div>

        {p.emergency_contact?.name && (
          <div className="drv-drawer-section">
            <p className="drv-drawer-section-title">Emergency Contact</p>
            <div className="drv-drawer-grid">
              <Row label="Name"     value={p.emergency_contact.name} />
              <Row label="Phone"    value={p.emergency_contact.phone} />
              <Row label="Relation" value={p.emergency_contact.relation} />
            </div>
          </div>
        )}

        <div className="drv-drawer-footer">
          <button className="drv-btn-primary" style={{ width: "100%" }} onClick={onEdit}>
            <IcoPen /> Edit Driver
          </button>
        </div>
      </div>
    </div>
  );
}
