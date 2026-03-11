from datetime import datetime, timedelta
import random, math
from flask import Blueprint, jsonify, request
from ..utils.auth_helpers import token_required

driver_bp = Blueprint("driver", __name__)


# ── DSS (Driver Safety Score) ────────────────────────────────────────────────

def _compute_dss(avg_bvi, frames):
    """
    Compute Driver Safety Score (0–100) from session data.
    50 pts emotional  — from avg BVI
    50 pts distraction — from fraction of frames with YOLO violations
    Returns (dss_score: int, tier: str)
    """
    # Emotional component
    if avg_bvi is None:
        emotional_pts = 25
    elif avg_bvi < 0.40:
        emotional_pts = 50
    elif avg_bvi < 0.55:
        emotional_pts = 28
    else:
        # erratic: scale 15→0 as bvi 0.55→1.0
        emotional_pts = max(0, round(15 * (1.0 - avg_bvi) / 0.45))

    # Distraction component
    total = len(frames)
    if total == 0:
        distraction_pts = 50
    else:
        viol_frames = sum(1 for f in frames if f.get("objects_detected"))
        viol_pct = (viol_frames / total) * 100
        if viol_pct == 0:
            distraction_pts = 50
        elif viol_pct < 5:
            distraction_pts = 35
        elif viol_pct < 15:
            distraction_pts = 20
        else:
            distraction_pts = 0

    dss = emotional_pts + distraction_pts

    if dss >= 90:
        tier = "Elite"
    elif dss >= 75:
        tier = "Safe"
    elif dss >= 60:
        tier = "Needs Attention"
    elif dss >= 40:
        tier = "At Risk"
    else:
        tier = "High Risk"

    return dss, tier

# ── Deterministic seeded history generator ───────────────────────────────────
def _bvi_history(days=30, seed=42):
    """
    Generates `days` data-points of realistic BVI model evaluation output.
    Each point represents one shift (one day). Values are seeded so the same
    driver always sees the same historical curve.
    """
    rng = random.Random(seed)
    records = []
    base = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # Simulate a driver who starts moderately volatile, improves mid-period,
    # then has a spike near the end — a realistic evaluation arc.
    for i in range(days):
        day = base - timedelta(days=days - 1 - i)
        # BVI arc: starts ~0.45, dips to ~0.20 around day 18, spikes at day 25
        arc = 0.45 - 0.25 * math.sin(math.pi * i / (days * 0.7))
        if i in range(days - 7, days - 4):
            arc += 0.25   # spike
        bvi_score = max(0.0, min(1.0, arc + rng.uniform(-0.06, 0.06)))

        # Map BVI → state
        if   bvi_score < 0.30: state = "stable"
        elif bvi_score < 0.60: state = "unstable"
        else:                  state = "erratic"

        # Emotion probabilities that roughly track the BVI score
        angry   = max(0, min(1, bvi_score * 0.4 + rng.uniform(-0.04, 0.04)))
        fearful = max(0, min(1, bvi_score * 0.2 + rng.uniform(-0.03, 0.03)))
        sad     = max(0, min(1, bvi_score * 0.15 + rng.uniform(-0.03, 0.03)))
        happy   = max(0, min(1, (1 - bvi_score) * 0.35 + rng.uniform(-0.04, 0.04)))
        neutral = max(0, 1.0 - angry - fearful - sad - happy)

        t_rate  = max(0, min(1, bvi_score * 0.9 + rng.uniform(-0.05, 0.05)))
        entropy = max(0, min(2.5, bvi_score * 2.0 + rng.uniform(-0.1, 0.1)))

        records.append({
            "date":              day.strftime("%b %d"),
            "bvi_score":         round(bvi_score, 3),
            "state":             state,
            "transition_rate":   round(t_rate,  3),
            "entropy":           round(entropy, 3),
            "angry":             round(angry,   3),
            "fearful":           round(fearful, 3),
            "sad":               round(sad,     3),
            "happy":             round(happy,   3),
            "neutral":           round(neutral, 3),
        })
    return records


