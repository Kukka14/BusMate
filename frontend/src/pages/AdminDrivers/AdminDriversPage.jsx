import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../../components/AdminSidebar/AdminSidebar";
import "./AdminDrivers.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* ── Icons ───────────────────────────────────────────────────────────────── */
const IcoPlus   = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IcoSearch = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IcoEye    = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoPen    = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IcoTrash  = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IcoX      = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcoList   = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
const IcoTrophy = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>;
const IcoRefresh= () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>;

/* ── Tier constants ───────────────────────────────────────────────────────── */
const TIER_COLORS = {
  "Excellent":         "#22c55e",
  "Good":              "#38bdf8",
  "Average":           "#f59e0b",
  "Needs Improvement": "#f97316",
  "Poor":              "#ef4444",
};
const TIERS = ["All", "Excellent", "Good", "Average", "Needs Improvement", "Poor"];
const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const initials = (name = "") =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

const fmt = (v) => v || <span className="drv-na">—</span>;

const EMPTY_FORM = {
  username: "", email: "", password: "", company: "",
  phone: "", license_number: "", license_expiry: "", experience_years: "",
};

/* ── Small reusable bits ──────────────────────────────────────────────────── */
function RankChip({ rank }) {
  if (!rank) return <span className="drv-rank-chip unranked">—</span>;
  if (rank === 1) return <span className="drv-rank-chip gold">🥇 #1</span>;
  if (rank === 2) return <span className="drv-rank-chip silver">🥈 #2</span>;
  if (rank === 3) return <span className="drv-rank-chip bronze">🥉 #3</span>;
  return <span className="drv-rank-chip num">#{rank}</span>;
}

function TierBadge({ tier, color, sm }) {
  if (!tier || tier === "Unranked") return <span className="drv-na">—</span>;
  return (
    <span
      className={`drv-tier-badge${sm ? " drv-tier-badge-sm" : ""}`}
      style={{ color, borderColor: color + "55", background: color + "18" }}
    >
      {tier}
    </span>
  );
}

