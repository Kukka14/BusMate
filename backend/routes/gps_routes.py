from flask import Blueprint, request, jsonify

gps_bp = Blueprint("gps", __name__)


@gps_bp.route("/api/gps", methods=["POST"])
def gps_post():
    data = request.get_json(force=True, silent=True) or {}
    lat = data.get("lat")
    lon = data.get("lon")
    if lat is None or lon is None:
        return jsonify({"error": "missing lat/lon"}), 400
    # lazy import socketio to avoid circular imports
    try:
        from app import socketio
        socketio.emit("gps_update", data, broadcast=True)
    except Exception:
        pass
    return jsonify({"ok": True}), 200
