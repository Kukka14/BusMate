import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar/AdminSidebar";
import "./AdminSchedule.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* ── Icons ───────────────────────────────────────────────────────────────── */
const IcoPlus   = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IcoSearch = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IcoPen    = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IcoTrash  = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IcoX      = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcoRoute  = () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v1a5 5 0 005 5h2a5 5 0 005-5V9"/></svg>;
const IcoUser   = () => <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IcoBusTag = () => <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 4v4h-7V8Z"/></svg>;

/* ── helpers ─────────────────────────────────────────────────────────────── */
const initials = (name = "") =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

const STATUSES = ["Upcoming", "Today", "Completed"];

const EMPTY_FORM = {
  driver_id:  "",
  date_iso:   "",
  shift_time: "",
  start_town: "",
  end_town:   "",
  bus:        "",
  route_name: "",
  status:     "Upcoming",
};

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch { return iso; }
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function AdminSchedulePage() {
  const navigate = useNavigate();
  const tokenRef = useRef(null);
  const userRef  = useRef(null);

  const [schedules, setSchedules] = useState([]);
  const [drivers,   setDrivers  ] = useState([]);   // [{id, username}]
  const [loading,   setLoading  ] = useState(true);
  const [error,     setError    ] = useState("");
  const [query,     setQuery    ] = useState("");
  const [filter,    setFilter   ] = useState("All"); // All | Upcoming | Today | Completed

  const [addOpen,   setAddOpen  ] = useState(false);
  const [editItem,  setEditItem ] = useState(null);
  const [delItem,   setDelItem  ] = useState(null);

  /* ── bootstrap ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const tok = localStorage.getItem("token");
    const usr = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();
    if (!tok || usr.role !== "admin") { navigate("/login", { replace: true }); return; }
    tokenRef.current = tok;
    userRef.current  = usr;
    fetchAll(tok);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── data fetching ─────────────────────────────────────────────────────── */
  async function fetchAll(tok) {
    setLoading(true); setError("");
    try {
      const [sRes, dRes] = await Promise.all([
        fetch(`${API}/api/admin/schedules`,        { headers: { Authorization: `Bearer ${tok}` } }),
        fetch(`${API}/api/admin/drivers`,           { headers: { Authorization: `Bearer ${tok}` } }),
      ]);
      if (sRes.status === 401 || dRes.status === 401) { navigate("/login", { replace: true }); return; }
      const sData = await sRes.json();
      const dData = await dRes.json();
      if (!sRes.ok) throw new Error(sData.error || "Failed to load schedules");
      setSchedules(Array.isArray(sData) ? sData : []);
      setDrivers(Array.isArray(dData) ? dData.map((d) => ({ id: d.id || d._id, username: d.username })) : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  /* ── CRUD ──────────────────────────────────────────────────────────────── */
  async function handleAdd(form) {
    const tok = tokenRef.current;
    const res = await fetch(`${API}/api/admin/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create schedule");
    await fetchAll(tok);
  }

  async function handleEdit(id, form) {
    const tok = tokenRef.current;
    const res = await fetch(`${API}/api/admin/schedules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update schedule");
    await fetchAll(tok);
  }

  async function handleDelete(id) {
    const tok = tokenRef.current;
    const res = await fetch(`${API}/api/admin/schedules/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Delete failed"); }
    setDelItem(null);
    setSchedules((prev) => prev.filter((s) => s._id !== id));
  }

  /* ── filtered list ─────────────────────────────────────────────────────── */
  const filtered = schedules.filter((s) => {
    const q = query.toLowerCase();
    const matchQuery =
      (s.driver_name  || "").toLowerCase().includes(q) ||
      (s.start_town   || "").toLowerCase().includes(q) ||
      (s.end_town     || "").toLowerCase().includes(q) ||
      (s.route_name   || "").toLowerCase().includes(q) ||
      (s.bus          || "").toLowerCase().includes(q);
    const matchFilter = filter === "All" || s.status === filter;
    return matchQuery && matchFilter;
  });

  /* ── render ─────────────────────────────────────────────────────────────── */
  const user = userRef.current || {};
  return (
    <div className="as-root">

      {/* ── SIDEBAR ── */}
      <AdminSidebar activeKey="schedules" />

      {/* ── MAIN ── */}
      <div className="as-main">

        {/* topbar */}
        <div className="as-topbar">
          <div className="as-topbar-left">
            <h1>Shift Schedules</h1>
            <p>Assign and manage driver schedules across the fleet</p>
          </div>
          <div className="as-topbar-avatar">{initials(user.username || "A")}</div>
        </div>

        {/* toolbar */}
        <div className="as-toolbar">
          <label className="as-search-box">
            <IcoSearch />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search driver, route, bus…"
            />
          </label>

          <div className="as-filter-group">
            {["All", "Upcoming", "Today", "Completed"].map((f) => (
              <button key={f}
                className={`as-filter-btn ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>

          <span className="as-count">{filtered.length} shift{filtered.length !== 1 ? "s" : ""}</span>

          <button className="as-btn-primary" onClick={() => setAddOpen(true)}>
            <IcoPlus /> Add Schedule
          </button>
        </div>

        {/* body */}
        <div className="as-body">
          {loading && (
            <div className="as-placeholder">
              <div className="as-spinner" />
              <span>Loading schedules…</span>
            </div>
          )}

          {!loading && error && (
            <div className="as-placeholder" style={{ color: "#f87171" }}>
              {error}
              <button className="as-btn-ghost" onClick={() => fetchAll(tokenRef.current)}>Retry</button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="as-placeholder">No schedules found.</div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="as-list">
              {filtered.map((s) => {
                const statusClass =
                  s.status === "Today"     ? "today" :
                  s.status === "Completed" ? "completed" : "upcoming";
                return (
                  <div key={s._id} className={`as-card ${s.status === "Today" ? "today" : ""}`}>

                    {/* left: date + shift + driver */}
                    <div>
                      <div className="as-card-date">{fmtDate(s.date_iso)}</div>
                      <div className="as-card-shift">{s.shift_time || "—"}</div>
                      <div className="as-card-driver">
                        <IcoUser /> {s.driver_name || "Unassigned"}
                      </div>
                    </div>

                    {/* center: route */}
                    <div>
                      <div className="as-route-visual">
                        <span className="as-town-dot start" />
                        <span className="as-town-name">{s.start_town || "—"}</span>
                        <div className="as-route-arrow">
                          <hr />
                          <IcoRoute />
                          <span>{s.route_name || ""}</span>
                          <hr />
                        </div>
                        <span className="as-town-name">{s.end_town || "—"}</span>
                        <span className="as-town-dot end" />
                      </div>
                      {s.bus && (
                        <div className="as-bus-tag">
                          <IcoBusTag /> {s.bus}
                        </div>
                      )}
                    </div>

                    {/* status badge */}
                    <span className={`as-badge ${statusClass}`}>{s.status}</span>

                    {/* actions */}
                    <div className="as-card-actions">
                      <button className="as-act edit" title="Edit"
                        onClick={() => setEditItem(s)}><IcoPen /></button>
                      <button className="as-act del"  title="Delete"
                        onClick={() => setDelItem(s)}><IcoTrash /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── ADD MODAL ── */}
      {addOpen && (
        <ScheduleFormModal
          title="Add Schedule"
          initial={EMPTY_FORM}
          drivers={drivers}
          onClose={() => setAddOpen(false)}
          onSubmit={async (form) => { await handleAdd(form); setAddOpen(false); }}
        />
      )}

      {/* ── EDIT MODAL ── */}
      {editItem && (
        <ScheduleFormModal
          title="Edit Schedule"
          initial={{
            driver_id:  editItem.driver_id  || "",
            date_iso:   editItem.date_iso   ? editItem.date_iso.slice(0, 10) : "",
            shift_time: editItem.shift_time || "",
            start_town: editItem.start_town || "",
            end_town:   editItem.end_town   || "",
            bus:        editItem.bus        || "",
            route_name: editItem.route_name || "",
            status:     editItem.status     || "Upcoming",
          }}
          drivers={drivers}
          onClose={() => setEditItem(null)}
          onSubmit={async (form) => { await handleEdit(editItem._id, form); setEditItem(null); }}
        />
      )}

      {/* ── DELETE CONFIRM ── */}
      {delItem && (
        <DeleteModal
          item={delItem}
          onClose={() => setDelItem(null)}
          onConfirm={() => handleDelete(delItem._id)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ScheduleFormModal
   ══════════════════════════════════════════════════════════════════════════ */
function ScheduleFormModal({ title, initial, drivers, onClose, onSubmit }) {
  const [form, setForm] = useState({ ...initial });
  const [busy, setBusy] = useState(false);
  const [err,  setErr ] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await onSubmit(form); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="as-overlay" onClick={onClose}>
      <div className="as-modal" onClick={(e) => e.stopPropagation()}>
        <div className="as-modal-head">
          <h3>{title}</h3>
          <button className="as-icon-btn" onClick={onClose}><IcoX /></button>
        </div>

        {err && <div className="as-err-bar">{err}</div>}

        <form className="as-form" onSubmit={submit}>

          <p className="as-section-label">Assignment</p>
          <div className="as-field-row">
            <div className="as-field">
              <label>Driver *</label>
              <select value={form.driver_id} onChange={set("driver_id")} required>
                <option value="">— Select driver —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.username}</option>
                ))}
              </select>
            </div>
            <div className="as-field">
              <label>Status</label>
              <select value={form.status} onChange={set("status")}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <p className="as-section-label">Date & Shift</p>
          <div className="as-field-row">
            <div className="as-field">
              <label>Date *</label>
              <input type="date" value={form.date_iso} onChange={set("date_iso")} required />
            </div>
            <div className="as-field">
              <label>Shift Time *</label>
              <input type="text" value={form.shift_time} onChange={set("shift_time")}
                placeholder="e.g. 06:00 – 14:00" required />
            </div>
          </div>

          <p className="as-section-label">Route</p>
          <div className="as-field-row">
            <div className="as-field">
              <label>Start Town</label>
              <TownPicker
                value={form.start_town}
                onChange={(v) => setForm((f) => ({ ...f, start_town: v }))}
                placeholder="e.g. Colombo"
              />
            </div>
            <div className="as-field">
              <label>End Town</label>
              <TownPicker
                value={form.end_town}
                onChange={(v) => setForm((f) => ({ ...f, end_town: v }))}
                placeholder="e.g. Kandy"
              />
            </div>
          </div>
          <div className="as-field-row">
            <div className="as-field">
              <label>Route Name</label>
              <input type="text" value={form.route_name} onChange={set("route_name")} placeholder="e.g. 101 Express" />
            </div>
            <div className="as-field">
              <label>Bus</label>
              <input type="text" value={form.bus} onChange={set("bus")} placeholder="e.g. BUS-204" />
            </div>
          </div>

          <div className="as-form-footer">
            <button type="button" className="as-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="as-btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TownPicker — static Sri Lanka towns dropdown, filters as you type
   ══════════════════════════════════════════════════════════════════════════ */
const SL_TOWNS = [
  "Akkaraipattu","Aluthgama","Ambalangoda","Ambalantota","Ampara",
  "Anuradhapura","Avissawella","Badulla","Balangoda","Bandarawela",
  "Batticaloa","Beruwala","Chilaw","Colombo","Dambulla",
  "Dehiwala","Deniyaya","Dikwella","Diyatalawa","Ella",
  "Embilipitiya","Elpitiya","Galle","Gampaha","Gampola",
  "Hambantota","Haputale","Hatton","Hikkaduwa","Horana",
  "Jaffna","Kadawatha","Kaduwela","Kalmunai","Kalutara",
  "Kandy","Kataragama","Kegalle","Kesbewa","Kilinochchi",
  "Kolonnawa","Kotte","Kurunegala","Mannar","Matale",
  "Matara","Mawanella","Minuwangoda","Moratuwa","Mullaitivu",
  "Nawalapitiya","Negombo","Nilaveli","Nuwara Eliya","Panadura",
  "Polonnaruwa","Puttalam","Ratnapura","Sigiriya","Tangalle",
  "Tissamaharama","Trincomalee","Vavuniya","Weligama","Welimada",
  "Wennappuwa","Yala",
];

function TownPicker({ value, onChange, placeholder }) {
  const [query,     setQuery    ] = useState(value || "");
  const [open,      setOpen     ] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef(null);

  /* keep input in sync if parent resets the value */
  useEffect(() => { setQuery(value || ""); }, [value]);

  /* close when clicking outside */
  useEffect(() => {
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  /* filter towns based on current query */
  const filtered = query.trim()
    ? SL_TOWNS.filter((t) => t.toLowerCase().includes(query.trim().toLowerCase()))
    : SL_TOWNS;

  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    onChange(q);
    setActiveIdx(-1);
    setOpen(true);
  }

  function pick(name) {
    setQuery(name);
    onChange(name);
    setOpen(false);
    setActiveIdx(-1);
  }

  function handleKey(e) {
    if (!open) { if (e.key === "ArrowDown") setOpen(true); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pick(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="as-town-picker" ref={wrapRef}>
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onKeyDown={handleKey}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="as-town-list">
          {filtered.map((name, i) => (
            <li
              key={name}
              className={i === activeIdx ? "active" : ""}
              onMouseDown={() => pick(name)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DeleteModal
   ══════════════════════════════════════════════════════════════════════════ */
function DeleteModal({ item, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr ] = useState("");

  async function go() {
    setBusy(true); setErr("");
    try { await onConfirm(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="as-overlay" onClick={onClose}>
      <div className="as-modal as-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="as-modal-head">
          <h3>Delete Schedule</h3>
          <button className="as-icon-btn" onClick={onClose}><IcoX /></button>
        </div>
        {err && <div className="as-err-bar">{err}</div>}
        <p className="as-del-msg">
          Delete the schedule for <strong>{item.driver_name || "this driver"}</strong> on{" "}
          <strong>{fmtDate(item.date_iso)}</strong>?<br />
          This cannot be undone.
        </p>
        <div className="as-form-footer">
          <button className="as-btn-ghost"  onClick={onClose} disabled={busy}>Cancel</button>
          <button className="as-btn-danger" onClick={go}      disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