function ScoreCell({ rankData }) {
  if (!rankData) return <span className="drv-na">—</span>;
  const { avg_score, tier, tier_color } = rankData;
  return (
    <div className="drv-score-cell">
      <span className="drv-score-num" style={{ color: tier_color }}>{avg_score}</span>
      <span className="drv-score-denom">/100</span>
      <TierBadge tier={tier} color={tier_color} sm />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function AdminDriversPage() {
  const navigate = useNavigate();

  const tokenRef = useRef(null);
  const userRef  = useRef(null);

  /* existing state */
  const [drivers,    setDrivers   ] = useState([]);
  const [loading,    setLoading   ] = useState(true);
  const [error,      setError     ] = useState("");
  const [query,      setQuery     ] = useState("");

  /* modals */
  const [addOpen,    setAddOpen   ] = useState(false);
  const [editDriver, setEditDriver] = useState(null);
  const [delDriver,  setDelDriver ] = useState(null);

  /* view & rankings */
  const [tab,         setTab        ] = useState("table");
  const [rankings,    setRankings   ] = useState(null);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError,   setRankError  ] = useState("");
  const [tierFilter,  setTierFilter ] = useState("All");

  /* ── bootstrap ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const tok = localStorage.getItem("token");
    const usr = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();
    if (!tok || usr.role !== "admin") { navigate("/login", { replace: true }); return; }
    tokenRef.current = tok;
    userRef.current  = usr;
    fetchDrivers(tok);
    fetchRankings(tok);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── fetch drivers ─────────────────────────────────────────────────────── */
  async function fetchDrivers(tok) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/api/admin/drivers/detailed`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.status === 401) { navigate("/login", { replace: true }); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load drivers");
      setDrivers(data);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  }

  /* ── fetch rankings ────────────────────────────────────────────────────── */
  async function fetchRankings(tok) {
    setRankLoading(true); setRankError("");
    try {
      const res = await fetch(`${API}/api/admin/drivers/rankings`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.status === 401) { navigate("/login", { replace: true }); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load rankings");
      setRankings(data);
    } catch (e) { setRankError(e.message); }
    finally     { setRankLoading(false); }
  }

  /* ── add driver ────────────────────────────────────────────────────────── */
  async function handleAdd(form) {
    const tok = tokenRef.current;
    const res = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ username: form.username, email: form.email, password: form.password, company: form.company, role: "driver" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");
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
    fetchRankings(tok);
  }

  /* ── edit driver ───────────────────────────────────────────────────────── */
  async function handleEdit(id, form) {
    const tok = tokenRef.current;
    const accountBody = {};
    ["username","email","company","is_active"].forEach((k) => { if (form[k] !== undefined) accountBody[k] = form[k]; });
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
    ["phone","license_number","license_expiry","experience_years"].forEach((k) => { if (form[k] !== undefined) profileBody[k] = form[k]; });
    if (Object.keys(profileBody).length) {
      await fetch(`${API}/api/admin/drivers/${id}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify(profileBody),
      });
    }
    await fetchDrivers(tok);
    fetchRankings(tok);
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
    fetchRankings(tok);
  }

  /* ── derived data ──────────────────────────────────────────────────────── */
  const filtered = drivers.filter((d) => {
    const q = query.toLowerCase();
    return (
      (d.username || "").toLowerCase().includes(q) ||
      (d.email    || "").toLowerCase().includes(q) ||
      (d.company  || "").toLowerCase().includes(q)
    );
  });

  /* map driver_id → ranking entry for quick lookup in table rows */
  const rankMap = useMemo(() => {
    if (!rankings?.ranked) return {};
    return Object.fromEntries(rankings.ranked.map((r) => [r.driver_id, r]));
  }, [rankings]);

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
          {/* view tab toggle */}
          <div className="drv-view-tabs">
            <button
              className={`drv-view-tab ${tab === "table" ? "active" : ""}`}
              onClick={() => setTab("table")}
            >
              <IcoList /> Drivers
            </button>
            <button
              className={`drv-view-tab ${tab === "leaderboard" ? "active" : ""}`}
              onClick={() => setTab("leaderboard")}
            >
              <IcoTrophy /> Leaderboard
            </button>
          </div>

          {tab === "table" && (
            <>
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
            </>
          )}

          {tab === "leaderboard" && (
            <>
              <span className="drv-count" style={{ marginLeft: "0.25rem" }}>
                {rankings?.total_ranked ?? "—"} ranked · {rankings?.unranked?.length ?? "—"} unranked
              </span>
              <button
                className="drv-btn-ghost"
                style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.35rem" }}
                onClick={() => fetchRankings(tokenRef.current)}
                disabled={rankLoading}
              >
                <IcoRefresh /> {rankLoading ? "Refreshing…" : "Refresh"}
              </button>
            </>
          )}
        </div>

        {/* body */}
        <div className="drv-body">

          {/* ── TABLE VIEW ── */}
          {tab === "table" && (
            <>
              {loading && (
                <div className="drv-placeholder">
                  <div className="drv-spinner" />
                  <span>Loading drivers…</span>
                </div>
              )}
              {!loading && error && (
                <div className="drv-placeholder" style={{ color: "#f87171" }}>
                  {error}
                  <button className="drv-btn-ghost" onClick={() => fetchDrivers(tokenRef.current)}>Retry</button>
                </div>
              )}
              {!loading && !error && (
                <table className="drv-table">
                  <thead>
                    <tr>
                      <th style={{ width: "72px" }}>Rank</th>
                      <th>Driver</th>
                      <th>Company</th>
                      <th>Score / Tier</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "#2d3f5a" }}>
                          No drivers found
                        </td>
                      </tr>
                    )}
                    {filtered.map((d) => {
                      const rd = rankMap[d._id];
                      return (
                        <tr key={d._id}>
                          <td><RankChip rank={rd?.rank} /></td>
                          <td>
                            <div className="drv-who">
                              <div
                                className="drv-who-av"
                                style={rd ? {
                                  background: rd.tier_color + "22",
                                  color: rd.tier_color,
                                } : {}}
                              >
                                {initials(d.username)}
                              </div>
                              <div>
                                <span className="drv-who-name">{d.username}</span>
                                <span className="drv-who-email">{d.email}</span>
                              </div>
                            </div>
                          </td>
                          <td>{fmt(d.company)}</td>
                          <td><ScoreCell rankData={rd} /></td>
                          <td>
                            <span className={`drv-badge ${d.is_active ? "on" : "off"}`}>
                              {d.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            <div className="drv-actions">
                              <button className="drv-act view" title="View"
                                onClick={() => navigate(`/admin/drivers/${d._id}`, { state: { driver: d } })}>
                                <IcoEye />
                              </button>
                              <button className="drv-act edit" title="Edit" onClick={() => setEditDriver(d)}>
                                <IcoPen />
                              </button>
                              <button className="drv-act del"  title="Delete" onClick={() => setDelDriver(d)}>
                                <IcoTrash />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* ── LEADERBOARD VIEW ── */}
          {tab === "leaderboard" && (
            <LeaderboardView
              rankings={rankings}
              loading={rankLoading}
              error={rankError}
              tierFilter={tierFilter}
              setTierFilter={setTierFilter}
              onRetry={() => fetchRankings(tokenRef.current)}
              onView={(driverId) => navigate(`/admin/drivers/${driverId}`)}
            />
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
            license_number:  editDriver.profile?.license_number  || "",
            license_expiry:  editDriver.profile?.license_expiry  || "",
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
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   LeaderboardView
   ══════════════════════════════════════════════════════════════════════════ */
function LeaderboardView({ rankings, loading, error, tierFilter, setTierFilter, onRetry, onView }) {
  if (loading) {
    return (
      <div className="drv-placeholder">
        <div className="drv-spinner" />
        <span>Loading rankings…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="drv-placeholder" style={{ color: "#f87171" }}>
        {error}
        <button className="drv-btn-ghost" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (!rankings) return null;

  const { ranked, unranked, min_shifts_required } = rankings;

  /* apply tier filter */
  const filtered = tierFilter === "All" ? ranked : ranked.filter((r) => r.tier === tierFilter);

  /* podium: show at most top 3 of filtered list in 2-1-3 order */
  const top3   = filtered.slice(0, 3);
  const rest   = filtered.slice(3);
  const podium = [top3[1], top3[0], top3[2]]; /* #2 left, #1 centre, #3 right */

  return (
    <div className="drv-leaderboard">

      {/* tier filter chips */}
      <div className="drv-tier-filters">
        {TIERS.map((t) => {
          const isActive = tierFilter === t;
          const col = TIER_COLORS[t];
          return (
            <button
              key={t}
              className={`drv-tier-chip ${isActive ? "active" : ""}`}
              style={isActive && col ? { color: col, borderColor: col + "66", background: col + "18" } : {}}
              onClick={() => setTierFilter(t)}
            >
              {t !== "All" && <span className="drv-tier-dot" style={{ background: col }} />}
              {t}
            </button>
          );
        })}
      </div>

      {/* empty state */}
      {filtered.length === 0 && (
        <div className="drv-placeholder" style={{ marginTop: "2rem" }}>
          No drivers in this tier yet
        </div>
      )}

      {/* podium — top 3 */}
      {filtered.length > 0 && (
        <div className="drv-podium-section">
          <div className="drv-podium">
            {podium.map((d, i) => (
              <PodiumCard key={i} data={d} featured={i === 1} onView={onView} />
            ))}
          </div>
        </div>
      )}

      {/* ranked list — #4 onwards */}
      {rest.length > 0 && (
        <div className="drv-lb-list">
          <div className="drv-lb-list-header">
            <span>Rank</span><span>Driver</span><span>Avg Score</span>
            <span>Tier</span><span>Shifts</span><span></span>
          </div>
          {rest.map((r) => (
            <LeaderboardRow key={r.driver_id} data={r} onView={onView} />
          ))}
        </div>
      )}

      {/* unranked — need more shifts */}
      {unranked.length > 0 && (
        <div className="drv-unranked-section">
          <div className="drv-unranked-title">
            ⏳ Unranked — need {min_shifts_required}+ completed shifts to qualify
          </div>
          <div className="drv-lb-list">
            {unranked.map((r) => (
              <UnrankedRow key={r.driver_id} data={r} minShifts={min_shifts_required} onView={onView} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Podium card ─────────────────────────────────────────────────────────── */
function PodiumCard({ data, featured, onView }) {
  if (!data) return <div className="drv-podium-placeholder" />;
  const { tier_color: col } = data;
  return (
    <div
      className={`drv-podium-card ${featured ? "featured" : ""}`}
      style={{ borderColor: col + "66", boxShadow: featured ? `0 0 28px ${col}28` : "none" }}
    >
      <span className="drv-podium-medal">{MEDALS[data.rank]}</span>
      <div className="drv-podium-av" style={{ background: col + "22", color: col }}>
        {initials(data.username)}
      </div>
      <div className="drv-podium-name">{data.username}</div>
      {data.company && <div className="drv-podium-company">{data.company}</div>}
      <div className="drv-podium-score" style={{ color: col }}>
        {data.avg_score}<span className="drv-podium-score-sub">/100</span>
      </div>
      <TierBadge tier={data.tier} color={col} sm />
      <div className="drv-podium-shifts">{data.total_shifts} shifts</div>
      <button className="drv-act view drv-podium-btn" onClick={() => onView(data.driver_id)}>
        <IcoEye />
      </button>
    </div>
  );
}

/* ── Ranked list row ─────────────────────────────────────────────────────── */
function LeaderboardRow({ data, onView }) {
  const col = data.tier_color;
  return (
    <div className="drv-lb-row">
      <span className="drv-lb-rank" style={{ color: col }}>#{data.rank}</span>
      <div className="drv-lb-who">
        <div className="drv-who-av" style={{ background: col + "18", color: col }}>
          {initials(data.username)}
        </div>
        <div>
          <span className="drv-who-name">{data.username}</span>
          <span className="drv-who-email">{data.company || "—"}</span>
        </div>
      </div>
      <div className="drv-lb-score" style={{ color: col }}>
        {data.avg_score}<span className="drv-lb-score-sub">/100</span>
      </div>
      <TierBadge tier={data.tier} color={col} sm />
      <span className="drv-lb-shifts">{data.total_shifts} shifts</span>
      <button className="drv-act view" title="View profile" onClick={() => onView(data.driver_id)}>
        <IcoEye />
      </button>
    </div>
  );
}

/* ── Unranked row ────────────────────────────────────────────────────────── */
function UnrankedRow({ data, minShifts, onView }) {
  const pct = Math.min(100, Math.round((data.total_shifts / minShifts) * 100));
  return (
    <div className="drv-lb-row drv-lb-row-unranked">
      <span className="drv-lb-rank drv-lb-rank-unranked">—</span>
      <div className="drv-lb-who">
        <div className="drv-who-av">{initials(data.username)}</div>
        <div>
          <span className="drv-who-name">{data.username}</span>
          <span className="drv-who-email">{data.company || "—"}</span>
        </div>
      </div>
      <div className="drv-lb-score" style={{ color: "#475569" }}>—</div>
      <span className="drv-lb-unranked-prog">
        <span className="drv-lb-unranked-track">
          <span className="drv-lb-unranked-fill" style={{ width: `${pct}%` }} />
        </span>
        <span style={{ fontSize: "0.7rem", color: "#475569" }}>{data.total_shifts}/{minShifts}</span>
      </span>
      <span className="drv-lb-shifts" style={{ color: "#334155" }}>shifts</span>
      <button className="drv-act view" title="View profile" onClick={() => onView(data.driver_id)}>
        <IcoEye />
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DriverFormModal
   ══════════════════════════════════════════════════════════════════════════ */
function DriverFormModal({ title, initial, showPassword, showActive, onClose, onSubmit }) {
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
            <Field label="Company"  value={form.company}  onChange={set("company")} />
            {showPassword && (
              <Field
                label={initial.password === "" && !showActive ? "Password *" : "New Password"}
                value={form.password} onChange={set("password")}
                type="password" required={!showActive}
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
                           color:"#e2e8f0", padding:"0.5rem 0.7rem", fontSize:"0.82rem", fontFamily:"inherit", outline:"none" }}>
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
            <Field label="License Number"   value={form.license_number}   onChange={set("license_number")} />
            <Field label="License Expiry"   value={form.license_expiry}   onChange={set("license_expiry")}  type="date" />
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
