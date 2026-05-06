"""
Drowsiness analytics routes.

Collections used:
  shift_drowsiness_logs   – one document per periodic reading (~30 s)
  (summaries are derived via aggregation; no separate summary collection needed)
"""

from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from pymongo import ASCENDING, DESCENDING

from Emotion_Shift_Profile.database import get_db

drowsiness_bp = Blueprint("drowsiness_analytics", __name__)
_indexes_created = False


def _col():
    global _indexes_created
    col = get_db()["shift_drowsiness_logs"]
    if not _indexes_created:
        col.create_index([("driver_id", ASCENDING), ("timestamp", DESCENDING)])
        col.create_index([("shift_id", ASCENDING), ("timestamp", ASCENDING)])
        _indexes_created = True
    return col


# ── Log a single periodic reading ────────────────────────────────────────────
@drowsiness_bp.route("/api/drowsiness/log", methods=["POST"])
def log_reading():
    data = request.json or {}
    if not data.get("shift_id") or not data.get("driver_id"):
        return jsonify({"error": "shift_id and driver_id required"}), 400

    doc = {
        "shift_id":              data["shift_id"],
        "driver_id":             data["driver_id"],
        "schedule_id":           data.get("schedule_id", ""),
        "route_name":            data.get("route_name", ""),
        "start_town":            data.get("start_town", ""),
        "end_town":              data.get("end_town", ""),
        "timestamp":             datetime.now(timezone.utc),
        "shift_elapsed_seconds": int(data.get("shift_elapsed_seconds", 0)),
        "drowsy_prob":           float(data.get("drowsy_prob") or 0),
        "verdict":               data.get("verdict", "Alert"),
        "alert_triggered":       bool(data.get("alert_triggered", False)),
        "face_detected":         bool(data.get("face_detected", True)),
        "features": {
            "ear":         data.get("features", {}).get("ear"),
            "mar":         data.get("features", {}).get("mar"),
            "pitch":       data.get("features", {}).get("pitch"),
            "yaw":         data.get("features", {}).get("yaw"),
            "eye_closure": data.get("features", {}).get("eye_closure"),
            "perclos":     data.get("features", {}).get("perclos"),
            "yawn_freq":   data.get("features", {}).get("yawn_freq"),
        },
        "models": {
            "m1": data.get("models", {}).get("m1"),
            "m2": data.get("models", {}).get("m2"),
            "m3": data.get("models", {}).get("m3"),
            "m4": data.get("models", {}).get("m4"),
            "m5": data.get("models", {}).get("m5"),
        },
    }
    _col().insert_one(doc)
    return jsonify({"ok": True})


# ── Timeline for a single shift ───────────────────────────────────────────────
@drowsiness_bp.route("/api/drowsiness/shift/<shift_id>/timeline", methods=["GET"])
def shift_timeline(shift_id):
    docs = list(
        _col()
        .find({"shift_id": shift_id}, {"_id": 0})
        .sort("shift_elapsed_seconds", ASCENDING)
    )
    # Convert datetime to ISO string for JSON serialisation
    for d in docs:
        if isinstance(d.get("timestamp"), datetime):
            d["timestamp"] = d["timestamp"].isoformat()
    return jsonify(docs)


# ── Per-driver analysis (hourly pattern + recent shifts) ─────────────────────
@drowsiness_bp.route("/api/drowsiness/driver/<driver_id>/analysis", methods=["GET"])
def driver_analysis(driver_id):
    col = _col()

    # Hourly pattern — average drowsy_prob by hour of day (UTC)
    hourly_pipeline = [
        {"$match": {"driver_id": driver_id}},
        {"$group": {
            "_id": {"$hour": "$timestamp"},
            "avg_prob":      {"$avg": "$drowsy_prob"},
            "alert_count":   {"$sum": {"$cond": ["$alert_triggered", 1, 0]}},
            "total":         {"$sum": 1},
            "drowsy_count":  {"$sum": {"$cond": [{"$eq": ["$verdict", "Drowsy"]}, 1, 0]}},
        }},
        {"$sort": {"_id": 1}},
    ]
    hourly_raw = list(col.aggregate(hourly_pipeline))
    hourly = [
        {
            "hour":        h["_id"],
            "avg_prob":    round(h["avg_prob"], 3),
            "alert_count": h["alert_count"],
            "drowsy_pct":  round(h["drowsy_count"] / max(h["total"], 1) * 100, 1),
            "total":       h["total"],
        }
        for h in hourly_raw
    ]

    # Recent shifts — one summary row per shift_id
    shift_pipeline = [
        {"$match": {"driver_id": driver_id}},
        {"$sort": {"timestamp": ASCENDING}},
        {"$group": {
            "_id":           "$shift_id",
            "route_name":    {"$first": "$route_name"},
            "start_town":    {"$first": "$start_town"},
            "end_town":      {"$first": "$end_town"},
            "schedule_id":   {"$first": "$schedule_id"},
            "started_at":    {"$first": "$timestamp"},
            "ended_at":      {"$last":  "$timestamp"},
            "readings":      {"$sum": 1},
            "avg_prob":      {"$avg": "$drowsy_prob"},
            "max_prob":      {"$max": "$drowsy_prob"},
            "alert_count":   {"$sum": {"$cond": ["$alert_triggered", 1, 0]}},
            "drowsy_count":  {"$sum": {"$cond": [{"$eq": ["$verdict", "Drowsy"]}, 1, 0]}},
            "duration_sec":  {"$max": "$shift_elapsed_seconds"},
        }},
        {"$sort": {"started_at": DESCENDING}},
        {"$limit": 20},
    ]
    shifts_raw = list(col.aggregate(shift_pipeline))
    shifts = []
    for s in shifts_raw:
        started = s["started_at"]
        ended   = s["ended_at"]
        shifts.append({
            "shift_id":    s["_id"],
            "route_name":  s.get("route_name") or f"{s.get('start_town','')} → {s.get('end_town','')}",
            "started_at":  started.isoformat() if isinstance(started, datetime) else started,
            "ended_at":    ended.isoformat()   if isinstance(ended,   datetime) else ended,
            "duration_sec": s.get("duration_sec") or 0,
            "readings":    s["readings"],
            "avg_prob":    round(s["avg_prob"], 3),
            "max_prob":    round(s["max_prob"], 3),
            "alert_count": s["alert_count"],
            "drowsy_pct":  round(s["drowsy_count"] / max(s["readings"], 1) * 100, 1),
        })

    return jsonify({"hourly": hourly, "shifts": shifts})