def _mock_dashboard(user):
    """
    Returns a driver dashboard payload.
    Keys match exactly what DriverDashboard.jsx reads.
    """
    uid     = str(user.id)
    history = _bvi_history(days=30, seed=sum(ord(c) for c in uid) if uid else 42)
    latest  = history[-1]

    # Derive current BVI card values from the latest history point
    bvi_score = latest["bvi_score"]
    state     = latest["state"]
    state_labels = {
        "stable":   ("Stable",   "Low Risk",  round(bvi_score * 67)),
        "unstable": ("Moderate", "Caution",   round(bvi_score * 67)),
        "erratic":  ("Erratic",  "High Risk", round(bvi_score * 67)),
    }
    bvi_label, bvi_status, bvi_pct = state_labels.get(state, state_labels["stable"])

    return {
        # top-level fields read directly by JSX
        "driver_name":    user.username,
        "driver_id":      f"DRV-{uid[-5:].upper()}",
        "driver_email":   user.email,
        "driver_company": user.company,
        "stats": {
            "total_distance_km": 12450,
            "safety_alerts":     4,
            "risk_score":        92,
        },
        "shift": {
            "vehicle":      "BUS-204",
            "route":        "101 Express",
            "shift_active": False,
        },
        "behavioral_volatility_index": {
            "status":  bvi_status,
            "label":   bvi_label,
            "pct":     bvi_pct,
            "metrics": [
                {"label": "Fatigue Level",   "pct": round((latest["sad"] + latest["fearful"]) * 100), "color": "#a78bfa"},
                {"label": "Distraction Idx", "pct": round(latest["transition_rate"] * 100),           "color": "#38bdf8"},
                {"label": "Aggression Idx",  "pct": round(latest["angry"] * 100),                     "color": "#f87171"},
            ],
            "history": history,          # ← 30-day time-series for the chart
        },
        "route_performance": {
            "schedule_adherence": 94,
            "fuel_efficiency":    8.2,
            "fuel_used":          38.4,
            "avg_delay":          3,
        },
        "safety_events": [
            {
                "type":   "warning",
                "label":  "Distraction Detected",
                "detail": "Duration: 2.4s | Speed: 45 km/h",
                "time":   "Oct 24, 14:22 PM",
            },
            {
                "type":   "danger",
                "label":  "Microsleep Warning",
                "detail": "AI fatigue detection alert",
                "time":   "Oct 23, 05:13 AM",
            },
            {
                "type":   "info",
                "label":  "Harsh Brake Mitigated",
                "detail": "Good corrective action taken",
                "time":   "Oct 22, 11:40 AM",
            },
        ],
        "schedule": [
            {"date": "Mon, Oct 28", "time": "06:00 - 14:00", "route": "101 Express",    "vehicle": "BUS-204", "status": "Upcoming"},
            {"date": "Tue, Oct 29", "time": "06:00 - 14:00", "route": "202 Downtown",   "vehicle": "BUS-117", "status": "Upcoming"},
            {"date": "Wed, Oct 30", "time": "14:00 - 22:00", "route": "303 Airport Ln", "vehicle": "BUS-088", "status": "Scheduled"},
            {"date": "Thu, Oct 31", "time": "OFF",            "route": "—",              "vehicle": "—",       "status": "Day Off"},
        ],
        "safety_tip": "Maintain 3-second following distance in wet conditions.",
    }


# ── Driver dashboard (full payload) ─────────────────────────────────────────
@driver_bp.get("/dashboard")
@token_required
def get_dashboard(current_user):
    return jsonify(_mock_dashboard(current_user)), 200


