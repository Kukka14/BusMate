import random, math
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from ..utils.auth_helpers import token_required, admin_required

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

# ── Create a new admin account (existing admin only) ─────────────────────────

@admin_bp.post("/create-admin")
@token_required
@admin_required
def create_admin(current_user):
    """
    Create a new admin account.  Requires an existing admin token.
    Body: { username, email, password, company? }
    """
    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    email    = (data.get("email")    or "").strip()
    password = (data.get("password") or "").strip()
    company  = (data.get("company")  or "").strip()

    if not username or not email or not password:
        return jsonify({"error": "username, email and password are required"}), 400

    from ..services.user_service import UserService
    result, status = UserService.register(
        username=username,
        email=email,
        password=password,
        company=company,
        role="admin",
    )
    return jsonify(result), status


# ── First-time setup: create the very first admin (no token required) ─────────

@admin_bp.post("/setup")
def setup_first_admin():
    """
    One-time endpoint: creates the first admin account only if NO admin
    account exists yet.  Once an admin exists this returns 403.
    Body: { username, email, password, company? }
    """
    try:
        from ..database import get_db
        db = get_db()
        if db.users.count_documents({"role": "admin"}) > 0:
            return jsonify({
                "error": "Setup already complete. Use /admin/create-admin with an admin token."
            }), 403
    except Exception as exc:
        return jsonify({"error": f"Database error: {exc}"}), 500

    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    email    = (data.get("email")    or "").strip()
    password = (data.get("password") or "").strip()
    company  = (data.get("company")  or "").strip()

    if not username or not email or not password:
        return jsonify({"error": "username, email and password are required"}), 400

    from ..services.user_service import UserService
    result, status = UserService.register(
        username=username,
        email=email,
        password=password,
        company=company,
        role="admin",
    )
    return jsonify(result), status


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
