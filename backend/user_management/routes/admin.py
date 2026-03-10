import random, math
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from ..utils.auth_helpers import token_required

admin_bp = Blueprint("admin", __name__)

# ── helpers ───────────────────────────────────────────────────────────────────

def _drowsiness_trend(range_key: str, seed: int = 7):
    """Returns bar-chart data for the selected range."""
    rng = random.Random(seed)
    if range_key == "24h":
        labels = ["00h","02h","04h","06h","08h","10h","12h","14h","16h","18h","20h","22h"]
    elif range_key == "7d":
        labels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
    else:  # 30d
        base  = datetime.utcnow()
        labels = [(base - timedelta(days=29-i)).strftime("%b %d") for i in range(30)]

    data = []
    peak_idx = rng.randint(len(labels)//2, len(labels)-2)
    for i, lbl in enumerate(labels):
        base_val = 40 + 60 * math.sin(math.pi * i / len(labels))
        val = max(5, int(base_val + rng.randint(-15, 15)))
        if i == peak_idx:
            val = int(val * 1.8)        # spike
        data.append({"day": lbl, "value": val, "peak": i == peak_idx})
    return data


def _sign_validation(range_key: str, seed: int = 13):
    """Returns sign detection counts that vary slightly per range."""
    rng = random.Random(seed + hash(range_key) % 100)
    signs = [
        {"label": "Speed Limit Signs",       "icon": "speed", "color": "#3b82f6",
         "detected": 2402 + rng.randint(-30, 30), "total": 2410},
        {"label": "Stop & Yield Signs",       "icon": "stop",  "color": "#ef4444",
         "detected": 1105 + rng.randint(-20, 20), "total": 1200},
        {"label": "Caution & Construction",   "icon": "warn",  "color": "#f59e0b",
         "detected":  540 + rng.randint(-10, 15), "total":  612},
        {"label": "Intersection Signs",       "icon": "cross", "color": "#22c55e",
         "detected":  820 + rng.randint(-20, 20), "total":  855},
    ]
    total_det   = sum(s["detected"] for s in signs)
    total_total = sum(s["total"]    for s in signs)
    match_rate  = round(total_det / total_total * 100, 1)
    return {"match_rate": match_rate, "signs": signs}


def _emotion_shift(range_key: str, seed: int = 21):
    rng = random.Random(seed + hash(range_key) % 50)
    stability = rng.randint(65, 82)
    return {
        "stability":           stability,
        "volatility":          "HIGH" if stability < 70 else "MEDIUM" if stability < 78 else "LOW",
        "stress_level":        rng.randint(35, 55),
        "focus_concentration": rng.randint(80, 95),
        "fatigue_onset":       rng.randint(8, 20),
    }


def _stats(range_key: str, seed: int = 3):
    rng = random.Random(seed + hash(range_key) % 30)
    return {
        "active_buses":    124 + rng.randint(-5, 10),
        "safety_alerts":  1208 + rng.randint(-50, 100),
        "avg_safety_score": round(88 + rng.uniform(-2, 2), 1),
        "sign_accuracy":    round(94.2 + rng.uniform(-0.5, 0.5), 1),
        "active_drivers":   98 + rng.randint(-3, 8),
        "on_time_pct":      round(91 + rng.uniform(-2, 3), 1),
    }


# ── endpoint ──────────────────────────────────────────────────────────────────

@admin_bp.get("/fleet-analytics")
@token_required
def fleet_analytics(current_user):
    """
    Returns all data needed by the Fleet Analytics Overview dashboard.
    Query param: ?range=24h|7d|30d  (default 24h)
    """
    range_key = request.args.get("range", "24h")
    uid_seed  = sum(ord(c) for c in str(current_user.id)) if current_user.id else 42

    # Try to pull real data from MongoDB
    real_active_buses = None
    real_alerts       = None
    try:
        from ..database import get_db
        db   = get_db()
        now  = datetime.utcnow()

        if range_key == "24h":
            since = now - timedelta(hours=24)
        elif range_key == "7d":
            since = now - timedelta(days=7)
        else:
            since = now - timedelta(days=30)

        real_active_buses = db.users.count_documents({
            "role": "driver", "status": {"$exists": True}
        })
        real_alerts = db.driving_sessions.count_documents({
            "started_at": {"$gte": since},
            "summary.safety_alerts": {"$exists": True},
        })
    except Exception:
        pass

    stats = _stats(range_key, uid_seed)
    if real_active_buses:
        stats["active_buses"] = real_active_buses
    if real_alerts is not None:
        stats["safety_alerts"] = real_alerts

    return jsonify({
        "range":              range_key,
        "stats":              stats,
        "drowsiness_trends":  _drowsiness_trend(range_key, uid_seed),
        "emotion_shift":      _emotion_shift(range_key, uid_seed),
        "sign_validation":    _sign_validation(range_key, uid_seed),
        "scene_analysis": {
            "urban_density": "High Traffic",
            "weather_state": "Light Rain",
            "visibility_km": round(random.uniform(3.5, 8.5), 1),
            "temp_c":        round(random.uniform(18, 28), 1),
        },
    }), 200


# ── fleet drivers list (lightweight) ─────────────────────────────────────────

@admin_bp.get("/drivers")
@token_required
def list_drivers(current_user):
    """Returns a lightweight list of all driver accounts."""
    try:
        from ..database import get_db
        db   = get_db()
        docs = list(db.users.find({"role": "driver"}, {"password": 0}).limit(100))
        out  = []
        for d in docs:
            out.append({
                "id":       str(d["_id"]),
                "username": d.get("username", ""),
                "email":    d.get("email", ""),
                "company":  d.get("company", ""),
                "status":   d.get("status", "offline"),
            })
        return jsonify(out), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