# ── Driver profile ────────────────────────────────────────────────────────────
@driver_bp.get("/profile")
@token_required
def get_profile(current_user):
    uid   = str(current_user.id)
    seed  = sum(ord(c) for c in uid) if uid else 42
    rng   = random.Random(seed)

    history30 = _bvi_history(days=30, seed=seed)
    latest    = history30[-1]
    bvi_score = latest["bvi_score"]

    # ── pull real sessions from MongoDB if available ──────────────────────
    total_sessions = 0
    recent_events  = []
    try:
        from ..database import get_db
        db = get_db()
        sessions = list(
            db.driving_sessions.find(
                {"driver_id": uid, "status": "completed"},
                {"frames": 0}
            ).sort("started_at", -1).limit(20)
        )
        total_sessions = len(sessions)
        for s in sessions[:5]:
            alerts = s.get("summary", {}).get("safety_alerts", [])
            for a in alerts[:2]:
                recent_events.append({
                    "type":   "warning",
                    "label":  "BVI Erratic Spike",
                    "detail": f"Session {str(s['_id'])[-6:]} · BVI {round(a.get('bvi', 0), 3)}",
                    "time":   a.get("time", "")[:16].replace("T", " "),
                    "image":  None,
                })
    except Exception:
        pass

    # ── fallback mock events if no real data yet ──────────────────────────
    if not recent_events:
        recent_events = [
            {
                "type":  "danger",
                "label": "Cell Phone Use Detected",
                "detail": "Duration: 4.2 seconds · Speed: 42 km/h",
                "time":  "10:22 PM",
                "image": None,
            },
            {
                "type":  "warning",
                "label": "Micro-sleep / Drowsiness Alert",
                "detail": "Critical Warning issued via audio · Driver slowed immediately",
                "time":  "12:05 PM",
                "image": None,
            },
            {
                "type":  "info",
                "label": "Pre-Trip Inspection Complete",
                "detail": f"Duration: 12m 40s · Vehicle BUS-204",
                "time":  "09:45 AM",
                "image": None,
            },
        ]

    # ── risk score from BVI ───────────────────────────────────────────────
    safety_score = max(0, round(100 - bvi_score * 80))
    if bvi_score < 0.30:
        risk_level, risk_label = "Low",    "SAFE ZONE"
    elif bvi_score < 0.60:
        risk_level, risk_label = "Medium", "CAUTION"
    else:
        risk_level, risk_label = "High",   "RISK ZONE"

    return jsonify({
        # identity
        "id":            uid,
        "driver_id":     f"BM-{uid[-5:].upper()}",
        "username":      current_user.username,
        "email":         current_user.email,
        "company":       current_user.company,
        "role":          current_user.role,
        "status":        "ONLINE",
        "vehicle":       "Volvo BSR #402",
        "route":         "Route 42 – Downtown Loop",
        "shift":         "08:00 – 16:00",

        # stat cards
        "stats": {
            "total_distance_km":  12482,
            "avg_fuel_economy":   3.2,
            "safety_events":      max(0, round(bvi_score * 8)),
            "safety_score":       safety_score,
        },

        # BVI
        "bvi": {
            "history": history30,
            "score":   round(bvi_score, 3),
            "state":   latest["state"],
            "system_insight": (
                "BVI shows rising volatility in the last 2 hours. "
                "Driver might be experiencing fatigue. "
                "Consider scheduling a mandatory 15-min break at the next hub."
            ) if bvi_score > 0.45 else (
                "BVI is stable. Driver is performing within safe parameters."
            ),
        },

        # risk exposure
        "risk": {
            "level":             risk_level,
            "label":             risk_label,
            "harsh_braking":     round(rng.uniform(0.1, 0.6), 1),
            "speeding_incidents":round(rng.uniform(0.0, 0.3), 1),
        },

        # in-cabin events (most recent first)
        "events": recent_events,

        # route performance
        "route_performance": {
            "schedule_adherence":     round(rng.uniform(91, 99), 1),
            "passenger_comfort_score":round(rng.uniform(7.5, 9.5), 1),
        },

        # upcoming schedule
        "schedule": [
            {"label": "Morning Shift (A)", "route": "Route 108 · 06:00 – 14:05", "date": "Mon"},
            {"label": "Safety Workshop",   "route": "Depot HQ · 10:00 – 12:00",  "date": "Tue"},
        ],
    }), 200


