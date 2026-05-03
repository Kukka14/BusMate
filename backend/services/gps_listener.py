import socket
import threading
import time


def start_tcp_nmea_client(host: str, port: int, reconnect_delay: float = 5.0):
    """Connect as a TCP client to a GPS2IP-like server and emit parsed NMEA via Socket.IO.

    This function is intended to be launched in a daemon thread from `app.py` after
    the Flask+SocketIO app is created. It imports `socketio` from the running app
    lazily to avoid circular imports.
    """
    buffer = b""
    while True:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10.0)
            sock.connect((host, int(port)))
            sock.settimeout(None)
            # Connected
            try:
                while True:
                    chunk = sock.recv(4096)
                    if not chunk:
                        break
                    buffer += chunk
                    while b"\n" in buffer:
                        line, buffer = buffer.split(b"\n", 1)
                        try:
                            s = line.decode(errors="ignore").strip()
                            if not s:
                                continue
                            # lazily import to avoid circular import at module import time
                            from app import socketio
                            try:
                                import pynmea2
                                msg = pynmea2.parse(s)
                                if hasattr(msg, "latitude") and hasattr(msg, "longitude"):
                                    payload = {
                                        "lat": getattr(msg, "latitude", None),
                                        "lon": getattr(msg, "longitude", None),
                                        "raw": s,
                                    }
                                    socketio.emit("gps_update", payload, broadcast=True)
                            except Exception:
                                # If parsing fails, forward raw NMEA line
                                socketio.emit("gps_raw", {"raw": s}, broadcast=True)
                        except Exception:
                            continue
            finally:
                try:
                    sock.close()
                except Exception:
                    pass
        except Exception:
            # connection failed; wait and retry
            time.sleep(reconnect_delay)


def start_udp_nmea_listener(host: str = "0.0.0.0", port: int = 5001):
    """Listen for UDP NMEA messages and emit via Socket.IO."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((host, int(port)))
    while True:
        try:
            data, addr = sock.recvfrom(4096)
            s = data.decode(errors="ignore").strip()
            if not s:
                continue
            try:
                from app import socketio
                import pynmea2
                msg = pynmea2.parse(s)
                if hasattr(msg, "latitude") and hasattr(msg, "longitude"):
                    payload = {"lat": getattr(msg, "latitude", None), "lon": getattr(msg, "longitude", None), "raw": s}
                    socketio.emit("gps_update", payload, broadcast=True)
                else:
                    socketio.emit("gps_raw", {"raw": s}, broadcast=True)
            except Exception:
                # fall back to raw emit
                from app import socketio
                socketio.emit("gps_raw", {"raw": s}, broadcast=True)
        except Exception:
            continue
