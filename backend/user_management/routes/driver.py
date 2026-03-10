from datetime import datetime, timedelta
import random, math
from flask import Blueprint, jsonify, request
from ..utils.auth_helpers import token_required

driver_bp = Blueprint("driver", __name__)

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

    db.driving_sessions.update_one(
        {"_id": ObjectId(sid)},
        {"$set": {
            "status":   "completed",
            "ended_at": now,
            "summary": {
                "total_frames":     len(frames),
                "avg_bvi":          avg_bvi,
                "peak_bvi":         peak_bvi,
                "dominant_emotion": dominant,
                "erratic_count":    erratic,
                "safety_alerts":    session["summary"].get("safety_alerts", []),
            },
        }}
    )

    return jsonify({
        "session_id": sid,
        "ended_at":   now,
        "summary": {
            "total_frames": len(frames),
            "avg_bvi":      avg_bvi,
            "peak_bvi":     peak_bvi,
            "dominant_emotion": dominant,
            "erratic_count":    erratic,
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