# ── Start / stop shift ────────────────────────────────────────────────────────
@driver_bp.get("/shift/start")
@token_required
def start_shift_get(current_user):
    return jsonify({"message": "use POST"}), 405


@driver_bp.post("/shift/start")
@token_required
def start_shift(current_user):
    return jsonify({"message": "Shift started", "shift_active": True,
                    "start_time": datetime.utcnow().isoformat()}), 200


@driver_bp.post("/shift/stop")
@token_required
def stop_shift(current_user):
    return jsonify({"message": "Shift ended", "shift_active": False,
                    "end_time": datetime.utcnow().isoformat()}), 200


# ── Driving Session endpoints ─────────────────────────────────────────────────

@driver_bp.post("/session/start")
@token_required
def session_start(current_user):
    """
    POST /api/driver/session/start
    Body (optional JSON): { vehicle_id, route }
    Creates a new driving_sessions document. Returns session_id.
    """
    from ..database import get_db
    from bson import ObjectId

    db   = get_db()
    body = request.get_json(silent=True) or {}

    # Close any existing active session for this driver
    db.driving_sessions.update_many(
        {"driver_id": str(current_user.id), "status": "active"},
        {"$set": {"status": "aborted", "ended_at": datetime.utcnow().isoformat()}}
    )

    doc = {
        "driver_id":  str(current_user.id),
        "driver_name": current_user.username,
        "vehicle_id": body.get("vehicle_id", "BUS-001"),
        "route":      body.get("route", "Unspecified"),
        "started_at": datetime.utcnow().isoformat(),
        "ended_at":   None,
        "status":     "active",
        "frames": [],
        "summary": {
            "total_frames":     0,
            "avg_bvi":          None,
            "peak_bvi":         None,
            "dominant_emotion": None,
            "erratic_count":    0,
            "safety_alerts":    [],
        },
    }
    result = db.driving_sessions.insert_one(doc)
    session_id = str(result.inserted_id)

    return jsonify({"session_id": session_id, "started_at": doc["started_at"]}), 201


