import random, math
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from ..utils.auth_helpers import token_required, admin_required

admin_bp = Blueprint("admin", __name__)

# ── Tier helpers (shared across endpoints) ────────────────────────────────────

TIER_COLOR = {
    "Excellent":         "#22c55e",
    "Good":              "#38bdf8",
    "Average":           "#f59e0b",
    "Needs Improvement": "#f97316",
    "Poor":              "#ef4444",
}

def _tier_for_score(score):
    """Return tier label for a numeric score 0-100."""
    if score is None: return "Unranked"
    if score >= 85:   return "Excellent"
    if score >= 70:   return "Good"
    if score >= 50:   return "Average"
    if score >= 30:   return "Needs Improvement"
    return "Poor"


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


# ── Admin account creation is DISABLED via API ───────────────────────────────
#
# Admin credentials are hard-coded in the server's .env file and seeded
# automatically on startup.  There is no endpoint to create or register
# admin accounts — this is intentional and prevents privilege escalation.
#
# To change the admin password: update ADMIN_PASSWORD in .env and restart.
# To add a second admin: add ADMIN_EMAIL_2 / ADMIN_PASSWORD_2 and extend
# the _seed_admin() function in app.py.
#
# The former /setup and /create-admin endpoints have been permanently removed.


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


@admin_bp.get("/drivers/detailed")
@token_required
@admin_required
def list_drivers_detailed(current_user):
    """Returns all driver accounts merged with their driver_profiles doc."""
    try:
        from ..database import get_db
        from bson import ObjectId
        db   = get_db()
        users = list(db.users.find({"role": "driver"},
                                   {"password_hash": 0}).limit(200))
        # Build a map of user_id → profile
        user_ids    = [str(u["_id"]) for u in users]
        profiles    = list(db.driver_profiles.find({"user_id": {"$in": user_ids}}))
        profile_map = {p["user_id"]: p for p in profiles}

        def _str_date(v):
            if v is None:
                return None
            return v.isoformat() if hasattr(v, "isoformat") else str(v)

        out = []
        for u in users:
            uid = str(u["_id"])
            dp  = profile_map.get(uid, {})
            out.append({
                "_id":       uid,
                "username":  u.get("username", ""),
                "email":     u.get("email", ""),
                "company":   u.get("company", ""),
                "is_active": u.get("is_active", True),
                "role":      u.get("role", "driver"),
                "created_at": _str_date(u.get("created_at")),
                "profile": {
                    "vehicle":          dp.get("vehicle", ""),
                    "route":            dp.get("route", ""),
                    "shift":            dp.get("shift", ""),
                    "phone":            dp.get("phone", ""),
                    "license_number":   dp.get("license_number", ""),
                    "license_expiry":   _str_date(dp.get("license_expiry")),
                    "experience_years": dp.get("experience_years", 0),
                    "photo_url":        dp.get("photo_url", ""),
                    "emergency_contact":dp.get("emergency_contact",
                                               {"name": "", "phone": "", "relation": ""}),
                },
            })
        return jsonify(out), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.get("/drivers/rankings")