@driver_bp.post("/session/stop")
@token_required
def session_stop(current_user):
    """
    POST /api/driver/session/stop
    Body: { session_id }
    Marks the session completed and computes summary statistics.
    """
    from ..database import get_db
    from bson import ObjectId

    db   = get_db()
    body = request.get_json(silent=True) or {}
    sid  = body.get("session_id")

    if not sid:
        return jsonify({"error": "session_id required"}), 400

    session = db.driving_sessions.find_one({
        "_id": ObjectId(sid), "driver_id": str(current_user.id)
    })
    if not session:
        return jsonify({"error": "Session not found"}), 404

    frames = session.get("frames", [])
    now    = datetime.utcnow().isoformat()

    # Accept client-computed scores for sessions without persisted frames
    # (e.g. Drowsiness Monitor which doesn't POST /session/frame)
    client_dss           = body.get("dss_score")
    client_tier          = body.get("dss_tier")
    client_drowsy_frames = body.get("drowsy_frames")
    client_drowsy_pct    = body.get("drowsy_pct")
    client_duration      = body.get("duration_sec")
    client_total_alerts  = body.get("total_alerts")

    # Compute aggregate summary
    bvi_scores = [f["bvi_score"] for f in frames if f.get("bvi_score") is not None]
    emotions   = [f["emotion"]   for f in frames if f.get("emotion")]

    avg_bvi  = round(sum(bvi_scores) / len(bvi_scores), 3) if bvi_scores else None
    peak_bvi = round(max(bvi_scores), 3)                   if bvi_scores else None
    erratic  = sum(1 for b in bvi_scores if b >= 0.60)

    dominant = None
    if emotions:
        from collections import Counter
        dominant = Counter(emotions).most_common(1)[0][0]

    # Use client-supplied DSS when no frames stored (Drowsiness Monitor sessions)
    if not frames and client_dss is not None:
        dss  = int(client_dss)
        tier = str(client_tier) if client_tier else _compute_dss(None, [])[1]
    else:
        dss, tier = _compute_dss(avg_bvi, frames)

    summary_doc = {
        "total_frames":     len(frames) if frames else (client_total_alerts is not None and int(body.get("total_frames", 0))),
        "avg_bvi":          avg_bvi,
        "peak_bvi":         peak_bvi,
        "dominant_emotion": dominant,
        "erratic_count":    erratic,
        "safety_alerts":    session["summary"].get("safety_alerts", []),
        "dss_score":        dss,
        "dss_tier":         tier,
    }
    # Persist extra drowsiness fields when supplied by client
    if client_drowsy_frames is not None:
        summary_doc["drowsy_frames"] = int(client_drowsy_frames)
    if client_drowsy_pct is not None:
        summary_doc["drowsy_pct"]    = float(client_drowsy_pct)
    if client_duration is not None:
        summary_doc["duration_sec"]  = int(client_duration)
    if client_total_alerts is not None:
        summary_doc["total_alerts"]  = int(client_total_alerts)
    if not frames and client_dss is not None:
        summary_doc["total_frames"]  = int(body.get("total_frames", 0))

    db.driving_sessions.update_one(
        {"_id": ObjectId(sid)},
        {"$set": {
            "status":   "completed",
            "ended_at": now,
            "summary":  summary_doc,
        }}
    )

    return jsonify({
        "session_id": sid,
        "ended_at":   now,
        "summary": {
            "total_frames":     summary_doc["total_frames"],
            "avg_bvi":          avg_bvi,
            "peak_bvi":         peak_bvi,
            "dominant_emotion": dominant,
            "erratic_count":    erratic,
            "dss_score":        dss,
            "dss_tier":         tier,
            "drowsy_frames":    summary_doc.get("drowsy_frames"),
            "drowsy_pct":       summary_doc.get("drowsy_pct"),
            "duration_sec":     summary_doc.get("duration_sec"),
            "total_alerts":     summary_doc.get("total_alerts"),
        }
    }), 200


@driver_bp.post("/session/frame")
@token_required
def session_frame(current_user):
    """
    POST /api/driver/session/frame
    Body: { session_id, emotion, confidence, probabilities,
            bvi_score, bvi_state, transition_rate, entropy,
            objects_detected }
    Appends one frame result to the active session document.
    """
    from ..database import get_db
    from bson import ObjectId

    db   = get_db()
    body = request.get_json(silent=True) or {}
    sid  = body.get("session_id")

    if not sid:
        return jsonify({"error": "session_id required"}), 400

    frame_record = {
        "timestamp":        datetime.utcnow().isoformat(),
        "emotion":          body.get("emotion"),
        "confidence":       body.get("confidence"),
        "probabilities":    body.get("probabilities", {}),
        "bvi_score":        body.get("bvi_score"),
        "bvi_state":        body.get("bvi_state"),
        "transition_rate":  body.get("transition_rate"),
        "entropy":          body.get("entropy"),
        "objects_detected": body.get("objects_detected", []),
    }

    db.driving_sessions.update_one(
        {"_id": ObjectId(sid), "driver_id": str(current_user.id), "status": "active"},
        {
            "$push": {"frames": frame_record},
            "$inc":  {"summary.total_frames": 1},
        }
    )

    # Auto-alert if BVI is erratic
    if body.get("bvi_state") == "erratic":
        db.driving_sessions.update_one(
            {"_id": ObjectId(sid), "driver_id": str(current_user.id)},
            {"$push": {"summary.safety_alerts": {
                "type": "erratic_bvi",
                "time": frame_record["timestamp"],
                "bvi":  body.get("bvi_score"),
            }}}
        )

    return jsonify({"saved": True}), 200


@driver_bp.get("/session/active")
@token_required
def session_active(current_user):
    """
    GET /api/driver/session/active
    Returns the current active session for this driver, or null.
    """
    from ..database import get_db

    db      = get_db()
    session = db.driving_sessions.find_one(
        {"driver_id": str(current_user.id), "status": "active"},
        {"frames": 0}   # exclude large frames array
    )
    if not session:
        return jsonify({"session": None}), 200

    session["_id"] = str(session["_id"])
    return jsonify({"session": session}), 200


@driver_bp.get("/sessions")
@token_required
def list_sessions(current_user):
    """
    GET /api/driver/sessions?limit=10
    Returns recent completed sessions for this driver (no frames array).
    """
    from ..database import get_db

    db    = get_db()
    limit = min(int(request.args.get("limit", 10)), 50)
    docs  = list(
        db.driving_sessions.find(
            {"driver_id": str(current_user.id), "status": "completed"},
            {"frames": 0}
        ).sort("started_at", -1).limit(limit)
    )
    for d in docs:
        d["_id"] = str(d["_id"])
    return jsonify({"sessions": docs}), 200


# ── Behavior analytics (time-range query) ────────────────────────────────────
@driver_bp.get("/analytics")
@token_required
def get_analytics(current_user):
    """
    GET /api/driver/analytics?range=7d|30d|90d
    Returns BVI time-series history for the requested window.
    """
    raw   = request.args.get("range", "30d")
    days  = {"7d": 7, "30d": 30, "90d": 90}.get(raw, 30)
    uid   = str(current_user.id)
    seed  = sum(ord(c) for c in uid) if uid else 42
    history = _bvi_history(days=days, seed=seed)
    return jsonify({"range": raw, "days": days, "history": history}), 200


# ── Driver Safety Score rank ──────────────────────────────────────────────────

TIER_ORDER = ["High Risk", "At Risk", "Needs Attention", "Safe", "Elite"]
TIER_COLOR = {
    "Elite":           "#22c55e",
    "Safe":            "#38bdf8",
    "Needs Attention": "#f59e0b",
    "At Risk":         "#f97316",
    "High Risk":       "#ef4444",
}


@driver_bp.get("/rank")
@token_required
def get_rank(current_user):
    """
    GET /api/driver/rank
    Aggregates DSS scores from the last 20 completed sessions,
    returns avg_dss, tier, trend direction, best/worst, and per-session details.
    """
    from ..database import get_db

    db = get_db()
    sessions = list(
        db.driving_sessions.find(
            {"driver_id": str(current_user.id), "status": "completed"},
            {"summary": 1, "started_at": 1, "ended_at": 1, "_id": 1}
        ).sort("started_at", -1).limit(20)
    )

    scored = [
        s for s in sessions
        if s.get("summary", {}).get("dss_score") is not None
    ]

    if not scored:
        return jsonify({
            "sessions_analysed": 0,
            "avg_dss":           None,
            "tier":              None,
            "tier_color":        None,
            "trend":             "stable",
            "best_dss":          None,
            "worst_dss":         None,
            "session_scores":    [],
        }), 200

    # dss_scores[0] = most recent
    dss_scores = [s["summary"]["dss_score"] for s in scored]
    avg_dss    = round(sum(dss_scores) / len(dss_scores), 1)
    best_dss   = max(dss_scores)
    worst_dss  = min(dss_scores)

    # Trend: compare avg of last 3 vs avg of previous 3
    if len(dss_scores) >= 6:
        recent_avg = sum(dss_scores[:3]) / 3
        older_avg  = sum(dss_scores[3:6]) / 3
        if recent_avg > older_avg + 3:
            trend = "improving"
        elif recent_avg < older_avg - 3:
            trend = "declining"
        else:
            trend = "stable"
    elif len(dss_scores) >= 2:
        trend = "improving" if dss_scores[0] > dss_scores[-1] else ("declining" if dss_scores[0] < dss_scores[-1] else "stable")
    else:
        trend = "stable"

    if avg_dss >= 90:
        tier = "Elite"
    elif avg_dss >= 75:
        tier = "Safe"
    elif avg_dss >= 60:
        tier = "Needs Attention"
    elif avg_dss >= 40:
        tier = "At Risk"
    else:
        tier = "High Risk"

    # Reverse so oldest first for the chart (chronological)
    session_scores = [
        {
            "id":        str(s["_id"]),
            "date":      (s.get("started_at") or "")[:10],
            "time":      (s.get("started_at") or "")[11:16],
            "dss":       s["summary"]["dss_score"],
            "tier":      s["summary"].get("dss_tier", "—"),
            "avg_bvi":   round(s["summary"]["avg_bvi"], 3) if s["summary"].get("avg_bvi") is not None else None,
            "dominant":  s["summary"].get("dominant_emotion"),
            "erratic":   s["summary"].get("erratic_count", 0),
            "frames":    s["summary"].get("total_frames", 0),
        }
        for s in reversed(scored)   # chronological order
    ]

    return jsonify({
        "sessions_analysed": len(scored),
        "avg_dss":           avg_dss,
        "best_dss":          best_dss,
        "worst_dss":         worst_dss,
        "trend":             trend,
        "tier":              tier,
        "tier_color":        TIER_COLOR[tier],
        "session_scores":    session_scores,
    }), 200