@token_required
@admin_required
def get_driver_rankings(current_user):
    """
    Aggregate completed shift scores to rank all drivers by average score.
    Drivers with fewer than 3 completed shifts are listed as unranked.
    """
    try:
        from ..database import get_db
        from bson import ObjectId
        db = get_db()

        pipeline = [
            {"$match": {
                "status": "Completed",
                "score.total_score": {"$exists": True, "$ne": None},
            }},
            {"$group": {
                "_id":          "$driver_id",
                "avg_score":    {"$avg": "$score.total_score"},
                "total_shifts": {"$sum": 1},
                "best_score":   {"$max": "$score.total_score"},
            }},
            {"$sort": {"avg_score": -1}},
        ]
        results = list(db.shift_scores.aggregate(pipeline))

        ranked_raw   = [r for r in results if r["total_shifts"] >= 3]
        unranked_raw = [r for r in results if r["total_shifts"] < 3]

        # Fetch all relevant driver names in a single round-trip
        all_ids = [r["_id"] for r in results]
        valid_oids = []
        for id_str in all_ids:
            try: valid_oids.append(ObjectId(id_str))
            except Exception: pass

        name_map = {}
        if valid_oids:
            for u in db.users.find(
                {"_id": {"$in": valid_oids}},
                {"username": 1, "company": 1, "is_active": 1},
            ):
                name_map[str(u["_id"])] = u

        def _build(r, rank=None):
            avg  = round(r["avg_score"],  1) if r.get("avg_score")  is not None else 0
            best = round(r["best_score"], 1) if r.get("best_score") is not None else 0
            tier = _tier_for_score(avg)
            info = name_map.get(r["_id"], {})
            entry = {
                "driver_id":    r["_id"],
                "username":     info.get("username",  "Unknown"),
                "company":      info.get("company",   ""),
                "is_active":    info.get("is_active", True),
                "avg_score":    avg,
                "best_score":   best,
                "total_shifts": r["total_shifts"],
                "tier":         tier,
                "tier_color":   TIER_COLOR.get(tier, "#64748b"),
            }
            if rank is not None:
                entry["rank"] = rank
            return entry

        ranked   = [_build(r, i + 1) for i, r in enumerate(ranked_raw)]
        unranked = [_build(r)        for r  in unranked_raw]

        return jsonify({
            "ranked":              ranked,
            "unranked":            unranked,
            "total_ranked":        len(ranked),
            "min_shifts_required": 3,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.put("/drivers/<driver_id>")
@token_required
@admin_required
def update_driver_account(current_user, driver_id):
    """Update a driver's base account fields (username, email, company, password, is_active)."""
    try:
        from ..database import get_db
        from ..utils.password import hash_password
        from bson import ObjectId
        db   = get_db()
        body = request.get_json(force=True, silent=True) or {}

        update = {"updated_at": datetime.utcnow()}
        if "username"  in body: update["username"]  = body["username"]
        if "email"     in body: update["email"]      = body["email"]
        if "company"   in body: update["company"]    = body["company"]
        if "is_active" in body: update["is_active"]  = bool(body["is_active"])
        if "password"  in body and body["password"]:
            update["password_hash"] = hash_password(body["password"])

        if len(update) == 1:
            return jsonify({"error": "No valid fields provided"}), 400

        doc = db.users.find_one_and_update(
            {"_id": ObjectId(driver_id), "role": {"$in": ["driver", "user"]}},
            {"$set": update},
            return_document=True,
        )
        if not doc:
            return jsonify({"error": "Driver not found"}), 404
        return jsonify({"message": "Driver account updated"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.put("/drivers/<driver_id>/profile")
@token_required
@admin_required
def update_driver_profile(current_user, driver_id):
    """Update a driver's extended profile (vehicle, route, shift, license, etc.)."""
    try:
        from ..database import get_db
        from ..models.driver_profile import DriverProfile
        db   = get_db()
        body = request.get_json(force=True, silent=True) or {}

        allowed = {"vehicle", "route", "shift", "phone", "license_number",
                   "license_expiry", "emergency_contact", "photo_url", "experience_years"}
        update  = {k: v for k, v in body.items() if k in allowed}
        if not update:
            return jsonify({"error": "No valid fields provided"}), 400

        update["updated_at"] = datetime.utcnow()
        db.driver_profiles.update_one(
            {"user_id": driver_id},
            {"$set": update},
            upsert=True,
        )
        return jsonify({"message": "Driver profile updated"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.get("/drivers/<driver_id>/shift-scores")
@token_required
@admin_required
def get_driver_shift_scores(current_user, driver_id):
    """
    Return all completed shift scores for a specific driver.
    Used by the admin ViewDrawer to show schedule history + component breakdown.
    """
    try:
        from ..database import get_db
        db = get_db()

        docs = list(
            db.shift_scores.find(
                {"driver_id": driver_id, "status": "Completed"},
                {"_id": 0, "metrics": 0}          # exclude raw metrics blob
            ).sort("scored_at", -1).limit(50)
        )

        # Build summary stats
        scores = [d.get("score", {}).get("total_score") for d in docs if d.get("score", {}).get("total_score") is not None]
        avg_score  = round(sum(scores) / len(scores), 1) if scores else None
        best_score = max(scores) if scores else None

        # Serialise each shift
        out = []
        for d in docs:
            sc = d.get("score") or {}
            tier = sc.get("tier", "—")
            out.append({
                "scored_at":   d.get("scored_at", ""),
                "date":        d.get("date", ""),
                "shift_time":  d.get("shift_time", ""),
                "start_town":  d.get("start_town", ""),
                "end_town":    d.get("end_town", ""),
                "bus":         d.get("bus", ""),
                "route_name":  d.get("route_name", ""),
                "duration_sec":d.get("duration_sec", 0),
                "total_score": sc.get("total_score"),
                "tier":        tier,
                "tier_color":  TIER_COLOR.get(tier, "#64748b"),
                "components":  sc.get("components", {}),
            })

        return jsonify({
            "driver_id":    driver_id,
            "total_shifts": len(docs),
            "avg_score":    avg_score,
            "best_score":   best_score,
            "shifts":       out,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.get("/drivers/<driver_id>/bvi-analysis")
@token_required
@admin_required
def get_driver_bvi_analysis(current_user, driver_id):
    """
    Return BVI (Behavioural Volatility Index) time-based analysis for a driver.
    Provides per-shift trend, hourly pattern, day-of-week breakdown, and state stats.
    """
    try:
        from ..database import get_db
        from datetime import datetime as _dt
        from collections import defaultdict
        db = get_db()

        docs = list(
            db.shift_scores.find(
                {"driver_id": driver_id, "status": "Completed"},
                {
                    "_id": 0,
                    "metrics.avg_bvi": 1,
                    "scored_at": 1,
                    "shift_time": 1,
                    "route_name": 1,
                    "date": 1,
                    "duration_sec": 1,
                    "score.components.emotion": 1,
                }
            ).sort("scored_at", 1).limit(90)
        )

        if not docs:
            return jsonify({
                "total_shifts": 0,
                "avg_bvi": None,
                "peak_hour": None,
                "state_counts": {"stable": 0, "unstable": 0, "erratic": 0},
                "shifts": [],
                "hourly": [],
                "by_day": [],
            }), 200

        hourly_bvi = defaultdict(list)
        dow_bvi    = defaultdict(list)
        shifts_out = []

        for d in docs:
            avg_bvi   = (d.get("metrics") or {}).get("avg_bvi")
            scored_at = d.get("scored_at", "")

            # Fallback: estimate BVI from emotion component score
            if avg_bvi is None:
                emo = (d.get("score") or {}).get("components", {}).get("emotion", {})
                emo_score = emo.get("score")
                emo_max   = emo.get("max", 20)
                if emo_score is not None and emo_max > 0:
                    avg_bvi = round(1.0 - emo_score / emo_max, 3)

            hour = None
            dow  = None
            if scored_at:
                try:
                    dt   = _dt.fromisoformat(scored_at.replace("Z", ""))
                    hour = dt.hour
                    dow  = dt.weekday()   # 0 = Monday
                except Exception:
                    pass

            # Fallback: parse shift_time string e.g. "06:00 - 14:00"
            if hour is None:
                st = d.get("shift_time", "")
                if st:
                    try:
                        hour = int(st.split(":")[0])
                    except Exception:
                        pass

            if avg_bvi is not None:
                if hour is not None:
                    hourly_bvi[hour].append(avg_bvi)
                if dow is not None:
                    dow_bvi[dow].append(avg_bvi)

            bvi_pct = round(avg_bvi * 100) if avg_bvi is not None else None
            state   = (
                "stable"   if avg_bvi is not None and avg_bvi < 0.30 else
                "unstable" if avg_bvi is not None and avg_bvi < 0.60 else
                "erratic"  if avg_bvi is not None else None
            )

            shifts_out.append({
                "scored_at":    scored_at,
                "date":         d.get("date", scored_at[:10] if scored_at else ""),
                "shift_time":   d.get("shift_time", ""),
                "route_name":   d.get("route_name", ""),
                "avg_bvi":      avg_bvi,
                "bvi_pct":      bvi_pct,
                "state":        state,
                "duration_sec": d.get("duration_sec", 0),
                "hour":         hour,
            })

        # Hourly aggregation (24 buckets)
        hourly_out = []
        for h in range(24):
            vals = hourly_bvi.get(h, [])
            hourly_out.append({
                "hour":    h,
                "label":   f"{h:02d}:00",
                "avg_bvi": round(sum(vals) / len(vals) * 100) if vals else 0,
                "count":   len(vals),
            })

        # Day-of-week aggregation
        day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        dow_out = []
        for i, label in enumerate(day_labels):
            vals = dow_bvi.get(i, [])
            dow_out.append({
                "day":     label,
                "avg_bvi": round(sum(vals) / len(vals) * 100) if vals else 0,
                "count":   len(vals),
            })

        all_bvi     = [s["avg_bvi"] for s in shifts_out if s["avg_bvi"] is not None]
        avg_overall = round(sum(all_bvi) / len(all_bvi) * 100) if all_bvi else None

        active_hourly = [h for h in hourly_out if h["count"] > 0]
        peak_hour = max(active_hourly, key=lambda h: h["avg_bvi"]) if active_hourly else None

        state_counts = {"stable": 0, "unstable": 0, "erratic": 0}
        for s in shifts_out:
            if s["state"] in state_counts:
                state_counts[s["state"]] += 1

        return jsonify({
            "total_shifts": len(shifts_out),
            "avg_bvi":      avg_overall,
            "peak_hour":    peak_hour,
            "state_counts": state_counts,
            "shifts":       shifts_out[-30:],   # last 30 for trend chart
            "hourly":       hourly_out,
            "by_day":       dow_out,
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.delete("/drivers/<driver_id>")
@token_required
@admin_required
def delete_driver(current_user, driver_id):
    """Remove a driver account and their profile."""
    try:
        from ..database import get_db
        from bson import ObjectId
        db = get_db()
        result = db.users.delete_one(
            {"_id": ObjectId(driver_id), "role": {"$in": ["driver", "user"]}}
        )
        if result.deleted_count == 0:
            return jsonify({"error": "Driver not found"}), 404
        # Clean up associated data
        db.driver_profiles.delete_one({"user_id": driver_id})
        db.driving_sessions.delete_many({"driver_id": driver_id})
        return jsonify({"message": "Driver removed"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Admin own profile ─────────────────────────────────────────────────────────

# ── Schedule management ───────────────────────────────────────────────────────

@admin_bp.get("/schedules")
@token_required
@admin_required
def list_schedules(current_user):
    """Return all schedules, joined with driver username."""
    try:
        from ..database import get_db
        db = get_db()
        docs = list(db.schedules.find({}).sort("date_iso", 1).limit(500))

        # build driver name lookup
        driver_ids = list({d.get("driver_id") for d in docs if d.get("driver_id")})
        driver_map = {}
        if driver_ids:
            from bson import ObjectId
            user_docs = db.users.find(
                {"_id": {"$in": [ObjectId(i) for i in driver_ids if len(i) == 24]}},
                {"username": 1}
            )
            driver_map = {str(u["_id"]): u.get("username", "") for u in user_docs}

        def _s(v):
            if v is None: return None
            return v.isoformat() if hasattr(v, "isoformat") else str(v)

        out = []
        for d in docs:
            out.append({
                "_id":        str(d["_id"]),
                "driver_id":  d.get("driver_id", ""),
                "driver_name":driver_map.get(d.get("driver_id", ""), d.get("driver_name", "")),
                "date_iso":   _s(d.get("date_iso")),
                "shift_time": d.get("shift_time", ""),
                "start_town": d.get("start_town", ""),
                "end_town":   d.get("end_town", ""),
                "bus":        d.get("bus", ""),
                "route_name": d.get("route_name", ""),
                "status":     d.get("status", "Upcoming"),
                "created_at": _s(d.get("created_at")),
            })
        return jsonify(out), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.post("/schedules")
@token_required
@admin_required
def create_schedule(current_user):
    """Create a new schedule entry."""
    try:
        from ..database import get_db
        db   = get_db()
        body = request.get_json(force=True, silent=True) or {}

        driver_id  = (body.get("driver_id")  or "").strip()
        date_iso   = (body.get("date_iso")   or "").strip()
        shift_time = (body.get("shift_time") or "").strip()
        start_town = (body.get("start_town") or "").strip()
        end_town   = (body.get("end_town")   or "").strip()
        bus        = (body.get("bus")        or "").strip()
        route_name = (body.get("route_name") or "").strip()
        status     = body.get("status", "Upcoming")

        if not driver_id or not date_iso or not shift_time:
            return jsonify({"error": "driver_id, date_iso and shift_time are required"}), 400

        if status not in ("Upcoming", "Today", "Completed"):
            status = "Upcoming"

        doc = {
            "driver_id":  driver_id,
            "date_iso":   date_iso,
            "shift_time": shift_time,
            "start_town": start_town,
            "end_town":   end_town,
            "bus":        bus,
            "route_name": route_name,
            "status":     status,
            "created_at": datetime.utcnow(),
        }
        result = db.schedules.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        doc["created_at"] = doc["created_at"].isoformat()
        return jsonify(doc), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.put("/schedules/<schedule_id>")
@token_required
@admin_required
def update_schedule(current_user, schedule_id):
    """Update an existing schedule."""
    try:
        from ..database import get_db
        from bson import ObjectId
        db   = get_db()
        body = request.get_json(force=True, silent=True) or {}

        update = {"updated_at": datetime.utcnow()}
        fields = ["driver_id", "date_iso", "shift_time", "start_town",
                  "end_town", "bus", "route_name", "status"]
        for f in fields:
            if f in body:
                update[f] = body[f]

        if body.get("status") and body["status"] not in ("Upcoming", "Today", "Completed"):
            update["status"] = "Upcoming"

        if len(update) == 1:
            return jsonify({"error": "No valid fields provided"}), 400

        result = db.schedules.update_one(
            {"_id": ObjectId(schedule_id)}, {"$set": update}
        )
        if result.matched_count == 0:
            return jsonify({"error": "Schedule not found"}), 404
        return jsonify({"message": "Schedule updated"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.delete("/schedules/<schedule_id>")
@token_required
@admin_required
def delete_schedule(current_user, schedule_id):
    """Delete a schedule entry."""
    try:
        from ..database import get_db
        from bson import ObjectId
        db = get_db()
        result = db.schedules.delete_one({"_id": ObjectId(schedule_id)})
        if result.deleted_count == 0:
            return jsonify({"error": "Schedule not found"}), 404
        return jsonify({"message": "Schedule deleted"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Admin own profile ─────────────────────────────────────────────────────────

@admin_bp.get("/profile")
@token_required
@admin_required
def get_admin_profile(current_user):
    """Return the logged-in admin's own profile (base User fields only)."""
    return jsonify({
        "id":         current_user.id,
        "username":   current_user.username,
        "email":      current_user.email,
        "company":    current_user.company,
        "role":       current_user.role,
        "is_active":  current_user.is_active,
    }), 200


@admin_bp.put("/profile")
@token_required
@admin_required
def update_admin_profile(current_user):
    """Update the logged-in admin's own base profile (username, email, company, password)."""
    body = request.get_json(force=True, silent=True) or {}
    from ..database import get_db
    from ..utils.password import hash_password
    from bson import ObjectId

    db     = get_db()
    update = {"updated_at": datetime.utcnow()}
    if "username" in body: update["username"] = body["username"]
    if "email"    in body: update["email"]    = body["email"]
    if "company"  in body: update["company"]  = body["company"]
    if "password" in body: update["password_hash"] = hash_password(body["password"])

    if len(update) == 1:   # only updated_at — nothing to save
        return jsonify({"error": "No valid fields provided"}), 400

    doc = db.users.find_one_and_update(
        {"_id": ObjectId(current_user.id)},
        {"$set": update},
        return_document=True,
    )
    if not doc:
        return jsonify({"error": "User not found"}), 404

    from ..models.user import User
    return jsonify({"message": "Profile updated", "user": User(doc).to_dict()}), 200