# ── Driver Stats (comprehensive analytics) ────────────────────────────────────

@driver_bp.get("/stats")
@token_required
def get_stats(current_user):
    """
    GET /api/driver/stats
    Aggregates all completed sessions into a rich stats payload:
    - overview counts/averages
    - DSS history per session
    - BVI distribution & history
    - emotion breakdown totals
    - distraction stats
    - per-session table (last 30)
    """
    from ..database import get_db
    from collections import Counter

    db  = get_db()
    uid = str(current_user.id)

    sessions = list(
        db.driving_sessions.find(
            {"driver_id": uid, "status": "completed"},
            {"frames": 0}
        ).sort("started_at", 1)   # oldest first for charts
    )

    # Also fetch one session's frames for the emotion detail (most recent)
    latest_frames = []
    if sessions:
        latest_session = db.driving_sessions.find_one(
            {"_id": sessions[-1]["_id"]},
            {"frames": 1}
        )
        latest_frames = latest_session.get("frames", []) if latest_session else []

    total_sessions = len(sessions)

    if total_sessions == 0:
        # Return empty payload so UI can show empty state
        return jsonify({
            "total_sessions": 0,
            "total_frames":   0,
            "overview":       {},
            "dss_chart":      [],
            "bvi_chart":      [],
            "emotion_totals": {},
            "distraction":    {},
            "tier_dist":      {},
            "sessions_table": [],
            "bvi_history":    _bvi_history(days=30, seed=sum(ord(c) for c in uid)),
        }), 200

    # ── Aggregate over all sessions ─────────────────────────────────────
    total_frames   = 0
    all_dss        = []
    all_avg_bvi    = []
    all_peak_bvi   = []
    all_erratic    = []
    all_dominants  = []
    tier_dist      = {t: 0 for t in TIER_ORDER}
    emotion_counts = Counter()
    total_distraction_frames = 0

    dss_chart   = []   # [{date, dss, tier, avg_bvi, session_num}]
    bvi_chart   = []   # [{date, avg_bvi, peak_bvi, erratic_count}]
    sessions_table = []

    for i, s in enumerate(sessions):
        sm = s.get("summary", {})
        tf = sm.get("total_frames", 0)
        ab = sm.get("avg_bvi")
        pb = sm.get("peak_bvi")
        ec = sm.get("erratic_count", 0)
        dom = sm.get("dominant_emotion")
        dss = sm.get("dss_score")
        tier = sm.get("dss_tier", "—")
        date_raw = (s.get("started_at") or "")
        date_str = date_raw[:10]
        time_str = date_raw[11:16]

        total_frames += tf
        if ab is not None: all_avg_bvi.append(ab)
        if pb is not None: all_peak_bvi.append(pb)
        all_erratic.append(ec)
        if dom: all_dominants.append(dom)
        if dss is not None: all_dss.append(dss)
        if tier in tier_dist: tier_dist[tier] += 1

        if dss is not None:
            dss_chart.append({
                "session":  i + 1,
                "date":     date_str,
                "time":     time_str,
                "dss":      dss,
                "tier":     tier,
                "avg_bvi":  round(ab, 3) if ab is not None else None,
            })
        bvi_chart.append({
            "session":      i + 1,
            "date":         date_str,
            "avg_bvi":      round(ab, 3) if ab is not None else None,
            "peak_bvi":     round(pb, 3) if pb is not None else None,
            "erratic_count":ec,
        })
        sessions_table.append({
            "id":        str(s["_id"]),
            "session":   i + 1,
            "date":      date_str,
            "time":      time_str,
            "frames":    tf,
            "avg_bvi":   round(ab, 3) if ab is not None else None,
            "peak_bvi":  round(pb, 3) if pb is not None else None,
            "erratic":   ec,
            "dominant":  dom,
            "dss":       dss,
            "tier":      tier,
        })

    # Emotion totals from latest session frames
    for f in latest_frames:
        em = f.get("emotion")
        if em:
            emotion_counts[em.lower()] += 1
        if f.get("objects_detected"):
            total_distraction_frames += 1

    # Overview averages
    avg_dss_all  = round(sum(all_dss) / len(all_dss), 1)  if all_dss  else None
    best_dss_all = max(all_dss)  if all_dss  else None
    worst_dss_all= min(all_dss)  if all_dss  else None
    avg_bvi_all  = round(sum(all_avg_bvi) / len(all_avg_bvi), 3) if all_avg_bvi else None
    peak_bvi_all = round(max(all_peak_bvi), 3) if all_peak_bvi else None
    total_erratic= sum(all_erratic)
    dominant_overall = Counter(all_dominants).most_common(1)[0][0] if all_dominants else "—"

    # Distraction rate over latest session
    distraction_rate = 0
    if latest_frames:
        distraction_rate = round((total_distraction_frames / len(latest_frames)) * 100, 1)

    # Tier for avg DSS
    overall_tier = "—"
    if avg_dss_all is not None:
        if avg_dss_all >= 90:   overall_tier = "Elite"
        elif avg_dss_all >= 75: overall_tier = "Safe"
        elif avg_dss_all >= 60: overall_tier = "Needs Attention"
        elif avg_dss_all >= 40: overall_tier = "At Risk"
        else:                   overall_tier = "High Risk"

    # Trend: last-3 vs prior-3
    trend = "stable"
    if len(all_dss) >= 6:
        r = sum(all_dss[-3:]) / 3
        o = sum(all_dss[-6:-3]) / 3
        trend = "improving" if r > o + 3 else ("declining" if r < o - 3 else "stable")
    elif len(all_dss) >= 2:
        trend = "improving" if all_dss[-1] > all_dss[0] else ("declining" if all_dss[-1] < all_dss[0] else "stable")

    return jsonify({
        "total_sessions":   total_sessions,
        "total_frames":     total_frames,
        "overview": {
            "avg_dss":          avg_dss_all,
            "best_dss":         best_dss_all,
            "worst_dss":        worst_dss_all,
            "overall_tier":     overall_tier,
            "overall_tier_color": TIER_COLOR.get(overall_tier, "#64748b"),
            "trend":            trend,
            "avg_bvi":          avg_bvi_all,
            "peak_bvi":         peak_bvi_all,
            "total_erratic":    total_erratic,
            "distraction_rate": distraction_rate,
            "dominant_emotion": dominant_overall,
        },
        "dss_chart":    dss_chart,
        "bvi_chart":    bvi_chart,
        "emotion_totals": dict(emotion_counts),
        "tier_dist":    tier_dist,
        "sessions_table": list(reversed(sessions_table)),  # newest first
        "bvi_history":  _bvi_history(days=30, seed=sum(ord(c) for c in uid)),
    }), 200
