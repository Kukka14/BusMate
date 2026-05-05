import os
import json
import tempfile
import base64
import uuid
from collections import defaultdict, deque, Counter
from typing import Dict, Optional, Any
from datetime import datetime, timezone

import cv2
import numpy as np
from flask import Flask, request, jsonify, Response
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from tensorflow.keras.models import load_model
try:
    from ultralytics import YOLO
except Exception:
    YOLO = None
import time
import threading
from pathlib import Path
from tensorflow import keras as _keras
from tensorflow.keras import layers as _layers
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input as _mob_preprocess

from dotenv import load_dotenv
load_dotenv()

from Emotion_Shift_Profile import register_user_management
from Emotion_Shift_Profile.config import Config
from drowsiness_engine import DrowsinessEngine
# GPS routes and listener (lazy-start in __main__)
from routes.gps_routes import gps_bp


app = Flask(__name__)
app.config.from_object(Config)
CORS(
    app,
    origins=[
        "http://localhost:5173", "http://localhost:5174",
        "http://localhost:5175", "http://localhost:5176",
        "http://127.0.0.1:5173", "http://127.0.0.1:5174",
        "http://127.0.0.1:5175", "http://127.0.0.1:5176",
    ],
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Register user management blueprints (MongoDB — no table creation needed)
register_user_management(app)
# Register GPS routes
app.register_blueprint(gps_bp)


# ── Auto-seed the hard-coded admin account ───────────────────────────────────
def _seed_admin():
    """
    Runs at every startup.
    • If no admin with ADMIN_EMAIL exists  → creates it.
    • If the account already exists        → syncs the password + username
      from .env so credentials always match what is configured.
    Admin accounts CANNOT be created through any API endpoint.
    """
    try:
        from user_management.database import get_db
        from user_management.models.user import User
        from user_management.utils.password import hash_password
        from datetime import datetime

        admin_email    = os.getenv("ADMIN_EMAIL",    "admin@busmate.com")
        admin_username = os.getenv("ADMIN_USERNAME", "BusMate Admin")
        admin_password = os.getenv("ADMIN_PASSWORD", "BusMate@Admin2025")
        admin_company  = os.getenv("ADMIN_COMPANY",  "BusMate Fleet")

        db        = get_db()
        pw_hash   = hash_password(admin_password)
        existing  = db.users.find_one({"email": admin_email})

        if existing:
            # Sync credentials from .env on every restart
            db.users.update_one(
                {"email": admin_email},
                {"$set": {
                    "username":      admin_username,
                    "password_hash": pw_hash,
                    "role":          "admin",
                    "company":       admin_company,
                    "is_active":     True,
                    "updated_at":    datetime.utcnow(),
                }},
            )
            print(f"[seed] ✓ Admin credentials synced → {admin_email}")
        else:
            doc = User.new_doc(
                username=admin_username,
                email=admin_email,
                password_hash=pw_hash,
                role="admin",
                company=admin_company,
            )
            db.users.insert_one(doc)
            print(f"[seed] ✓ Admin account created  → {admin_email}")

    except Exception as exc:
        print(f"[seed] WARNING: could not seed admin account: {exc}")


_seed_admin()


# Drowsiness detection engine — loaded in a background thread so Flask
# can serve requests immediately while the models warm up (~30-60 s).
_dw_engine = DrowsinessEngine.__new__(DrowsinessEngine)
_dw_engine._ready    = False
_dw_engine._m1       = None
_dw_engine._m2       = None
_dw_engine._m3       = None
_dw_engine._m4       = None
_dw_engine._m5       = None
_dw_engine._lock      = __import__("threading").Lock()
_dw_engine._sess_lock = __import__("threading").Lock()
_dw_engine._sessions  = {}

def _load_dw_engine():
    _dw_engine._load()

import threading as _threading
_threading.Thread(target=_load_dw_engine, daemon=True, name="dw-model-loader").start()


# -----------------------------
# Emotion model
# -----------------------------

MODEL_PATH = "emotion_model.h5"
LABELS_PATH = "emotion_labels.json"

# Load emotion labels and model with guarded fallbacks so the server
# can start even when heavy TF weights are missing or incompatible.
EMOTION_LABELS = []
emotion_model = None
try:
    with open(LABELS_PATH, "r") as f:
        EMOTION_LABELS = json.load(f)
except Exception as _e:
    print(f"\u26a0  Emotion labels load failed: {_e}")
    # Provide a minimal fallback label set so downstream code can operate.
    EMOTION_LABELS = ["neutral", "happy", "sad", "angry"]

try:
    emotion_model = load_model(MODEL_PATH)
except Exception as _e:
    print(f"\u26a0  Emotion model load failed: {_e}")
    emotion_model = None

# FER library fallback (used when emotion_model.h5 is unavailable)
_fer_detector = None
try:
    from fer.fer import FER as _FER
    _fer_detector = _FER(mtcnn=False)
    print("\u2713 FER emotion detector loaded as fallback")
except Exception as _fer_err:
    print(f"\u26a0  FER not available: {_fer_err}")

# FER label → our label mapping
_FER_LABEL_MAP = {
    "angry": "angry",
    "disgust": "disgusted",
    "fear": "fearful",
    "happy": "happy",
    "neutral": "neutral",
    "sad": "sad",
    "surprise": "surprised",
}


def _safe_emotion_predict(face_input):
    """Return a prediction vector for `face_input` using the h5 model."""
    if emotion_model is None:
        return None
    try:
        return emotion_model.predict(face_input, verbose=0)[0]
    except Exception:
        return None


def _detect_emotion(img_bgr):
    """Full emotion detection pipeline. Returns (preds_array, bbox_dict, error).
    Tries the h5 model first, falls back to FER library.
    """
    # --- Primary: h5 model via Haar-cascade preprocessing ---
    processed, err = preprocess_face_from_bgr(img_bgr)
    if not err:
        face_input, bbox = processed
        preds = _safe_emotion_predict(face_input)
        if preds is not None:
            return preds, bbox, None

    # --- Fallback: FER library ---
    if _fer_detector is not None:
        try:
            results = _fer_detector.detect_emotions(img_bgr)
            if results:
                best = max(results, key=lambda r: r["box"][2] * r["box"][3])
                x, y, w, h = best["box"]
                bbox = {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}
                raw_probs = best["emotions"]
                mapped = {_FER_LABEL_MAP.get(k, k): float(v) for k, v in raw_probs.items()}
                preds = np.array([mapped.get(lbl, 0.0) for lbl in EMOTION_LABELS], dtype=float)
                return preds, bbox, None
        except Exception as _fer_ex:
            pass

    return None, None, err or "No face detected"


# -----------------------------
# YOLO cheating object model
# -----------------------------

YOLO_MODEL_PATH = "yolov8n.pt"
yolo_model = None
if YOLO is None:
    print("\u26a0  ultralytics.YOLO package not available — object detection disabled.")
else:
    try:
        yolo_model = YOLO(YOLO_MODEL_PATH)
    except Exception as _e:
        print(f"\u26a0  YOLO model load failed: {_e} — object detection disabled.")

CHEATING_LABELS = {
    "phone", "cell phone", "mobile phone", "smartphone",
    "headphones", "headphone", "earphones", "earbuds",
    "smartwatch", "watch",
    "hand raise", "extra person",
}


# -----------------------------
# BVI CONFIG — PCA + K-Means data-driven model
# -----------------------------

WINDOW_SIZE = 30

_BVI_MODEL_DIR = Path(__file__).resolve().parent / "user_management" / "BVI_Models"

try:
    _pca_weights     = np.load(_BVI_MODEL_DIR / "pca_weights.npy")      # shape (4,) — [T, E, A, F]
    _pca_score_range = np.load(_BVI_MODEL_DIR / "pca_score_range.npy")  # [min, max]
    _bvi_thresholds  = np.load(_BVI_MODEL_DIR / "bvi_thresholds.npy")   # [t1, t2]
    print(f"✅ BVI PCA+KMeans model loaded — weights={_pca_weights.round(4)}, thresholds={_bvi_thresholds.round(4)}")
except Exception as _bvi_e:
    print(f"⚠  BVI model load failed: {_bvi_e} — falling back to manual weights")
    _pca_weights     = np.array([0.30, 0.25, 0.25, 0.20])
    _pca_score_range = np.array([0.0, 1.0])
    _bvi_thresholds  = np.array([0.35, 0.60])

session_buffers: Dict[str, deque] = defaultdict(lambda: deque(maxlen=WINDOW_SIZE))

# Indices of negative-affect and fatigue emotions in EMOTION_LABELS
# Resolved after EMOTION_LABELS is populated (see feature extraction below)
_NEGATIVE_EMOTIONS = {"angry", "disgusted", "fearful", "fear", "sad", "disgust"}
_FATIGUE_EMOTIONS  = {"sad", "fearful", "fear"}


# -----------------------------
# Face preprocessing
# -----------------------------

def preprocess_face_from_bgr(img_bgr, target_size=(48,48)):

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )

    faces = face_cascade.detectMultiScale(
        gray, scaleFactor=1.3, minNeighbors=5
    )

    if len(faces) == 0:
        return None, "No face detected"

    x, y, w, h = max(faces, key=lambda f: f[2]*f[3])

    margin = int(0.1 * max(w, h))
    x1 = max(0, x - margin)
    y1 = max(0, y - margin)
    x2 = min(gray.shape[1], x + w + margin)
    y2 = min(gray.shape[0], y + h + margin)

    face = gray[y1:y2, x1:x2]
    face = cv2.resize(face, target_size)

    face = face.astype("float32") / 255.0
    face = np.expand_dims(face, axis=-1)
    face = np.expand_dims(face, axis=0)

    bbox = {"x": int(x1), "y": int(y1), "w": int(x2 - x1), "h": int(y2 - y1)}

    return (face, bbox), None


def decode_base64_image(data_url):

    try:

        if "," in data_url:
            _, b64 = data_url.split(",",1)
        else:
            b64 = data_url

        img_bytes = base64.b64decode(b64)
        np_arr = np.frombuffer(img_bytes, np.uint8)

        return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    except:
        return None


# -----------------------------
# YOLO detection
# -----------------------------

def detect_objects_yolo(img_bgr: np.ndarray, conf: float = 0.15, imgsz: int = 640):

    # If YOLO isn't available, return empty detection results.
    if yolo_model is None:
        return {"detections": [], "labels": [], "cheating": False}

    results = yolo_model.predict(img_bgr, imgsz=imgsz, conf=conf)

    detections = []
    labels = []

    if not results:
        return {"detections": [], "labels": [], "cheating": False}

    boxes = results[0].boxes

    if boxes is None:
        return {"detections": [], "labels": [], "cheating": False}

    for box in boxes:

        cls_id = int(box.cls[0])
        label  = yolo_model.names[cls_id]
        score  = float(box.conf[0])
        x1, y1, x2, y2 = map(int, box.xyxy[0])

        if label.lower() in CHEATING_LABELS:
            detections.append({
                "label": label,
                "confidence": score,
                "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
            })
            labels.append(label)

    cheating = len(labels) > 0

    return {
        "detections": detections,
        "labels": labels,
        "cheating": cheating
    }


# -----------------------------
# BVI CALCULATIONS — PCA + K-Means model
# Features: T (transition_rate), E (entropy),
#           A (negative_affect_conf), F (fatigue_proxy_conf)
# -----------------------------

def compute_transition_rate(labels):
    changes = sum(
        1 for i in range(1, len(labels))
        if labels[i] != labels[i-1]
    )
    return changes / max(1, len(labels) - 1)


def compute_entropy(labels):
    counts = Counter(labels)
    total = len(labels)
    entropy = 0.0
    for c in counts.values():
        p = c / total
        entropy -= p * np.log2(p)
    return float(entropy)


def _negative_affect_conf(probs: np.ndarray) -> float:
    """Sum of predicted probabilities for negative-affect emotion classes."""
    total = 0.0
    for i, label in enumerate(EMOTION_LABELS):
        if label.lower() in _NEGATIVE_EMOTIONS and i < len(probs):
            total += float(probs[i])
    return total


def _fatigue_proxy_conf(probs: np.ndarray) -> float:
    """Sum of predicted probabilities for fatigue-proxy emotion classes."""
    total = 0.0
    for i, label in enumerate(EMOTION_LABELS):
        if label.lower() in _FATIGUE_EMOTIONS and i < len(probs):
            total += float(probs[i])
    return total


def compute_bvi_for_session(session_id):
    """Compute BVI using PCA-derived weights and K-Means thresholds."""
    buffer = session_buffers[session_id]

    if len(buffer) < 5:
        return None

    probs_list = [np.array(p) for p in buffer]

    # Feature 1 — Transition Rate (T): how often emotion label changes
    label_ids = [int(np.argmax(p)) for p in probs_list]
    emotions  = [EMOTION_LABELS[i].lower() for i in label_ids]
    T = compute_transition_rate(emotions)

    # Feature 2 — Entropy (E): unpredictability of emotion sequence
    E = compute_entropy(emotions)

    # Feature 3 — Negative Affect (A): avg probability of negative emotions
    A = float(np.mean([_negative_affect_conf(p) for p in probs_list]))

    # Feature 4 — Fatigue Proxy (F): avg probability of fatigue-linked emotions
    F = float(np.mean([_fatigue_proxy_conf(p) for p in probs_list]))

    # Normalize each feature to [0,1] using known max ranges
    # T in [0,1], E in [0, log2(7)≈2.807], A in [0,1], F in [0,1]
    features_scaled = np.array([
        np.clip(T, 0.0, 1.0),
        np.clip(E / 2.807, 0.0, 1.0),
        np.clip(A, 0.0, 1.0),
        np.clip(F, 0.0, 1.0),
    ], dtype=float)

    # Apply PCA-derived weights
    raw_bvi = float(np.dot(features_scaled, _pca_weights))

    # Normalize raw score to [0,1] using the saved training range
    bvi_min, bvi_max = float(_pca_score_range[0]), float(_pca_score_range[1])
    bvi = float(np.clip((raw_bvi - bvi_min) / max(bvi_max - bvi_min, 1e-9), 0.0, 1.0))

    # Assign state using K-Means derived thresholds
    t1, t2 = float(_bvi_thresholds[0]), float(_bvi_thresholds[1])
    if bvi < t1:
        state = "stable"
    elif bvi < t2:
        state = "unstable"
    else:
        state = "erratic"

    return {
        "bvi_score":        round(bvi, 4),
        "state":            state,
        "transition_rate":  round(T, 4),
        "entropy":          round(E, 4),
        "negative_affect":  round(A, 4),
        "fatigue_proxy":    round(F, 4),
        "window_size":      len(buffer),
    }


# =============================================================================
# ROAD SIGN DETECTION  – models, webcam state, helpers, routes
# All served at /upload  /video_feed  /get_detection_info
#                /capture_webcam  /stop_camera
# (Vite proxy strips the /road-sign prefix so the paths arrive here as-is)
# =============================================================================


from sahi import AutoDetectionModel
from sahi.predict import get_sliced_prediction


_RS_W            = Path(__file__).resolve().parent / "Road_sign_detection" / "Weight"
_RS_IMG_SIZE     = 224
_RS_MARGIN       = 0.15
_RS_NORM_THR     = 0.75
_RS_DMG_THR      = 0.40
_RS_SAMPLE_EVERY = 30
_RS_MAX_DET      = 20

_rs_ready      = False
_rs_detector   = None
_rs_vehicle_detector = None
_rs_mobilenet  = None
_rs_custom_mdl = None
_rs_yolo_clf   = None
_rs_sahi_model = None
_rs_dist_model = None
_rs_dist_input_rank = 2
_rs_idx2class: dict = {}
_RS_VEHICLE_LABELS = {"car", "bus", "truck", "motorcycle"}
_rs_last_collision_beep_at = 0.0
_rs_webcam_vehicle_count_hist = deque(maxlen=10)
_rs_video_vehicle_count_hist = deque(maxlen=10)


def _rs_get_collision_risk(distance_m: Optional[float]) -> str:
    """Collision risk based on estimated vehicle distance (meters)."""
    if distance_m is None:
        return "LOW"
    try:
        d = float(distance_m)
    except Exception:
        return "LOW"
    if not np.isfinite(d):
        return "LOW"
    if d < 2:
        return "HIGH"
    elif d <= 15:
        return "MEDIUM"
    else:
        return "LOW"


def _rs_maybe_collision_beep(should_beep: bool, min_gap_sec: float = 1.2):
    """Emit a simple server-side beep (best effort) when high collision risk is present."""
    # intentionally left as a no-op to disable server-side collision beeps
    return
    try:
        print("\a", end="", flush=True)
    except Exception:
        pass


def _rs_get_traffic_congestion(avg_vehicle_count: float) -> str:
    """Classify traffic congestion from smoothed vehicle count."""
    try:
        c = float(avg_vehicle_count)
    except Exception:
        c = 0.0
    if c > 10:
        return "HIGH"
    elif c > 5:
        return "MEDIUM"
    return "LOW"


def _rs_update_traffic_congestion(count_hist: deque, vehicle_count: int):
    """Update rolling vehicle-count window and return (avg_count, congestion_level)."""
    try:
        vc = int(vehicle_count)
    except Exception:
        vc = 0
    count_hist.append(vc)
    avg_count = float(np.mean(count_hist)) if len(count_hist) else 0.0
    return round(avg_count, 2), _rs_get_traffic_congestion(avg_count)


def _rs_build_distance_fallback_model():
    """Fallback architecture for legacy distance model weights (input: 4 bbox values)."""
    return _keras.Sequential([
        _layers.Input(shape=(4,)),
        _layers.Dense(6, activation="relu", name="dense_1"),
        _layers.Dense(5, activation="relu", name="dense_2"),
        _layers.Dense(2, activation="relu", name="dense_3"),
        _layers.Dense(1, activation="linear", name="dense_4"),
    ])


def _rs_init():
    """Load all road-sign models once at startup; no-op if weights are missing."""
    global _rs_ready, _rs_detector, _rs_vehicle_detector, _rs_mobilenet, _rs_custom_mdl, _rs_yolo_clf, _rs_idx2class, _rs_dist_model, _rs_dist_input_rank

    det_pt   = _RS_W / "Detect_Model/Yolo/best.pt"
    mob_h5   = _RS_W / "mobilenet_weights/Mobilenetv2_Retrain_weight/phase2_epoch_015.weights.h5"
    cst_h5   = _RS_W / "Custom_model2_weights/epoch_026.weights.h5"
    clf_pt   = _RS_W / "YOLO8/YOLOv8_Classifier/weights/best.pt"
    map_json = _RS_W / "Custom_model2_weights/class_mapping.json"
    dist_json = _RS_W / "Distance_Estimate_model/model@1535477330.json"
    dist_h5   = _RS_W / "Distance_Estimate_model/model@1535477330.h5"
    vehicle_pt = Path(__file__).resolve().parent / "yolov8n.pt"

    if not all(p.exists() for p in [det_pt, mob_h5, cst_h5, clf_pt, map_json]):
        print("\u26a0  Road-sign weights not found \u2014 /upload and related routes disabled.")
        return

    try:
        _rs_detector = YOLO(str(det_pt))
        if vehicle_pt.exists():
            _rs_vehicle_detector = YOLO(str(vehicle_pt))
            print("✅ Vehicle detector loaded (yolov8n.pt).")
        else:
            _rs_vehicle_detector = None
            print("⚠  Vehicle detector weights not found (yolov8n.pt) — vehicle overlay disabled.")

        # SAHI wrapper for small object detection
        global _rs_sahi_model
        _rs_sahi_model = AutoDetectionModel.from_pretrained(
            model_type="yolov8",
            model_path=str(det_pt),
            confidence_threshold=0.25,
        )

        with open(map_json) as _f:
            _ci = json.load(_f)
        _rs_idx2class = {v: k for k, v in _ci.items()}
        nc = len(_ci)

        # MobileNetV2
        _base = _keras.applications.MobileNetV2(
            input_shape=(_RS_IMG_SIZE, _RS_IMG_SIZE, 3), include_top=False, weights=None
        )
        _x = _layers.GlobalAveragePooling2D()(_base.output)
        _x = _layers.Dense(256, activation="relu")(_x)
        _x = _layers.Dropout(0.5)(_x)
        _rs_mobilenet = _keras.Model(
            inputs=_base.input,
            outputs=_layers.Dense(nc, activation="softmax")(_x)
        )
        _rs_mobilenet.load_weights(str(mob_h5))

        # Custom ResNet-like model (architecture must exactly match training)
        def _cb(x, f, s=1):
            sc = x
            x = _layers.Conv2D(f, (3,3), strides=s, padding="same", use_bias=False)(x)
            x = _layers.BatchNormalization()(x);  x = _layers.ReLU()(x)
            x = _layers.Conv2D(f, (3,3), padding="same", use_bias=False)(x)
            x = _layers.BatchNormalization()(x)
            if s != 1 or sc.shape[-1] != f:
                sc = _layers.Conv2D(f, (1,1), strides=s, padding="same", use_bias=False)(sc)
                sc = _layers.BatchNormalization()(sc)
            return _layers.ReLU()(_layers.Add()([x, sc]))

        def _dw(x, f, s=1):
            sc = x
            x = _layers.DepthwiseConv2D((3,3), strides=s, padding="same", use_bias=False)(x)
            x = _layers.BatchNormalization()(x);  x = _layers.ReLU()(x)
            x = _layers.Conv2D(f, (1,1), padding="same", use_bias=False)(x)
            x = _layers.BatchNormalization()(x)
            if s == 1 and sc.shape[-1] == f:
                x = _layers.Add()([x, sc])
            return _layers.ReLU()(x)

        _inp = _keras.Input(shape=(224, 224, 3))
        _x2  = _layers.Conv2D(32, (3,3), strides=2, padding="same", use_bias=False)(_inp)
        _x2  = _layers.BatchNormalization()(_x2);  _x2 = _layers.ReLU()(_x2)
        _x2  = _cb(_x2, 64);   _x2 = _cb(_x2, 64)
        _x2  = _cb(_x2, 128, 2); _x2 = _cb(_x2, 128)
        _x2  = _dw(_x2, 256, 2); _x2 = _dw(_x2, 256)
        _x2  = _dw(_x2, 512, 2); _x2 = _dw(_x2, 512)
        _x2  = _layers.GlobalAveragePooling2D()(_x2)
        _x2  = _layers.BatchNormalization()(_x2);  _x2 = _layers.Dropout(0.6)(_x2)
        _x2  = _layers.Dense(512, activation="relu")(_x2)
        _x2  = _layers.BatchNormalization()(_x2);  _x2 = _layers.Dropout(0.5)(_x2)
        _rs_custom_mdl = _keras.Model(_inp, _layers.Dense(nc, activation="softmax")(_x2))
        _rs_custom_mdl.load_weights(str(cst_h5))

        _rs_yolo_clf = YOLO(str(clf_pt))

        # Optional distance-estimation model (input: [xmin, ymin, xmax, ymax])
        _rs_dist_model = None
        if dist_json.exists() and dist_h5.exists():
            try:
                with open(dist_json, "r", encoding="utf-8") as _f:
                    _rs_dist_model = _keras.models.model_from_json(
                        _f.read(),
                        custom_objects={
                            "Sequential": _keras.Sequential,
                            "Dense": _layers.Dense,
                        },
                    )
                _rs_dist_model.load_weights(str(dist_h5))
                _rs_dist_input_rank = (
                    len(_rs_dist_model.input_shape)
                    if isinstance(_rs_dist_model.input_shape, tuple)
                    else 2
                )
                print("✅ Road-sign distance model loaded.")
            except Exception as _dist_e:
                # Keras 2.x JSON models may fail to deserialize on newer TF/Keras.
                try:
                    _rs_dist_model = _rs_build_distance_fallback_model()
                    _rs_dist_model.load_weights(str(dist_h5))
                    _rs_dist_input_rank = (
                        len(_rs_dist_model.input_shape)
                        if isinstance(_rs_dist_model.input_shape, tuple)
                        else 2
                    )
                    print("✅ Road-sign distance model loaded (fallback architecture).")
                except Exception as _dist_fallback_e:
                    _rs_dist_model = None
                    _rs_dist_input_rank = 2
                    print(f"⚠  Distance model load failed — distance output disabled: {_dist_e}")
                    print(f"⚠  Distance fallback load failed: {_dist_fallback_e}")
        else:
            _rs_dist_input_rank = 2
            print("⚠  Road-sign distance model not found — distance output disabled.")

        _rs_ready = True
        print("\u2705 Road-sign detection models loaded.")

    except Exception as _e:
        print(f"\u26a0  Road-sign model load error: {_e}")


_rs_init()


# ── Road-sign image helpers ────────────────────────────────────────────────────

def _rs_img_b64(img: np.ndarray) -> str:
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()


def _rs_sharpen(img: np.ndarray) -> np.ndarray:
    g = cv2.GaussianBlur(img, (9, 9), 10)
    return cv2.addWeighted(img, 1.5, g, -0.5, 0)


def _rs_clahe(img: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b_ch = cv2.split(lab)
    cl = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((cl, a, b_ch)), cv2.COLOR_LAB2BGR)


def _rs_log_bbox(xmin: int, ymin: int, xmax: int, ymax: int, source: str = "road_sign"):
    """Print road-sign bounding box coordinates to terminal."""
    print(f"[{source}] xmin: {xmin}")
    print(f"[{source}] ymin: {ymin}")
    print(f"[{source}] xmax: {xmax}")
    print(f"[{source}] ymax: {ymax}")


def _rs_draw_vehicle_detections(frame: np.ndarray, ann: np.ndarray):
    """Draw vehicle-only detections; return per-vehicle risk summary."""
    if _rs_vehicle_detector is None:
        return [], "LOW", None, False
    try:
        veh_res = _rs_vehicle_detector(frame, conf=0.25, verbose=False)
        boxes = veh_res[0].boxes
        names = getattr(_rs_vehicle_detector, "names", {}) or {}
        vehicles = []
        nearest_distance = None
        highest_risk_rank = 0

        def _risk_rank(level: str) -> int:
            return {"LOW": 0, "MEDIUM": 1, "HIGH": 2}.get(level, 0)

        for box in boxes:
            cls_idx = int(box.cls[0])
            label = str(names.get(cls_idx, cls_idx)).lower()
            if label not in _RS_VEHICLE_LABELS:
                continue
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
            conf = float(box.conf[0])
            distance_m = _rs_estimate_vehicle_distance(x1, y1, x2, y2, frame.shape)
            risk_level = _rs_get_collision_risk(distance_m)
            highest_risk_rank = max(highest_risk_rank, _risk_rank(risk_level))
            if distance_m is not None and (nearest_distance is None or distance_m < nearest_distance):
                nearest_distance = distance_m

            color = (0, 165, 255)
            if risk_level == "HIGH":
                color = (0, 0, 255)
            elif risk_level == "MEDIUM":
                color = (0, 140, 255)

            cv2.rectangle(ann, (x1, y1), (x2, y2), color, 2)
            lbl_top = f"{label} {conf * 100:.0f}%"
            dist_text = f"{distance_m:.1f}m" if distance_m is not None else "--m"
            lbl_bottom = f"{dist_text} | {risk_level} RISK"
            tw = max(len(lbl_top), len(lbl_bottom)) * 9
            top_y = max(0, y1 - 44)
            mid_y = max(0, y1 - 22)
            cv2.rectangle(ann, (x1, top_y), (x1 + tw, y1), (0, 0, 0), -1)
            cv2.putText(ann, lbl_top, (x1 + 3, max(14, mid_y - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1)
            cv2.putText(ann, lbl_bottom, (x1 + 3, max(14, y1 - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
            vehicles.append({
                "class_name": label,
                "confidence": conf,
                "estimated_distance_m": distance_m,
                "risk_level": risk_level,
                "bbox": {"xmin": int(x1), "ymin": int(y1), "xmax": int(x2), "ymax": int(y2)},
            })

        risk_summary = "LOW"
        if highest_risk_rank == 2:
            risk_summary = "HIGH"
        elif highest_risk_rank == 1:
            risk_summary = "MEDIUM"

        high_risk = risk_summary == "HIGH"
        _rs_maybe_collision_beep(high_risk)
        return vehicles, risk_summary, nearest_distance, high_risk
    except Exception:
        # Keep stream alive even if vehicle inference fails for a frame.
        return [], "LOW", None, False


def _rs_estimate_distance(
    xmin: int,
    ymin: int,
    xmax: int,
    ymax: int,
    frame_shape: Optional[tuple] = None,
) -> Optional[float]:
    """Estimate distance (meters) from a road-sign bounding box."""
    # Match test_distance.py logic exactly (legacy scaler behavior + input rank handling).
    if _rs_dist_model is None:
        return None

    try:
        input_box = np.array([[xmin, ymin, xmax, ymax]], dtype="float32")

        # StandardScaler fitted on [[0,0,0,0], [1000,1000,1000,1000]]
        # => mean=500, std=500 for each feature
        input_scaled = (input_box - 500.0) / 500.0

        if _rs_dist_input_rank == 3:
            model_input = input_scaled.reshape((1, 1, 4))
        else:
            model_input = input_scaled

        pred_scaled = _rs_dist_model.predict(model_input, verbose=0)
        pred_scaled_2d = np.array(pred_scaled, dtype="float32").reshape(-1, 1)

        # StandardScaler fitted on [[0], [100]] => mean=50, std=50
        distance = (pred_scaled_2d * 50.0) + 50.0
        dist_m = float(distance[0][0])

        if not np.isfinite(dist_m):
            return None
        dist_m = dist_m - 10.0
        return round(dist_m, 2)
    except Exception:
        return None


def _rs_estimate_vehicle_distance(
    xmin: int,
    ymin: int,
    xmax: int,
    ymax: int,
    frame_shape: Optional[tuple] = None,
) -> Optional[float]:
    """Estimate distance (meters) from a vehicle bounding box for collision-risk logic."""
    # Keep road-sign estimator unchanged; vehicle path uses a different offset.
    if _rs_dist_model is None:
        return None

    try:
        input_box = np.array([[xmin, ymin, xmax, ymax]], dtype="float32")

        # StandardScaler fitted on [[0,0,0,0], [1000,1000,1000,1000]]
        # => mean=500, std=500 for each feature
        input_scaled = (input_box - 500.0) / 500.0

        if _rs_dist_input_rank == 3:
            model_input = input_scaled.reshape((1, 1, 4))
        else:
            model_input = input_scaled

        pred_scaled = _rs_dist_model.predict(model_input, verbose=0)
        pred_scaled_2d = np.array(pred_scaled, dtype="float32").reshape(-1, 1)

        # StandardScaler fitted on [[0], [100]] => mean=50, std=50
        distance = (pred_scaled_2d * 50.0) + 50.0
        dist_m = float(distance[0][0])

        if not np.isfinite(dist_m):
            return None
        dist_m = dist_m + 2.0
        return round(dist_m, 2)
    except Exception:
        return None


# ── Road-sign prediction helpers ───────────────────────────────────────────────

def _rs_mob_pred(crop: np.ndarray) -> np.ndarray:
    img = cv2.resize(crop, (_RS_IMG_SIZE, _RS_IMG_SIZE))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype("float32")
    return _rs_mobilenet.predict(np.expand_dims(_mob_preprocess(img), 0), verbose=0)[0]


def _rs_cust_pred(crop: np.ndarray) -> np.ndarray:
    img = cv2.resize(crop, (_RS_IMG_SIZE, _RS_IMG_SIZE))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype("float32") / 255.0
    return _rs_custom_mdl.predict(np.expand_dims(img, 0), verbose=0)[0]


def _rs_yolo_pred(crop: np.ndarray) -> np.ndarray:
    res = _rs_yolo_clf.predict(cv2.resize(crop, (_RS_IMG_SIZE, _RS_IMG_SIZE)), verbose=False)
    return res[0].probs.data.cpu().numpy()


def _rs_ensemble(crop: np.ndarray):
    ens = (_rs_mob_pred(crop) + _rs_cust_pred(crop) + _rs_yolo_pred(crop)) / 3
    idx = int(np.argmax(ens))
    return _rs_idx2class[idx], float(ens[idx])


def rs_process_frame(frame: np.ndarray):
    """Full pipeline: YOLO detect \u2192 crop \u2192 3-model ensemble. Returns result dict or None."""
    if not _rs_ready:
        return None
    orig    = frame.copy()
    # Run normal YOLO on full frame (catches big signs)
    full_result = _rs_detector(frame, conf=0.25, verbose=False)
    full_boxes = full_result[0].boxes

    # Run SAHI on sliced frame (catches small/distant signs)
    sahi_result = get_sliced_prediction(
        frame,
        _rs_sahi_model,
        slice_height=320,
        slice_width=320,
        overlap_height_ratio=0.2,
        overlap_width_ratio=0.2,
    )
    sahi_boxes = sahi_result.object_prediction_list

    # Build combined candidate list
    all_candidates = []

    # Add full-frame YOLO detections
    for box in full_boxes:
        coords = box.xyxy[0].cpu().numpy().astype(int)
        all_candidates.append({
            "x1": coords[0], "y1": coords[1],
            "x2": coords[2], "y2": coords[3],
            "conf": float(box.conf[0])
        })

    # Add SAHI detections
    for box in sahi_boxes:
        all_candidates.append({
            "x1": int(box.bbox.minx), "y1": int(box.bbox.miny),
            "x2": int(box.bbox.maxx), "y2": int(box.bbox.maxy),
            "conf": float(box.score.value)
        })

    if len(all_candidates) == 0:
        return None

    # ── Deduplicate overlapping boxes (IoU > 0.5 = same sign) ──
    def _iou(a, b):
        ix1 = max(a["x1"], b["x1"])
        iy1 = max(a["y1"], b["y1"])
        ix2 = min(a["x2"], b["x2"])
        iy2 = min(a["y2"], b["y2"])
        inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
        if inter == 0:
            return 0.0
        area_a = (a["x2"]-a["x1"]) * (a["y2"]-a["y1"])
        area_b = (b["x2"]-b["x1"]) * (b["y2"]-b["y1"])
        return inter / (area_a + area_b - inter)

    # Sort by confidence descending
    all_candidates.sort(key=lambda b: b["conf"], reverse=True)

    # Keep boxes that dont overlap with already kept boxes
    kept = []
    for cand in all_candidates:
        if all(_iou(cand, k) < 0.5 for k in kept):
            kept.append(cand)

    # ── Process EACH unique detected sign ──
    sign_results = []

    for det in kept:
        x1, y1 = det["x1"], det["y1"]
        x2, y2 = det["x2"], det["y2"]

        w, h   = x2 - x1, y2 - y1
        mx, my = int(w * _RS_MARGIN), int(h * _RS_MARGIN)
        x1, y1 = max(0, x1 - mx), max(0, y1 - my)
        x2, y2 = min(frame.shape[1], x2 + mx), min(frame.shape[0], y2 + my)
        crop   = frame[y1:y2, x1:x2]

        if crop.size == 0:
            continue

        # Multi-version + ensemble on each sign
        versions = [
            ("Original", crop),
            ("Sharpen",  _rs_sharpen(crop)),
            ("CLAHE",    _rs_clahe(crop)),
        ]

        best_conf  = -1.0
        best_class = None
        best_crop  = None

        for ver_name, ver_img in versions:
            cls, conf = _rs_ensemble(ver_img)
            if conf > best_conf:
                best_conf  = conf
                best_class = cls
                best_crop  = ver_img

        sign_results.append({
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
            "class_name": best_class,
            "confidence": best_conf,
            "estimated_distance_m": _rs_estimate_distance(x1, y1, x2, y2, frame.shape),
            "crop":       best_crop,
        })

    if not sign_results:
        return None

    # ── For output use the highest confidence sign as primary ──
    primary = max(sign_results, key=lambda s: s["confidence"])
    class_name = primary["class_name"]
    confidence = primary["confidence"]
    estimated_distance_m = primary.get("estimated_distance_m")
    best_crop  = primary["crop"]
    x1 = primary["x1"]
    y1 = primary["y1"]
    x2 = primary["x2"]
    y2 = primary["y2"]
    # # Multi-version enhancement
    # versions = [
    #     ("Original", crop),
    #     ("Sharpen",  _rs_sharpen(crop)),
    #     ("CLAHE",    _rs_clahe(crop)),
    # ]

    # # Run ensemble on each version, pick best
    # best_version_name = None
    # best_crop         = None
    # best_class        = None
    # best_conf         = -1.0

    # for ver_name, ver_img in versions:
    #     cls, conf = _rs_ensemble(ver_img)
    #     if conf > best_conf:
    #         best_conf         = conf
    #         best_class        = cls
    #         best_crop         = ver_img
    #         best_version_name = ver_name

    # class_name = best_class
    # confidence = best_conf

    # candidates = [(c, *_rs_ensemble(c)) for c in [crop, _rs_sharpen(crop), _rs_clahe(crop)]]
    # best_crop, class_name, confidence = max(candidates, key=lambda v: v[2])

    status = (
        "Normal"           if confidence >= _RS_NORM_THR else
        "Damaged"          if confidence <  _RS_DMG_THR  else
        "Possibly unclear"
    )
    color = (0, 255, 0) if status == "Normal" else (0, 0, 255)

    det = orig.copy()

    # Draw ALL detected signs on the frame
    for sign in sign_results:
        _rs_log_bbox(sign["x1"], sign["y1"], sign["x2"], sign["y2"], source="road_sign/image_or_video")
        s_color = (0, 255, 0) if sign["confidence"] >= _RS_NORM_THR else (0, 0, 255)
        cv2.rectangle(det,
                    (sign["x1"], sign["y1"]),
                    (sign["x2"], sign["y2"]),
                    s_color, 3)
        cv2.putText(det,
                    f"{sign['class_name'].replace('_',' ')} ({sign['confidence']:.2f})",
                    (sign["x1"], max(14, sign["y1"] - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, s_color, 2)





    crop_disp = best_crop.copy()
    cv2.putText(crop_disp, class_name.replace("_", " "),
                (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

    return {
        "detected":       True,
        "original":       _rs_img_b64(orig),
        "detected_image": _rs_img_b64(det),
        "crop":           _rs_img_b64(crop_disp),
        "class_name":     class_name,
        "confidence":     f"{confidence * 100:.1f}%",
        "status":         status,
        "estimated_distance_m": estimated_distance_m,
        "estimated_distance_text": f"{estimated_distance_m:.2f} m" if estimated_distance_m is not None else None,
    }


# ── Road-sign webcam state ─────────────────────────────────────────────────────

_rs_cam_lock    = threading.Lock()
_rs_cap         = None
_rs_cam_running = False
_rs_latest_raw  = None
_rs_latest_ann  = None
_rs_latest_info: dict = {}
_rs_last_saved_at: dict = {}
_rs_last_saved_meta: dict = {}
_rs_mongo_client = None
_rs_mongo_db = None
_rs_webcam_session_active = False
_rs_webcam_session_id: Optional[str] = None
_rs_active_shift_ctx: Dict[str, Optional[str]] = {"driver_id": None, "schedule_id": None}


def _rs_get_db():
    """Road-sign specific MongoDB accessor (independent from user-management indexes)."""
    global _rs_mongo_client, _rs_mongo_db
    if _rs_mongo_db is not None:
        return _rs_mongo_db

    from pymongo import MongoClient

    uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/driveguard")
    _rs_mongo_client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    db_name = uri.rsplit("/", 1)[-1].split("?")[0] or "driveguard"
    _rs_mongo_db = _rs_mongo_client[db_name]

    # Ensure collection and useful indexes exist for analytics queries
    _rs_mongo_db.road_sign.create_index([("class_name", 1), ("timestamp", -1)])
    _rs_mongo_db.road_sign.create_index([("source", 1), ("timestamp", -1)])
    return _rs_mongo_db


def _rs_set_active_shift_ctx(driver_id: Optional[str] = None, schedule_id: Optional[str] = None):
    """Track current road-sign stream shift context for shift_scores road_sign $push updates."""
    global _rs_active_shift_ctx
    _rs_active_shift_ctx = {
        "driver_id": str(driver_id) if driver_id else None,
        "schedule_id": str(schedule_id) if schedule_id else None,
    }


def _rs_append_sign_to_active_shift_score(
    road_sign_obj: dict,
    driver_id: Optional[str] = None,
    schedule_id: Optional[str] = None,
):
    """Append one road-sign object into the current active shift_scores document using $push."""
    try:
        from Emotion_Shift_Profile.database import get_db

        db = get_db()
        sid = str(schedule_id) if schedule_id else (_rs_active_shift_ctx.get("schedule_id") if isinstance(_rs_active_shift_ctx, dict) else None)
        did = str(driver_id) if driver_id else (_rs_active_shift_ctx.get("driver_id") if isinstance(_rs_active_shift_ctx, dict) else None)

        active_filter = {"status": "Active"}
        if sid:
            active_filter["schedule_id"] = sid
        elif did:
            active_filter["driver_id"] = did

        active_doc = db.shift_scores.find_one(active_filter, sort=[("scored_at", -1), ("start_time", -1)])
        if not active_doc:
            return

        db.shift_scores.update_one(
            {"_id": active_doc["_id"]},
            {
                "$push": {"road_sign": road_sign_obj},
                "$set": {"updated_at": datetime.utcnow().isoformat()},
            },
        )
    except Exception as _e:
        app.logger.warning(f"Shift road_sign append failed: {_e}")


def _rs_save_event(
    class_name: str,
    confidence: float,
    status: str,
    estimated_distance_m: Optional[float],
    source: str,
    bbox: Optional[dict] = None,
    vehicle_count: Optional[int] = None,
    avg_vehicle_count: Optional[float] = None,
    traffic_congestion: Optional[str] = None,
    video_session_id: Optional[str] = None,
    webcam_session_id: Optional[str] = None,
    driver_id: Optional[str] = None,
    schedule_id: Optional[str] = None,
):
    """Persist one road-sign detection event to MongoDB (best-effort)."""
    # Save only confident detections (> 45%).
    # Only persist detections where confidence is strictly greater than 45%.
    if confidence is None or float(confidence) <= 0.45:
        return

    try:
        db = _rs_get_db()

        clean_bbox = {}
        if isinstance(bbox, dict):
            for k, v in bbox.items():
                if isinstance(v, np.integer):
                    clean_bbox[k] = int(v)
                elif isinstance(v, np.floating):
                    clean_bbox[k] = float(v)
                else:
                    clean_bbox[k] = v

        doc = {
            "id": uuid.uuid4().hex,
            "class_name": str(class_name),
            "confidence": float(confidence),
            "status": str(status),
            "estimated_distance_m": float(estimated_distance_m) if estimated_distance_m is not None else None,
            "source": str(source),
            "bbox": clean_bbox,
            "vehicle_count": int(vehicle_count) if vehicle_count is not None else 0,
            "avg_vehicle_count": float(avg_vehicle_count) if avg_vehicle_count is not None else 0.0,
            "traffic_congestion": str(traffic_congestion) if traffic_congestion is not None else "LOW",
            "video_session_id": str(video_session_id) if video_session_id else None,
            "timestamp": datetime.utcnow(),
        }
        if webcam_session_id:
            doc["webcam_session_id"] = str(webcam_session_id)

        db.road_sign.insert_one(doc)
        _rs_append_sign_to_active_shift_score(doc, driver_id=driver_id, schedule_id=schedule_id)
    except Exception as _e:
        app.logger.warning(f"Road-sign event save failed: {_e}")


def _rs_save_event_throttled(
    class_name: str,
    confidence: float,
    status: str,
    estimated_distance_m: Optional[float],
    source: str,
    bbox: Optional[dict] = None,
    min_gap_sec: float = 35.0,
    vehicle_count: Optional[int] = None,
    avg_vehicle_count: Optional[float] = None,
    traffic_congestion: Optional[str] = None,
    video_session_id: Optional[str] = None,
    webcam_session_id: Optional[str] = None,
    driver_id: Optional[str] = None,
    schedule_id: Optional[str] = None,
):
    # Keep DB only for confident signs (> 45%).
    if confidence is None or float(confidence) <= 0.45:
        return

    key = str(class_name)
    now = time.time()
    last = _rs_last_saved_at.get(key, 0.0)
    if (now - last) < min_gap_sec:
        return
    _rs_last_saved_at[key] = now
    _rs_save_event(
        class_name,
        confidence,
        status,
        estimated_distance_m,
        source,
        bbox,
        vehicle_count=vehicle_count,
        avg_vehicle_count=avg_vehicle_count,
        traffic_congestion=traffic_congestion,
        video_session_id=video_session_id,
        webcam_session_id=webcam_session_id,
        driver_id=driver_id,
        schedule_id=schedule_id,
    )


def _rs_cam_worker():
    global _rs_latest_raw, _rs_latest_ann, _rs_latest_info, _rs_cam_running
    global _rs_webcam_session_active, _rs_webcam_session_id
    while _rs_cam_running:
        with _rs_cam_lock:
            if _rs_cap is None:
                break
            ret, frame = _rs_cap.read()
        if not ret:
            time.sleep(0.02)
            continue
        _rs_latest_raw = frame.copy()
        ann = frame.copy()
        vehicle_items = []
        vehicle_risk = "LOW"
        nearest_vehicle_distance_m = None
        collision_high_risk = False
        vehicle_count = 0
        avg_vehicle_count = 0.0
        traffic_congestion = "LOW"
        if _rs_ready:
            vehicle_items, vehicle_risk, nearest_vehicle_distance_m, collision_high_risk = _rs_draw_vehicle_detections(frame, ann)
            vehicle_count = len(vehicle_items)
            avg_vehicle_count, traffic_congestion = _rs_update_traffic_congestion(
                _rs_webcam_vehicle_count_hist, vehicle_count
            )
            congestion_color = (34, 197, 94) if traffic_congestion == "LOW" else ((0, 165, 255) if traffic_congestion == "MEDIUM" else (0, 0, 255))
            cv2.putText(
                ann,
                f"Traffic: {traffic_congestion} ({vehicle_count} veh, avg {avg_vehicle_count:.1f})",
                (12, 28),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                congestion_color,
                2,
            )
        if _rs_ready and _rs_webcam_session_active:
            res_det = _rs_detector(frame, conf=0.25, verbose=False)
            boxes   = res_det[0].boxes
            if len(boxes) > 0:
                best = max(boxes, key=lambda b: float(b.conf[0]))
                x1, y1, x2, y2 = best.xyxy[0].cpu().numpy().astype(int)
                crop = frame[y1:y2, x1:x2]
                try:
                    r     = _rs_yolo_clf.predict(
                                cv2.resize(crop, (_RS_IMG_SIZE, _RS_IMG_SIZE)), verbose=False)
                    probs = r[0].probs.data.cpu().numpy()
                    cls   = _rs_idx2class[int(np.argmax(probs))]
                    conf  = float(np.max(probs))
                except Exception:
                    cls, conf = "Road Sign", float(best.conf[0])
                status = (
                    "Normal"           if conf >= _RS_NORM_THR else
                    "Damaged"          if conf <  _RS_DMG_THR  else
                    "Possibly unclear"
                )
                _rs_log_bbox(x1, y1, x2, y2, source="road_sign/webcam_live")
                estimated_distance_m = _rs_estimate_distance(x1, y1, x2, y2, frame.shape)
                color = (0, 255, 0) if status == "Normal" else (0, 0, 255)
                cv2.rectangle(ann, (x1, y1), (x2, y2), color, 2)
                lbl = f"{cls.replace('_', ' ')} {conf * 100:.0f}%"
                tw  = len(lbl) * 9
                cv2.rectangle(ann, (x1, max(0, y1 - 24)), (x1 + tw, y1), (0, 0, 0), -1)
                cv2.putText(ann, lbl, (x1 + 3, max(14, y1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
                _rs_latest_info = {
                    "class_name": cls,
                    "confidence": conf,
                    "status": status,
                    "estimated_distance_m": estimated_distance_m,
                    "estimated_distance_text": f"{estimated_distance_m:.2f} m" if estimated_distance_m is not None else None,
                    "vehicle_detections": vehicle_items,
                    "vehicle_count": vehicle_count,
                    "avg_vehicle_count": avg_vehicle_count,
                    "traffic_congestion": traffic_congestion,
                    "vehicle_collision_risk": vehicle_risk,
                    "nearest_vehicle_distance_m": nearest_vehicle_distance_m,
                    "collision_high_risk": collision_high_risk,
                }
                if _rs_webcam_session_active and _rs_webcam_session_id:
                    _rs_save_event_throttled(
                        class_name=cls,
                        confidence=conf,
                        status=status,
                        estimated_distance_m=estimated_distance_m,
                        source="webcam_live",
                        bbox={"xmin": x1, "ymin": y1, "xmax": x2, "ymax": y2},
                        min_gap_sec=35.0,
                        vehicle_count=vehicle_count,
                        avg_vehicle_count=avg_vehicle_count,
                        traffic_congestion=traffic_congestion,
                        webcam_session_id=_rs_webcam_session_id,
                        driver_id=_rs_active_shift_ctx.get("driver_id") if isinstance(_rs_active_shift_ctx, dict) else None,
                        schedule_id=_rs_active_shift_ctx.get("schedule_id") if isinstance(_rs_active_shift_ctx, dict) else None,
                    )
            else:
                _rs_latest_info = {
                    "vehicle_detections": vehicle_items,
                    "vehicle_count": vehicle_count,
                    "avg_vehicle_count": avg_vehicle_count,
                    "traffic_congestion": traffic_congestion,
                    "vehicle_collision_risk": vehicle_risk,
                    "nearest_vehicle_distance_m": nearest_vehicle_distance_m,
                    "collision_high_risk": collision_high_risk,
                }
        else:
            _rs_latest_info = {
                "vehicle_detections": vehicle_items,
                "vehicle_count": vehicle_count,
                "avg_vehicle_count": avg_vehicle_count,
                "traffic_congestion": traffic_congestion,
                "vehicle_collision_risk": vehicle_risk,
                "nearest_vehicle_distance_m": nearest_vehicle_distance_m,
                "collision_high_risk": collision_high_risk,
            }
        _rs_latest_ann = ann
        time.sleep(0.01)


def _rs_start_camera() -> bool:
    global _rs_cap, _rs_cam_running
    if not _rs_ready:
        return False
    if _rs_cam_running:
        return True
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        return False
    with _rs_cam_lock:
        _rs_cap = cap
    _rs_webcam_vehicle_count_hist.clear()
    _rs_cam_running = True
    threading.Thread(target=_rs_cam_worker, daemon=True).start()
    return True


def _rs_stop_camera():
    global _rs_cap, _rs_cam_running, _rs_latest_ann, _rs_latest_raw, _rs_latest_info
    _rs_cam_running = False
    time.sleep(0.15)
    with _rs_cam_lock:
        if _rs_cap:
            _rs_cap.release()
            _rs_cap = None
    # Clear stale frame data so the next session doesn't serve old frames
    _rs_latest_ann  = None
    _rs_latest_raw  = None
    _rs_latest_info = {}
    _rs_webcam_vehicle_count_hist.clear()


def _rs_gen_mjpeg():
    while _rs_cam_running:
        frame = _rs_latest_ann
        if frame is None:
            time.sleep(0.03)
            continue
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 78])
        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
               + buf.tobytes() + b"\r\n")
        time.sleep(0.033)


# ── Road-sign routes ───────────────────────────────────────────────────────────

@app.route("/upload", methods=["POST"])
def rs_upload():
    file       = request.files.get("file")
    input_type = request.form.get("input_type", "image")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    if input_type == "image":
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            file.save(tmp.name)
            path = tmp.name
        img = cv2.imread(path)
        try:
            os.unlink(path)
        except OSError:
            pass
        if img is None:
            return jsonify({"error": "Could not read image"}), 400
        result = rs_process_frame(img)
        if not result:
            return jsonify({"detected": False, "message": "No road sign detected."})
        _rs_save_event(
            class_name=result["class_name"],
            confidence=float(str(result["confidence"]).replace("%", "")) / 100.0,
            status=result["status"],
            estimated_distance_m=result.get("estimated_distance_m"),
            source="image_upload",
        )
        result["input_type"] = "image"
        return jsonify(result)

    if input_type == "video":
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            file.save(tmp.name)
            path = tmp.name
        results_list = []
        cap = cv2.VideoCapture(path)
        fi  = 0
        try:
            while cap.isOpened() and len(results_list) < _RS_MAX_DET:
                ret, frame = cap.read()
                if not ret:
                    break
                if fi % _RS_SAMPLE_EVERY == 0:
                    r = rs_process_frame(frame)
                    if r:
                        _rs_save_event(
                            class_name=r["class_name"],
                            confidence=float(str(r["confidence"]).replace("%", "")) / 100.0,
                            status=r["status"],
                            estimated_distance_m=r.get("estimated_distance_m"),
                            source="video_upload",
                        )
                        r["frame"] = fi
                        results_list.append(r)
                fi += 1
        finally:
            cap.release()
            try:
                os.unlink(path)
            except OSError:
                pass
        if not results_list:
            return jsonify({"detected": False, "message": "No road signs found in video."})
        primary = results_list[0]
        primary["input_type"] = "video"
        primary["results"] = results_list
        return jsonify(primary)

    return jsonify({"error": "Unknown input_type"}), 400


@app.route("/video_feed")
def rs_video_feed():
    if not _rs_ready:
        return jsonify({"error": "Road-sign models not loaded"}), 503
    if not _rs_start_camera():
        return "Cannot open camera", 500
    resp = Response(_rs_gen_mjpeg(), mimetype="multipart/x-mixed-replace; boundary=frame")
    resp.headers["Cache-Control"]     = "no-cache, no-store, must-revalidate"
    resp.headers["X-Accel-Buffering"] = "no"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/get_detection_info")
def rs_get_detection_info():
    return jsonify(_rs_latest_info)


@app.route("/start_webcam_session", methods=["POST"])
def rs_start_webcam_session():
    global _rs_webcam_session_active, _rs_webcam_session_id
    body = request.get_json(silent=True) or {}
    driver_id = body.get("driver_id") or request.args.get("driver_id")
    schedule_id = body.get("schedule_id") or request.args.get("schedule_id")
    _rs_set_active_shift_ctx(driver_id=driver_id, schedule_id=schedule_id)
    _rs_webcam_session_id = uuid.uuid4().hex
    _rs_webcam_session_active = True
    return jsonify({
        "started": True,
        "webcam_session_id": _rs_webcam_session_id,
        "driver_id": _rs_active_shift_ctx.get("driver_id"),
        "schedule_id": _rs_active_shift_ctx.get("schedule_id"),
    })


@app.route("/stop_webcam_session", methods=["POST"])
def rs_stop_webcam_session():
    global _rs_webcam_session_active, _rs_webcam_session_id
    _rs_webcam_session_active = False
    _rs_webcam_session_id = None
    _rs_set_active_shift_ctx(None, None)
    return jsonify({"stopped": True})

###

@app.route("/capture_webcam", methods=["POST"])
def rs_capture_webcam():
    frame = _rs_latest_raw
    if frame is None:
        return jsonify({"error": "Camera not active \u2014 no frame available"}), 400
    result = rs_process_frame(frame)
    if not result:
        return jsonify({"detected": False, "message": "No road sign in current frame."})
    _rs_save_event(
        class_name=result["class_name"],
        confidence=float(str(result["confidence"]).replace("%", "")) / 100.0,
        status=result["status"],
        estimated_distance_m=result.get("estimated_distance_m"),
        source="webcam_capture",
        driver_id=_rs_active_shift_ctx.get("driver_id") if isinstance(_rs_active_shift_ctx, dict) else None,
        schedule_id=_rs_active_shift_ctx.get("schedule_id") if isinstance(_rs_active_shift_ctx, dict) else None,
    )
    result["input_type"] = "webcam"
    return jsonify(result)


@app.route("/stop_camera")
def rs_stop_camera_route():
    global _rs_webcam_session_active, _rs_webcam_session_id
    _rs_stop_camera()
    _rs_webcam_session_active = False
    _rs_webcam_session_id = None
    _rs_set_active_shift_ctx(None, None)
    return jsonify({"stopped": True})


@app.route("/road_sign_analytics", methods=["GET"])
def rs_analytics():
    """Road-sign analytics: frequency per sign with latest timestamp."""
    try:
        db = _rs_get_db()

        source = request.args.get("source", type=str)
        video_session_id = request.args.get("video_session_id", type=str)
        webcam_session_id = request.args.get("webcam_session_id", type=str)

        match_stage = {}
        if source:
            match_stage["source"] = source
        if video_session_id:
            match_stage["video_session_id"] = video_session_id
        if webcam_session_id:
            match_stage["webcam_session_id"] = webcam_session_id

        pipeline = [
            *([{"$match": match_stage}] if match_stage else []),
            {
                "$group": {
                    "_id": "$class_name",
                    "frequency": {"$sum": 1},
                    "last_seen": {"$max": "$timestamp"},
                }
            },
            {"$sort": {"frequency": -1}},
            {"$limit": 50},
        ]

        rows = list(db.road_sign.aggregate(pipeline))
        items = []
        for r in rows:
            ts = r.get("last_seen")
            ts_str = None
            if isinstance(ts, datetime):
                ts_str = ts.replace(tzinfo=timezone.utc).isoformat() if ts.tzinfo is None else ts.astimezone(timezone.utc).isoformat()
            items.append({
                "sign_name": r.get("_id") or "Unknown",
                "frequency": int(r.get("frequency", 0)),
                "last_seen": ts_str,
            })

        return jsonify({"items": items, "total_sign_types": len(items)})
    except Exception as _e:
        return jsonify({"error": str(_e), "items": [], "total_sign_types": 0}), 500


# ── Road-sign video-file streaming ───────────────────────────────────────────
_rs_video_lock        = threading.Lock()
_rs_video_cap         = None
_rs_video_path        = None
_rs_video_running     = False
_rs_video_latest_ann  = None
_rs_video_latest_info: dict = {}
_rs_video_session_id: Optional[str] = None


def _rs_video_worker():
    global _rs_video_running, _rs_video_latest_ann, _rs_video_latest_info
    global _rs_video_cap, _rs_video_session_id
    if _rs_video_cap is None:
        _rs_video_running = False
        return
    fps = _rs_video_cap.get(cv2.CAP_PROP_FPS) or 30.0
    delay = max(0.01, 1.0 / fps)
    while _rs_video_running:
        with _rs_video_lock:
            cap = _rs_video_cap
        if cap is None:
            break
        ret, frame = cap.read()
        if not ret:
            # End-of-video: stop the stream instead of looping.
            _rs_video_running = False
            break
        ann = frame.copy()
        vehicle_items = []
        vehicle_risk = "LOW"
        nearest_vehicle_distance_m = None
        collision_high_risk = False
        vehicle_count = 0
        avg_vehicle_count = 0.0
        traffic_congestion = "LOW"
        if _rs_ready:
            vehicle_items, vehicle_risk, nearest_vehicle_distance_m, collision_high_risk = _rs_draw_vehicle_detections(frame, ann)
            vehicle_count = len(vehicle_items)
            avg_vehicle_count, traffic_congestion = _rs_update_traffic_congestion(
                _rs_video_vehicle_count_hist, vehicle_count
            )
            congestion_color = (34, 197, 94) if traffic_congestion == "LOW" else ((0, 165, 255) if traffic_congestion == "MEDIUM" else (0, 0, 255))
            cv2.putText(
                ann,
                f"Traffic: {traffic_congestion} ({vehicle_count} veh, avg {avg_vehicle_count:.1f})",
                (12, 28),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                congestion_color,
                2,
            )
        if _rs_ready:
            res_det = _rs_detector(frame, conf=0.25, verbose=False)
            boxes = res_det[0].boxes
            info_list = []
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                w, h = x2 - x1, y2 - y1
                mx, my = int(w * _RS_MARGIN), int(h * _RS_MARGIN)
                x1m, y1m = max(0, x1 - mx), max(0, y1 - my)
                x2m, y2m = min(frame.shape[1], x2 + mx), min(frame.shape[0], y2 + my)
                crop = frame[y1m:y2m, x1m:x2m]
                if crop.size == 0:
                    continue
                try:
                    cls, conf = _rs_ensemble(crop)
                except Exception:
                    cls, conf = "Road Sign", float(box.conf[0])
                status = (
                    "Normal"           if conf >= _RS_NORM_THR else
                    "Damaged"          if conf <  _RS_DMG_THR  else
                    "Possibly unclear"
                )
                _rs_log_bbox(x1m, y1m, x2m, y2m, source="road_sign/video_stream")
                estimated_distance_m = _rs_estimate_distance(x1m, y1m, x2m, y2m, frame.shape)
                color = (0, 255, 0) if status == "Normal" else (0, 0, 255)
                cv2.rectangle(ann, (x1m, y1m), (x2m, y2m), color, 2)
                lbl = f"{cls.replace('_', ' ')} {conf * 100:.0f}%"
                tw  = len(lbl) * 9
                cv2.rectangle(ann, (x1m, max(0, y1m - 24)), (x1m + tw, y1m), (0, 0, 0), -1)
                cv2.putText(ann, lbl, (x1m + 3, max(14, y1m - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
                info_list.append({
                    "class_name": cls,
                    "confidence": conf,
                    "status": status,
                    "estimated_distance_m": estimated_distance_m,
                    "estimated_distance_text": f"{estimated_distance_m:.2f} m" if estimated_distance_m is not None else None,
                })
                _rs_save_event_throttled(
                    class_name=cls,
                    confidence=conf,
                    status=status,
                    estimated_distance_m=estimated_distance_m,
                    source="video_stream",
                    bbox={"xmin": x1m, "ymin": y1m, "xmax": x2m, "ymax": y2m},
                    min_gap_sec=35.0,
                    vehicle_count=vehicle_count,
                    avg_vehicle_count=avg_vehicle_count,
                    traffic_congestion=traffic_congestion,
                    video_session_id=_rs_video_session_id,
                    driver_id=_rs_active_shift_ctx.get("driver_id") if isinstance(_rs_active_shift_ctx, dict) else None,
                    schedule_id=_rs_active_shift_ctx.get("schedule_id") if isinstance(_rs_active_shift_ctx, dict) else None,
                )

            if info_list:
                best_walk = max(info_list, key=lambda i: i["confidence"])
                _rs_video_latest_info = {
                    "class_name": best_walk["class_name"],
                    "confidence": best_walk["confidence"],
                    "status":     best_walk["status"],
                    "estimated_distance_m": best_walk.get("estimated_distance_m"),
                    "estimated_distance_text": best_walk.get("estimated_distance_text"),
                    "detections": info_list,
                    "vehicle_detections": vehicle_items,
                    "vehicle_count": vehicle_count,
                    "avg_vehicle_count": avg_vehicle_count,
                    "traffic_congestion": traffic_congestion,
                    "vehicle_collision_risk": vehicle_risk,
                    "nearest_vehicle_distance_m": nearest_vehicle_distance_m,
                    "collision_high_risk": collision_high_risk,
                }
            else:
                _rs_video_latest_info = {
                    "vehicle_detections": vehicle_items,
                    "vehicle_count": vehicle_count,
                    "avg_vehicle_count": avg_vehicle_count,
                    "traffic_congestion": traffic_congestion,
                    "vehicle_collision_risk": vehicle_risk,
                    "nearest_vehicle_distance_m": nearest_vehicle_distance_m,
                    "collision_high_risk": collision_high_risk,
                }
        _rs_video_latest_ann = ann
        time.sleep(delay)
    with _rs_video_lock:
        if _rs_video_cap:
            _rs_video_cap.release()
            _rs_video_cap = None
    _rs_video_latest_ann = None


def _rs_video_gen_mjpeg():
    while _rs_video_running:
        frame = _rs_video_latest_ann
        if frame is None:
            time.sleep(0.03)
            continue
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 78])
        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
               + buf.tobytes() + b"\r\n")
        time.sleep(0.033)


@app.route("/upload_video_stream", methods=["POST"])
def rs_upload_video_stream():
    global _rs_video_running, _rs_video_cap, _rs_video_path, _rs_video_session_id
    if not _rs_ready:
        return jsonify({"error": "Road-sign models not loaded"}), 503
    file = request.files.get("file")
    driver_id = request.form.get("driver_id") or request.args.get("driver_id")
    schedule_id = request.form.get("schedule_id") or request.args.get("schedule_id")
    _rs_set_active_shift_ctx(driver_id=driver_id, schedule_id=schedule_id)
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    # Stop any existing stream
    if _rs_video_running:
        _rs_video_running = False
        time.sleep(0.15)
    with _rs_video_lock:
        if _rs_video_cap:
            _rs_video_cap.release()
            _rs_video_cap = None
    if _rs_video_path and os.path.exists(_rs_video_path):
        try:
            os.unlink(_rs_video_path)
        except OSError:
            pass

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
        file.save(tmp.name)
        _rs_video_path = tmp.name

    cap = cv2.VideoCapture(_rs_video_path)
    if not cap.isOpened():
        try:
            os.unlink(_rs_video_path)
        except OSError:
            pass
        _rs_video_path = None
        return jsonify({"error": "Could not open video"}), 400

    with _rs_video_lock:
        _rs_video_cap = cap
    _rs_video_vehicle_count_hist.clear()
    _rs_video_session_id = uuid.uuid4().hex
    _rs_video_running = True
    threading.Thread(target=_rs_video_worker, daemon=True).start()
    time.sleep(0.3)
    return jsonify({
        "started": True,
        "video_session_id": _rs_video_session_id,
        "driver_id": _rs_active_shift_ctx.get("driver_id"),
        "schedule_id": _rs_active_shift_ctx.get("schedule_id"),
    })


@app.route("/video_stream_feed")
def rs_video_stream_feed():
    if not _rs_ready:
        return jsonify({"error": "Road-sign models not loaded"}), 503
    if not _rs_video_running:
        return jsonify({"error": "Video stream not active"}), 400
    resp = Response(_rs_video_gen_mjpeg(), mimetype="multipart/x-mixed-replace; boundary=frame")
    resp.headers["Cache-Control"]     = "no-cache, no-store, must-revalidate"
    resp.headers["X-Accel-Buffering"] = "no"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/get_video_detection_info")
def rs_get_video_detection_info():
    return jsonify(_rs_video_latest_info)


@app.route("/stop_video_stream")
def rs_stop_video_stream():
    global _rs_video_running, _rs_video_latest_ann, _rs_video_latest_info
    global _rs_video_cap, _rs_video_path, _rs_video_session_id
    _rs_video_running = False
    time.sleep(0.15)
    with _rs_video_lock:
        if _rs_video_cap:
            _rs_video_cap.release()
            _rs_video_cap = None
    if _rs_video_path and os.path.exists(_rs_video_path):
        try:
            os.unlink(_rs_video_path)
        except OSError:
            pass
    _rs_video_path = None
    _rs_video_session_id = None
    _rs_video_latest_ann = None
    _rs_video_latest_info = {}
    _rs_video_vehicle_count_hist.clear()
    _rs_set_active_shift_ctx(None, None)
    return jsonify({"stopped": True})


# ── Demo-video road-sign feed ─────────────────────────────────────────────────
_DEMO_VIDEO_PATH = Path(__file__).resolve().parent / "Video" / "Demo.mp4"
_rs_demo_running = False
_rs_demo_latest_ann  = None
_rs_demo_latest_info: dict = {}


def _rs_demo_worker():
    global _rs_demo_running, _rs_demo_latest_ann, _rs_demo_latest_info
    cap = cv2.VideoCapture(str(_DEMO_VIDEO_PATH))
    if not cap.isOpened():
        _rs_demo_running = False
        return
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    delay = max(0.01, 1.0 / fps)
    while _rs_demo_running:
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # loop
            continue
        ann = frame.copy()
        if _rs_ready:
            res_det = _rs_detector(frame, conf=0.25, verbose=False)
            boxes = res_det[0].boxes
            if len(boxes) > 0:
                best = max(boxes, key=lambda b: float(b.conf[0]))
                x1, y1, x2, y2 = best.xyxy[0].cpu().numpy().astype(int)
                crop = frame[y1:y2, x1:x2]
                try:
                    r = _rs_yolo_clf.predict(
                        cv2.resize(crop, (_RS_IMG_SIZE, _RS_IMG_SIZE)), verbose=False)
                    probs = r[0].probs.data.cpu().numpy()
                    cls   = _rs_idx2class[int(np.argmax(probs))]
                    conf  = float(np.max(probs))
                except Exception:
                    cls, conf = "Road Sign", float(best.conf[0])
                status = (
                    "Normal"           if conf >= _RS_NORM_THR else
                    "Damaged"          if conf <  _RS_DMG_THR  else
                    "Possibly unclear"
                )
                _rs_log_bbox(x1, y1, x2, y2, source="road_sign/demo_video")
                estimated_distance_m = _rs_estimate_distance(x1, y1, x2, y2, frame.shape)
                color = (0, 255, 0) if status == "Normal" else (0, 0, 255)
                cv2.rectangle(ann, (x1, y1), (x2, y2), color, 2)
                lbl = f"{cls.replace('_', ' ')} {conf * 100:.0f}%"
                tw  = len(lbl) * 9
                cv2.rectangle(ann, (x1, max(0, y1 - 24)), (x1 + tw, y1), (0, 0, 0), -1)
                cv2.putText(ann, lbl, (x1 + 3, max(14, y1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
                _rs_demo_latest_info = {
                    "class_name": cls,
                    "confidence": conf,
                    "status": status,
                    "estimated_distance_m": estimated_distance_m,
                    "estimated_distance_text": f"{estimated_distance_m:.2f} m" if estimated_distance_m is not None else None,
                }
                _rs_save_event_throttled(
                    class_name=cls,
                    confidence=conf,
                    status=status,
                    estimated_distance_m=estimated_distance_m,
                    source="demo_video_stream",
                    bbox={"xmin": x1, "ymin": y1, "xmax": x2, "ymax": y2},
                    min_gap_sec=35.0,
                    driver_id=_rs_active_shift_ctx.get("driver_id") if isinstance(_rs_active_shift_ctx, dict) else None,
                    schedule_id=_rs_active_shift_ctx.get("schedule_id") if isinstance(_rs_active_shift_ctx, dict) else None,
                )
            else:
                _rs_demo_latest_info = {}
        _rs_demo_latest_ann = ann
        time.sleep(delay)
    cap.release()


def _rs_demo_gen_mjpeg():
    while _rs_demo_running:
        frame = _rs_demo_latest_ann
        if frame is None:
            time.sleep(0.03)
            continue
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 78])
        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
               + buf.tobytes() + b"\r\n")
        time.sleep(0.033)


@app.route("/video_feed_demo")
def rs_video_feed_demo():
    global _rs_demo_running
    driver_id = request.args.get("driver_id", type=str)
    schedule_id = request.args.get("schedule_id", type=str)
    _rs_set_active_shift_ctx(driver_id=driver_id, schedule_id=schedule_id)
    if not _rs_ready:
        return jsonify({"error": "Road-sign models not loaded"}), 503
    if not _DEMO_VIDEO_PATH.exists():
        return jsonify({"error": "Demo video not found"}), 404
    if not _rs_demo_running:
        _rs_demo_running = True
        threading.Thread(target=_rs_demo_worker, daemon=True).start()
        time.sleep(0.3)  # let first frames populate
    resp = Response(_rs_demo_gen_mjpeg(), mimetype="multipart/x-mixed-replace; boundary=frame")
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["X-Accel-Buffering"] = "no"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/get_demo_detection_info")
def rs_get_demo_detection_info():
    return jsonify(_rs_demo_latest_info)


@app.route("/stop_demo_video")
def rs_stop_demo_video():
    global _rs_demo_running, _rs_demo_latest_ann, _rs_demo_latest_info
    _rs_demo_running = False
    time.sleep(0.15)
    _rs_demo_latest_ann = None
    _rs_demo_latest_info = {}
    _rs_set_active_shift_ctx(None, None)
    return jsonify({"stopped": True})


# ── Demo-video road-scene analysis ────────────────────────────────────────────
@app.route("/rsa/analyse-demo", methods=["POST"])
def rsa_analyse_demo():
    if not _rsa_ready:
        return jsonify({"error": "RSA model not loaded."}), 503
    if not _DEMO_VIDEO_PATH.exists():
        return jsonify({"error": "Demo video not found"}), 404

    _RSA_SAMPLE_EVERY = 30
    _RSA_MAX_FRAMES   = 25

    results = []
    cap = cv2.VideoCapture(str(_DEMO_VIDEO_PATH))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_idx = 0
    try:
        while cap.isOpened() and len(results) < _RSA_MAX_FRAMES:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % _RSA_SAMPLE_EVERY == 0:
                try:
                    r = _rsa_run(frame)
                    r["frame"] = frame_idx
                    r["timestamp"] = round(frame_idx / fps, 2)
                    results.append(r)
                except Exception:
                    pass
            frame_idx += 1
    finally:
        cap.release()
    if not results:
        return jsonify({"error": "No frames could be processed from demo video."}), 400
    return jsonify({"frames": results, "total": len(results)})


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "message": "DriveGuard API running — POST image to /predict, socket frames to /socket.io"
    })


# -----------------------------
# API ROUTE
# -----------------------------

def _save_frame_to_session(session_id, driver_id, frame_record):
    """Fire-and-forget: persist one frame result into driving_sessions."""
    try:
        from Emotion_Shift_Profile.database import get_db
        from bson import ObjectId
        db = get_db()
        db.driving_sessions.update_one(
            {"_id": ObjectId(session_id), "driver_id": driver_id, "status": "active"},
            {
                "$push": {"frames": frame_record},
                "$inc":  {"summary.total_frames": 1},
            }
        )
        if frame_record.get("bvi_state") == "erratic":
            db.driving_sessions.update_one(
                {"_id": ObjectId(session_id), "driver_id": driver_id},
                {"$push": {"summary.safety_alerts": {
                    "type": "erratic_bvi",
                    "time": frame_record["timestamp"],
                    "bvi":  frame_record.get("bvi_score"),
                }}}
            )
    except Exception as e:
        app.logger.warning(f"Frame save failed: {e}")


@app.route("/predict", methods=["POST"])
def predict():

    driver_id  = request.form.get("driver_id", "default")
    # session_id is the MongoDB ObjectId of the active driving session
    session_id = request.form.get("session_id", "")

    file = request.files.get("image")

    if not file:
        return jsonify({"error":"No image uploaded"}),400

    with tempfile.NamedTemporaryFile(delete=False,suffix=".jpg") as tmp:

        path = tmp.name
        file.save(path)

    try:

        img = cv2.imread(path)

        objects = detect_objects_yolo(img)

        preds, bbox, err = _detect_emotion(img)

        if err or preds is None:
            return jsonify({
                "error": err or "No face detected",
                "objects": objects
            })

        idx = int(np.argmax(preds))
        label = EMOTION_LABELS[idx]
        confidence = float(preds[idx])

        probs_dict = {
            lbl:float(p) for lbl,p in zip(EMOTION_LABELS,preds)
        }

        session_buffers[driver_id].append(preds)

        bvi = compute_bvi_for_session(driver_id)

        response = {
            "emotion":label,
            "confidence":confidence,
            "probabilities":probs_dict,
            "driver_id":driver_id,
            "bbox":bbox,
            "objects":objects
        }

        if bvi:
            response["bvi"] = bvi

        # Persist to MongoDB if a valid session is active
        if session_id and len(session_id) == 24:
            import threading
            from datetime import datetime as _dt
            frame_record = {
                "timestamp":       _dt.utcnow().isoformat(),
                "emotion":         label,
                "confidence":      confidence,
                "probabilities":   probs_dict,
                "bvi_score":       bvi["bvi_score"]       if bvi else None,
                "bvi_state":       bvi["state"]           if bvi else None,
                "transition_rate": bvi["transition_rate"] if bvi else None,
                "entropy":         bvi["entropy"]         if bvi else None,
                "objects_detected": objects.get("labels", []),
            }
            threading.Thread(
                target=_save_frame_to_session,
                args=(session_id, driver_id, frame_record),
                daemon=True
            ).start()

        return jsonify(response)

    finally:

        if os.path.exists(path):
            os.remove(path)


# -----------------------------
# VIDEO FILE ANALYSIS
# -----------------------------

@app.route("/analyze-video-frames", methods=["POST"])
def analyze_video_frames():
    """
    Accepts a video file upload, samples frames every SAMPLE_EVERY frames,
    runs emotion + YOLO + BVI on each, and returns a JSON array of results
    with base64-encoded JPEG images (with bounding-box annotations).
    """
    file = request.files.get("video")
    if not file:
        return jsonify({"error": "No video uploaded"}), 400

    SAMPLE_EVERY = 15          # analyse 1 in every 15 frames (~2 fps for 30-fps input)
    MAX_FRAMES   = 60          # cap at 60 analysed frames per upload

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
        tmp_path = tmp.name
        file.save(tmp_path)

    results = []
    bvi_buffer = deque(maxlen=WINDOW_SIZE)

    try:
        cap = cv2.VideoCapture(tmp_path)
        frame_idx   = 0
        kept        = 0

        while cap.isOpened() and kept < MAX_FRAMES:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % SAMPLE_EVERY == 0:
                # --- object detection ---
                objects = detect_objects_yolo(frame)

                # --- emotion detection ---
                emotion_label   = "no_face"
                confidence      = 0.0
                probs_dict      = {}
                bbox            = None
                bvi_result      = None

                preds, bbox, _emo_err = _detect_emotion(frame)
                if preds is not None:
                    idx = int(np.argmax(preds))
                    emotion_label = EMOTION_LABELS[idx]
                    confidence = float(preds[idx])
                    probs_dict = {lbl: float(p) for lbl, p in zip(EMOTION_LABELS, preds)}

                    bvi_buffer.append(preds)

                    # --- BVI inline (same logic as compute_bvi_for_session) ---
                    if len(bvi_buffer) >= 5:
                        emo_seq = [EMOTION_LABELS[int(np.argmax(p))].lower() for p in bvi_buffer]
                        T = compute_transition_rate(emo_seq)
                        V = compute_emotion_variance(emo_seq)
                        E = compute_entropy(emo_seq)
                        bvi_score = ALPHA * T + BETA * V + GAMMA * E
                        bvi_state = "stable" if bvi_score < 0.4 else "unstable" if bvi_score < 0.55 else "erratic"
                        bvi_result = {
                            "bvi_score":       round(float(bvi_score), 4),
                            "state":           bvi_state,
                            "transition_rate": round(float(T), 4),
                            "emotion_variance":round(float(V), 4),
                            "entropy":         round(float(E), 4),
                            "window_size":     len(bvi_buffer),
                        }

                # --- draw annotations on frame ---
                annotated = frame.copy()
                if bbox:
                    x, y, w, h = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
                    cv2.rectangle(annotated, (x, y), (x + w, y + h), (255, 255, 255), 2)
                    label_str = f"{emotion_label} {confidence*100:.0f}%"
                    cv2.rectangle(annotated, (x, max(0, y - 22)), (x + len(label_str)*8, y), (0, 0, 0), -1)
                    cv2.putText(annotated, label_str, (x + 4, max(12, y - 5)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                for det in objects.get("detections", []):
                    b = det["box"]
                    color = (0, 80, 239) if objects["cheating"] else (34, 197, 94)
                    cv2.rectangle(annotated, (b["x1"], b["y1"]), (b["x2"], b["y2"]), color, 2)
                    obj_str = f"{det['label']} {det['confidence']*100:.0f}%"
                    cv2.rectangle(annotated, (b["x1"], max(0, b["y1"] - 20)),
                                  (b["x1"] + len(obj_str)*8, b["y1"]), (0, 0, 0), -1)
                    cv2.putText(annotated, obj_str, (b["x1"] + 3, max(12, b["y1"] - 4)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

                # --- encode to JPEG base64 ---
                _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
                img_b64 = base64.b64encode(buf).decode("utf-8")

                results.append({
                    "frame":       frame_idx,
                    "image":       img_b64,
                    "emotion":     emotion_label,
                    "confidence":  confidence,
                    "probabilities": probs_dict,
                    "bbox":        bbox,
                    "objects":     objects,
                    "bvi":         bvi_result,
                })
                kept += 1

            frame_idx += 1

        cap.release()

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return jsonify(results)


# -----------------------------
# SOCKET STREAM
# -----------------------------

@socketio.on("connect")
def on_connect():
    emit("server_ready", {"ok": True, "message": "Socket connected"})


@socketio.on("frame")
def on_frame(data):

    driver_id = data.get("driver_id", "default")
    img_data  = data.get("image")

    img = decode_base64_image(img_data)

    if img is None:
        emit("prediction", {"ok": False, "error": "invalid image"})
        return

    objects = detect_objects_yolo(img)

    preds, bbox, err = _detect_emotion(img)

    if err or preds is None:
        emit("prediction", {
            "ok":          True,
            "driver_id":   driver_id,
            "emotion":     "No Face Detected",
            "confidence":  0.0,
            "probabilities": {},
            "bbox":        None,
            "objects":     objects,
            "error":       err or "No face detected"
        })
        return

    idx = int(np.argmax(preds))
    label = EMOTION_LABELS[idx]
    confidence = float(preds[idx])
    probs_dict = {lbl: float(p) for lbl, p in zip(EMOTION_LABELS, preds)}
    session_buffers[driver_id].append(preds.tolist())

    bvi = compute_bvi_for_session(driver_id)

    payload = {
        "ok":           True,
        "driver_id":    driver_id,
        "emotion":      label,
        "confidence":   confidence,
        "probabilities": probs_dict,
        "objects":      objects,
        "bbox":         bbox
    }

    if bvi:
        payload["bvi"] = bvi

    emit("prediction", payload)


# =============================================================================
# ROAD SCENE ANALYSIS (RSA) & HAZARD ASSESSMENT (HA)
# SegFormer semantic segmentation (16 classes) via HuggingFace Transformers
# Endpoint: POST /rsa/analyse
# =============================================================================

_RSA_MODEL_PATH = Path(__file__).resolve().parent / "RSA&HA" / "RSA"

_rsa_ready      = False
_rsa_processor  = None
_rsa_segformer  = None

# 16 classes — matches id2label in config.json
_RSA_CLASSES = [
    "Road", "Sidewalk", "Curb", "Lane Marking", "Crosswalk",
    "Barrier", "Bridge", "Tunnel", "Building", "Vegetation/Terrain",
    "Traffic Control", "Pole/Light", "Person", "Two-wheeler",
    "Vehicle", "Pothole",
]

# RGB colour per class (index matches class id)
_RSA_COLORS_RGB = [
    (128,  64, 128),   # 0  Road
    (244,  35, 232),   # 1  Sidewalk
    ( 70,  70,  70),   # 2  Curb
    (102, 102, 156),   # 3  Lane Marking
    (190, 153, 153),   # 4  Crosswalk
    (153, 153, 153),   # 5  Barrier
    (250, 170,  30),   # 6  Bridge
    (220, 220,   0),   # 7  Tunnel
    ( 70, 130, 180),   # 8  Building
    (107, 142,  35),   # 9  Vegetation/Terrain
    (255,   0,   0),   # 10 Traffic Control
    (220,  20,  60),   # 11 Pole/Light
    (  0, 136, 255),   # 12 Person        (hazard)
    (  0, 200, 255),   # 13 Two-wheeler   (hazard)
    (255, 128,   0),   # 14 Vehicle       (hazard)
    (255,  20,  20),   # 15 Pothole       (hazard)
]

# Hazard weight per class id
_RSA_HAZARD_W = {12: 2.5, 13: 2.0, 14: 1.0, 15: 3.5}


def _rsa_init():
    global _rsa_ready, _rsa_processor, _rsa_segformer
    if not _RSA_MODEL_PATH.exists():
        print("⚠  RSA&HA model not found — /rsa/analyse disabled.")
        return
    try:
        from transformers import (
            SegformerForSemanticSegmentation,
            SegformerImageProcessor,
        )
        _rsa_processor = SegformerImageProcessor.from_pretrained(str(_RSA_MODEL_PATH))
        _rsa_segformer = SegformerForSemanticSegmentation.from_pretrained(
            str(_RSA_MODEL_PATH)
        )
        _rsa_segformer.eval()
        _rsa_ready = True
        print("✅ RSA&HA SegFormer model loaded.")
    except Exception as _e:
        print(f"⚠  RSA model load error: {_e}")


_rsa_init()


def _rsa_run(img_bgr: np.ndarray) -> dict:
    """Segment a BGR image, return overlay + per-class stats + hazard score."""
    import torch
    from PIL import Image as _PILImage

    img_rgb        = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    pil_img        = _PILImage.fromarray(img_rgb)
    orig_h, orig_w = img_bgr.shape[:2]

    inputs = _rsa_processor(images=pil_img, return_tensors="pt")
    with torch.no_grad():
        logits = _rsa_segformer(**inputs).logits   # (1, 16, H/4, W/4)

    upsampled = torch.nn.functional.interpolate(
        logits, size=(orig_h, orig_w), mode="bilinear", align_corners=False
    )
    label_map    = upsampled.argmax(dim=1).squeeze().cpu().numpy()  # (H, W) int
    total_pixels = orig_h * orig_w

    # Build per-class colour mask (RGB) and segment list
    color_mask = np.zeros((orig_h, orig_w, 3), dtype=np.uint8)
    segments   = []
    for cls_id, cls_name in enumerate(_RSA_CLASSES):
        mask    = label_map == cls_id
        pix_cnt = int(mask.sum())
        if pix_cnt == 0:
            continue
        r, g, b            = _RSA_COLORS_RGB[cls_id]
        color_mask[mask]   = (r, g, b)
        segments.append({
            "id":        cls_id,
            "label":     cls_name,
            "pixel_pct": round(pix_cnt / total_pixels * 100, 2),
            "color":     f"#{r:02X}{g:02X}{b:02X}",
        })
    segments.sort(key=lambda s: s["pixel_pct"], reverse=True)

    # Blend original (RGB) with colour mask
    overlay_rgb = cv2.addWeighted(img_rgb, 0.5, color_mask, 0.5, 0)

    # Hazard breakdown & score
    def _pct(cid):
        return round(int((label_map == cid).sum()) / total_pixels * 100, 2)

    breakdown = {
        "person_pct":     _pct(12),
        "twowheeler_pct": _pct(13),
        "vehicle_pct":    _pct(14),
        "pothole_pct":    _pct(15),
    }
    hazard_score = min(100.0, round(
        breakdown["person_pct"]     * _RSA_HAZARD_W[12] +
        breakdown["twowheeler_pct"] * _RSA_HAZARD_W[13] +
        breakdown["vehicle_pct"]    * _RSA_HAZARD_W[14] +
        breakdown["pothole_pct"]    * _RSA_HAZARD_W[15],
        2,
    ))
    hazard_level = (
        "Low"    if hazard_score < 10 else
        "Medium" if hazard_score < 35 else
        "High"
    )

    def _enc(arr_rgb):
        _, buf = cv2.imencode(
            ".jpg", cv2.cvtColor(arr_rgb, cv2.COLOR_RGB2BGR),
            [cv2.IMWRITE_JPEG_QUALITY, 85]
        )
        return "data:image/jpeg;base64," + base64.b64encode(buf).decode()

    return {
        "original": _enc(img_rgb),
        "overlay":  _enc(overlay_rgb),
        "segments": segments,
        "hazard": {
            "score":     hazard_score,
            "level":     hazard_level,
            "breakdown": breakdown,
        },
    }


@app.route("/rsa/analyse", methods=["POST"])
def rsa_analyse():
    if not _rsa_ready:
        return jsonify({
            "error": "RSA model not loaded. Install: pip install torch transformers safetensors"
        }), 503
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No image file provided"}), 400
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        file.save(tmp.name)
        path = tmp.name
    try:
        img = cv2.imread(path)
        if img is None:
            return jsonify({"error": "Could not decode image"}), 400
        result = _rsa_run(img)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


@app.route("/rsa/analyse-video", methods=["POST"])
def rsa_analyse_video():
    if not _rsa_ready:
        return jsonify({
            "error": "RSA model not loaded. Install: pip install torch transformers safetensors"
        }), 503
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No video file provided"}), 400

    _RSA_SAMPLE_EVERY = 30   # analyse 1 frame per second at 30fps
    _RSA_MAX_FRAMES   = 25   # cap to keep response size manageable

    suffix = ".mp4"
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file.save(tmp.name)
        path = tmp.name

    results = []
    try:
        cap = cv2.VideoCapture(path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_idx = 0
        while cap.isOpened() and len(results) < _RSA_MAX_FRAMES:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % _RSA_SAMPLE_EVERY == 0:
                try:
                    r = _rsa_run(frame)
                    r["frame"]     = frame_idx
                    r["timestamp"] = round(frame_idx / fps, 2)
                    results.append(r)
                except Exception:
                    pass
            frame_idx += 1
        cap.release()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

    if not results:
        return jsonify({"error": "No frames could be processed from this video."}), 400

    return jsonify({"frames": results, "total": len(results)})


# ═══════════════════════════════════════════════════════
# BUS ROUTE SAFETY HAZARD ANALYSER
# ═══════════════════════════════════════════════════════
import math
import geopandas as gpd
import pandas as pd
import rasterio
import requests as _hazard_requests
import osmnx as ox
from geopy.geocoders import Nominatim
from pyproj import Geod
from shapely.geometry import LineString, Point

_HAZARD_DATA_DIR = Path(__file__).resolve().parent / "RSA&HA" / "HA"
_HAZARD_DEM_TIF  = _HAZARD_DATA_DIR / "sri_lanka_srtm.tif"

_HAZARD_METRIC_CRS = "EPSG:32644"
_HAZARD_GEOD = Geod(ellps="WGS84")


def _hz_clean(val):
    if val is None:
        return None
    if isinstance(val, (np.integer, np.floating)):
        val = val.item()
    if isinstance(val, float):
        if np.isnan(val) or np.isinf(val):
            return None
    return val


def _hz_geocode(name: str):
    geolocator = Nominatim(user_agent="driveguard_hazard_analyzer")
    loc = geolocator.geocode(name, timeout=10)
    if loc:
        return (loc.latitude, loc.longitude)
    raise ValueError(f"Could not geocode: {name}")


def _hz_osrm_route(a, b):
    lat_a, lon_a = a
    lat_b, lon_b = b
    url = (
        f"https://router.project-osrm.org/route/v1/driving/"
        f"{lon_a},{lat_a};{lon_b},{lat_b}?overview=full&geometries=geojson"
    )
    r = _hazard_requests.get(url, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "routes" not in data or not data["routes"]:
        raise ValueError("No route found for these locations")
    return data["routes"][0]["geometry"]["coordinates"]


def _hz_densify(coords, step_m=5.0):
    dense = [coords[0]]
    for (lon1, lat1), (lon2, lat2) in zip(coords[:-1], coords[1:]):
        _, _, dist = _HAZARD_GEOD.inv(lon1, lat1, lon2, lat2)
        n = max(1, int(dist // step_m))
        for i in range(1, n + 1):
            f = i / n
            dense.append([lon1 + (lon2 - lon1) * f, lat1 + (lat2 - lat1) * f])
    return dense


def _hz_seg_dists(coords):
    distances = []
    for (lon1, lat1), (lon2, lat2) in zip(coords[:-1], coords[1:]):
        _, _, dist = _HAZARD_GEOD.inv(lon1, lat1, lon2, lat2)
        distances.append(dist)
    return np.array(distances, dtype=np.float64) + 1e-6


def _hz_raw_slope(elev, coords):
    dists = _hz_seg_dists(coords)
    return ((elev[1:] - elev[:-1]) / dists) * 100.0


def _hz_curvature(coords):
    bearings, distances = [], []
    for (lon1, lat1), (lon2, lat2) in zip(coords[:-1], coords[1:]):
        az, _, dist = _HAZARD_GEOD.inv(lon1, lat1, lon2, lat2)
        bearings.append(az)
        distances.append(dist)
    bearings  = np.array(bearings, dtype=np.float64)
    distances = np.array(distances, dtype=np.float64) + 1e-6
    delta = np.diff(bearings)
    delta = (delta + 180.0) % 360.0 - 180.0
    return np.abs(delta) / distances[1:]


def _hz_smooth(arr, window=9):
    arr = np.asarray(arr, dtype=float)
    if window <= 1:
        return arr
    return np.convolve(arr, np.ones(window) / window, mode="same")


def _hz_road_grade(raw_slope, elev, step_m=5.0):
    smoothed = _hz_smooth(raw_slope, window=9)
    half_w = max(4, int(round(50.0 / step_m)))
    min_run = max(4, int(round(30.0 / step_m)))
    labels = ["Flat"] * len(smoothed)
    for i in range(len(smoothed)):
        left  = max(0, i - half_w)
        right = min(len(smoothed), i + half_w + 1)
        local = smoothed[left:right]
        if not len(local):
            continue
        avg   = float(np.mean(local))
        mx    = float(np.max(np.abs(local)))
        elev_seg = elev[max(0, i - half_w): min(len(elev), i + half_w + 1)]
        relief = 0.0 if not len(elev_seg) else float(np.max(elev_seg) - np.min(elev_seg))
        if avg >= 3.0:
            if np.sum(local >= 3.0) >= min_run and relief >= 4.0:
                labels[i] = "High Steep Hill" if mx >= 8.0 else ("Medium Steep Hill" if mx >= 5.0 else "Normal Steep Hill")
        elif avg <= -3.0:
            if np.sum(local <= -3.0) >= min_run and relief >= 4.0:
                labels[i] = "High Downhill" if mx >= 8.0 else ("Medium Downhill" if mx >= 5.0 else "Normal Downhill")
    return labels, smoothed


def _hz_default_osm(n):
    return pd.DataFrame({
        "pt_id": list(range(n)), "road_name": [""] * n, "ref": [""] * n,
        "highway": ["unknown"] * n, "maxspeed": [""] * n, "oneway": [""] * n,
        "lanes": [""] * n, "is_bridge": [False] * n, "is_tunnel": [False] * n,
        "road_dist_m": [math.nan] * n, "near_intersections": [0] * n,
    })


def _hz_osm_features(dense_coords):
    if len(dense_coords) < 2:
        return _hz_default_osm(len(dense_coords))
    try:
        route_line = LineString(dense_coords)
        route_gdf  = gpd.GeoDataFrame({"route_id": [1]}, geometry=[route_line], crs="EPSG:4326")
        route_metric   = route_gdf.to_crs(_HAZARD_METRIC_CRS)
        corridor_metric = route_metric.buffer(500.0)
        corridor_wgs84  = gpd.GeoSeries(corridor_metric, crs=_HAZARD_METRIC_CRS).to_crs("EPSG:4326").iloc[0]
        bbox = list(corridor_wgs84.bounds)
        try:
            G = ox.graph_from_bbox((bbox[0], bbox[1], bbox[2], bbox[3]), network_type="all", simplify=True)
            nodes, roads = ox.graph_to_gdfs(G)
        except Exception as exc:
            print(f"[Hazard] OSM graph fetch failed: {exc}")
            return _hz_default_osm(len(dense_coords))
        if roads is None or len(roads) == 0:
            return _hz_default_osm(len(dense_coords))
        roads_metric = roads.to_crs(_HAZARD_METRIC_CRS)
        route_points = gpd.GeoDataFrame(
            {"pt_id": list(range(len(dense_coords)))},
            geometry=[Point(xy[0], xy[1]) for xy in dense_coords],
            crs="EPSG:4326",
        ).to_crs(_HAZARD_METRIC_CRS)
        nearest_join = gpd.sjoin_nearest(route_points, roads_metric, how="left", max_distance=120.0, distance_col="road_dist_m")
        try:
            nodes_metric = nodes.to_crs(_HAZARD_METRIC_CRS)
            if "street_count" in nodes_metric.columns:
                inters = nodes_metric[nodes_metric["street_count"].fillna(0) >= 3]
            else:
                deg = pd.concat([roads_metric["u"], roads_metric["v"]]).value_counts()
                deg_df = deg.rename_axis("osmid").reset_index(name="degree")
                nodes_metric = nodes_metric.merge(deg_df, on="osmid", how="left")
                nodes_metric["degree"] = nodes_metric["degree"].fillna(0)
                inters = nodes_metric[nodes_metric["degree"] >= 3]
            if inters is not None and len(inters) > 0:
                pt_bufs = route_points[["pt_id", "geometry"]].copy()
                pt_bufs["geometry"] = pt_bufs.geometry.buffer(80.0)
                hits = gpd.sjoin(inters[["geometry"]], pt_bufs, how="inner", predicate="within")
                counts = hits.groupby("pt_id").size().rename("near_intersections").reset_index()
                nearest_join = nearest_join.merge(counts, on="pt_id", how="left")
            else:
                nearest_join["near_intersections"] = 0
        except Exception:
            nearest_join["near_intersections"] = 0
        nearest_join["near_intersections"] = nearest_join["near_intersections"].fillna(0).astype(int)
        for col in ["name", "ref", "highway", "maxspeed", "oneway", "lanes", "bridge", "tunnel"]:
            if col not in nearest_join.columns:
                nearest_join[col] = ""
        nearest_join["road_name"] = nearest_join["name"].fillna("").astype(str)
        nearest_join["ref"]       = nearest_join["ref"].fillna("").astype(str)
        nearest_join["highway"]   = nearest_join["highway"].fillna("unknown").astype(str)
        nearest_join["maxspeed"]  = nearest_join["maxspeed"].fillna("").astype(str)
        nearest_join["oneway"]    = nearest_join["oneway"].fillna("").astype(str)
        nearest_join["lanes"]     = nearest_join["lanes"].fillna("").astype(str)
        nearest_join["is_bridge"] = nearest_join["bridge"].fillna("no").astype(str).str.lower().ne("no")
        nearest_join["is_tunnel"] = nearest_join["tunnel"].fillna("no").astype(str).str.lower().ne("no")
        nearest_join = nearest_join.sort_values("pt_id").reset_index(drop=True)
        return nearest_join[["pt_id","road_name","ref","highway","maxspeed","oneway","lanes","is_bridge","is_tunnel","road_dist_m","near_intersections"]].copy()
    except Exception as exc:
        print(f"[Hazard] OSM feature extraction failed: {exc}")
        return _hz_default_osm(len(dense_coords))


def _hz_classify_risk(risk):
    if risk < 0.40: return "Low Risk", "green"
    if risk < 0.70: return "Medium Risk", "orange"
    if risk < 1.00: return "High Risk", "red"
    return "Critical Risk", "darkred"


def _hz_road_context_penalty(highway, near_intersections, is_bridge, is_tunnel):
    road_map = {
        "motorway": 0.02, "trunk": 0.03, "primary": 0.05, "secondary": 0.08,
        "tertiary": 0.10, "residential": 0.12, "service": 0.14,
        "unclassified": 0.11, "track": 0.15, "path": 0.18, "unknown": 0.10,
    }
    base      = road_map.get(str(highway).lower(), 0.10)
    junc_pen  = min(int(near_intersections) * 0.03, 0.15)
    struct_pen = 0.05 if is_bridge or is_tunnel else 0.0
    return base + junc_pen + struct_pen


@app.route("/api/analyze-route-demo", methods=["GET"])
def analyze_route_demo():
    """
    Demo endpoint: returns hardcoded sample route data for testing the HazardAnalyzer UI.
    No external API calls needed — perfect for immediate UI testing.
    """
    import math
    
    # Sample route: Colombo → Galle (south coast)
    start_lat, start_lon = 6.9271, 80.6365  # Colombo
    end_lat, end_lon = 6.0367, 80.2167      # Galle
    
    # Generate 100 interpolated points
    path_data = []
    for i in range(100):
        t = i / 99.0
        lat = start_lat + t * (end_lat - start_lat)
        lon = start_lon + t * (end_lon - start_lon)
        
        # ~305m / 100 points = ~3.05m per step
        distance = t * 305000
        
        # Create risk zones: some high/critical risk areas
        if 30 <= i <= 35:
            risk = 0.85
            risk_label = "High Risk"
            color = "red"
            terrain = "High Steep Hill"
        elif 60 <= i <= 68:
            risk = 1.15
            risk_label = "Critical Risk"
            color = "darkred"
            terrain = "High Downhill"
        elif 40 <= i <= 50:
            risk = 0.55
            risk_label = "Medium Risk"
            color = "orange"
            terrain = "Moderate Grade"
        else:
            risk = 0.25
            risk_label = "Low Risk"
            color = "green"
            terrain = "Flat"
        
        path_data.append({
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "risk": round(risk, 2),
            "risk_label": risk_label,
            "color": color,
            "slope": round(3.5 + 6 * math.sin(i / 20), 1),
            "curvature": round(0.005 + 0.008 * math.sin(i / 15), 3),
            "distance": round(distance, 1),
            "terrain_feature": terrain,
            "road_name": "A2 South Expressway" if i < 50 else "Matara Road",
            "road_class": "trunk" if i < 50 else "primary",
            "road_ref": "A2" if i < 50 else "A3",
            "maxspeed": "80" if i < 50 else "60",
            "lanes": "2" if i < 50 else "2",
            "is_bridge": i == 25 or i == 75,
            "is_tunnel": i == 80,
            "near_intersections": 1 if 40 <= i <= 42 else 0,
            "context_penalty": round(0.08 if i < 50 else 0.12, 2),
            "signed_grade": round(2.5 + 5 * math.sin(i / 18), 1),
        })
    
    return jsonify({
        "status": "success",
        "start_location": "Colombo",
        "end_location": "Galle",
        "start_coords": {"lat": start_lat, "lon": start_lon},
        "end_coords": {"lat": end_lat, "lon": end_lon},
        "total_points": len(path_data),
        "path_data": path_data,
        "note": "Demo data for UI testing — no real analysis performed"
    }), 200


@app.route("/api/analyze-route", methods=["POST"])
def analyze_route():
    """Analyze a bus route for terrain hazards and safety risks."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing JSON body"}), 400
        start_location = (data.get("start_location") or "").strip()
        end_location   = (data.get("end_location")   or "").strip()
        step_m         = float(data.get("step_m", 5.0))

        if not start_location or not end_location:
            return jsonify({"error": "Missing start_location or end_location"}), 400

        start_coords = _hz_geocode(start_location)
        end_coords   = _hz_geocode(end_location)

        route_coords = _hz_osrm_route(start_coords, end_coords)
        dense_coords = _hz_densify(route_coords, step_m=step_m)

        with rasterio.open(str(_HAZARD_DEM_TIF)) as src:
            elev_raw = list(src.sample(dense_coords))
        elev = np.array(elev_raw, dtype=np.float64).reshape(-1)

        raw_slope              = _hz_raw_slope(elev, dense_coords)
        terrain_features, smoothed_grade = _hz_road_grade(raw_slope, elev, step_m=step_m)
        slope_risk_input       = np.clip(-smoothed_grade, 0, None)
        curvature              = _hz_smooth(_hz_curvature(dense_coords), window=7)

        osm_features = _hz_osm_features(dense_coords)
        if hasattr(osm_features, "columns") and "pt_id" in osm_features.columns:
            osm_features = osm_features.set_index("pt_id")

        path_data    = []
        current_dist = 0.0
        prev_lon, prev_lat = dense_coords[0]

        for i in range(1, len(dense_coords) - 1):
            lon, lat = dense_coords[i]
            _, _, step_dist = _HAZARD_GEOD.inv(prev_lon, prev_lat, lon, lat)
            current_dist += step_dist
            prev_lon, prev_lat = lon, lat

            slope_val     = float(slope_risk_input[i - 1]) if i - 1 < len(slope_risk_input) else 0.0
            curv_val      = float(curvature[i - 1])        if i - 1 < len(curvature)         else 0.0
            terrain_feat  = terrain_features[i - 1]        if i - 1 < len(terrain_features)  else "Flat"
            signed_grade  = float(smoothed_grade[i - 1])   if i - 1 < len(smoothed_grade)    else 0.0

            osm_row = None
            if hasattr(osm_features, "index") and i in osm_features.index:
                osm_row = osm_features.loc[i]
                if isinstance(osm_row, pd.DataFrame):
                    osm_row = osm_row.sort_values("road_dist_m", na_position="last").iloc[0] if "road_dist_m" in osm_row.columns else osm_row.iloc[0]

            road_name = road_ref = road_class = maxspeed = lanes = ""
            road_class = "unknown"
            is_bridge = is_tunnel = False
            road_dist_m = None
            near_intersections = 0

            if osm_row is not None:
                road_name          = str(osm_row.get("road_name", "") or "")
                road_ref           = str(osm_row.get("ref", "")       or "")
                road_class         = str(osm_row.get("highway", "unknown") or "unknown")
                maxspeed           = str(osm_row.get("maxspeed", "") or "")
                lanes              = str(osm_row.get("lanes", "")    or "")
                is_bridge          = bool(osm_row.get("is_bridge", False))
                is_tunnel          = bool(osm_row.get("is_tunnel", False))
                road_dist_m        = osm_row.get("road_dist_m", None)
                near_intersections = int(osm_row.get("near_intersections", 0) or 0)
                if road_dist_m is not None and pd.notna(road_dist_m):
                    road_dist_m = float(road_dist_m)
                else:
                    road_dist_m = None

            terrain_risk    = 0.7 * (slope_val / 10.0) + 0.3 * (curv_val / 1.0)
            ctx_penalty     = _hz_road_context_penalty(road_class, near_intersections, is_bridge, is_tunnel)
            risk            = terrain_risk + ctx_penalty
            risk_label, color = _hz_classify_risk(risk)

            path_data.append({
                "lat": _hz_clean(lat), "lon": _hz_clean(lon),
                "risk": _hz_clean(round(risk, 2)),
                "slope": _hz_clean(round(slope_val, 1)),
                "curvature": _hz_clean(round(curv_val, 3)),
                "risk_label": risk_label, "color": color,
                "distance": _hz_clean(round(current_dist, 1)),
                "terrain_feature": terrain_feat,
                "road_name": road_name, "road_class": road_class, "road_ref": road_ref,
                "maxspeed": maxspeed, "lanes": lanes,
                "is_bridge": is_bridge, "is_tunnel": is_tunnel,
                "road_dist_m": _hz_clean(road_dist_m),
                "near_intersections": near_intersections,
                "context_penalty": _hz_clean(round(ctx_penalty, 2)),
                "signed_grade": _hz_clean(round(signed_grade, 1)),
            })

        return jsonify({
            "status": "success",
            "start_location": start_location,
            "end_location":   end_location,
            "start_coords":   {"lat": start_coords[0], "lon": start_coords[1]},
            "end_coords":     {"lat": end_coords[0],   "lon": end_coords[1]},
            "total_points":   len(path_data),
            "path_data":      path_data,
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# DROWSINESS DETECTION
# Socket event : client emits  "drowsiness_frame"  {image, shift_id, client_ts}
#                server emits  "drowsiness_result" {ok, verdict, confidence, …}
# REST endpoint: POST /analyze-drowsiness-video   (multipart: field "video")
#               POST /api/driver/shift/drowsiness  (save per-shift readings)
# =============================================================================

# Per-shift reading accumulation keyed by shift_id.
# One reading is stored every 30 s; flushed to MongoDB when shift ends.
import threading as _dw_threading
_dw_shift_readings: dict = {}
_dw_shift_lock = _dw_threading.Lock()


@socketio.on("drowsiness_frame")
def on_drowsiness_frame(data):
    """
    Process one webcam frame for drowsiness detection.
    Accumulates a reading every 30 s, keyed by shift_id, for later analysis.
    """
    try:
        img_data  = data.get("image")
        shift_id  = data.get("shift_id")   # links readings to the active shift
        client_ts = data.get("client_ts") or 0

        # request.sid = unique Socket.IO connection — used as the model's
        # per-session frame buffer key (LSTM temporal window).
        session_id = request.sid

        img = decode_base64_image(img_data)
        if img is None:
            emit("drowsiness_result", {"ok": False, "error": "Invalid image data"})
            return

        if not _dw_engine.ready:
            emit("drowsiness_result", {
                "ok":    False,
                "error": "Drowsiness engine not loaded — check server logs.",
            })
            return

        # ── 1. Ensemble inference ─────────────────────────────────────────────
        result = _dw_engine.process_frame(img, session_id=session_id)

        # ── 2. Accumulate a reading every 30 s (only when shift_id provided) ──
        if shift_id and result.get("ok"):
            with _dw_shift_lock:
                if shift_id not in _dw_shift_readings:
                    _dw_shift_readings[shift_id] = {
                        "start_ts":    client_ts,
                        "last_ts":     0,
                        "readings":    [],
                    }
                state = _dw_shift_readings[shift_id]
                # Save first reading immediately, then every 30 s
                since_last = (client_ts - state["last_ts"]) / 1000 if state["last_ts"] else 31
                if since_last >= 30:
                    elapsed = round((client_ts - state["start_ts"]) / 1000) if client_ts else 0
                    state["readings"].append({
                        "t":          max(0, elapsed),
                        "confidence": round(result.get("confidence", 0.0), 3),
                        "verdict":    result.get("verdict", "Alert"),
                        "alert":      bool(result.get("alert", False)),
                    })
                    state["last_ts"] = client_ts

        emit("drowsiness_result", result)

    except Exception as exc:
        import traceback
        traceback.print_exc()
        emit("drowsiness_result", {"ok": False, "error": str(exc)})


@app.route("/api/driver/shift/drowsiness", methods=["POST"])
def save_shift_drowsiness():
    """
    Called by the frontend when a shift ends.
    Retrieves the in-memory per-shift drowsiness readings accumulated during
    the shift and persists them to the `shift_drowsiness` MongoDB collection.

    Body: { shift_id: str, driver_id: str }
    """
    try:
        from Emotion_Shift_Profile.database import get_db
        from datetime import datetime as _dt

        body      = request.get_json(force=True, silent=True) or {}
        shift_id  = (body.get("shift_id")  or "").strip()
        driver_id = (body.get("driver_id") or "").strip()

        if not shift_id:
            return jsonify({"error": "shift_id is required"}), 400

        # Pop accumulated readings from memory
        with _dw_shift_lock:
            state = _dw_shift_readings.pop(shift_id, None)

        readings = state["readings"] if state else []

        if not readings:
            return jsonify({"message": "No readings to save", "total": 0}), 200

        # Build summary stats
        confidences = [r["confidence"] for r in readings]
        alert_count = sum(1 for r in readings if r.get("alert"))
        drowsy_readings = sum(1 for r in readings if r.get("verdict") == "Drowsy")

        doc = {
            "shift_id":       shift_id,
            "driver_id":      driver_id,
            "readings":       readings,
            "total_readings": len(readings),
            "drowsy_readings":drowsy_readings,
            "total_alerts":   alert_count,
            "avg_confidence": round(sum(confidences) / len(confidences), 3),
            "max_confidence": round(max(confidences), 3),
            "created_at":     _dt.utcnow(),
        }

        db = get_db()
        db.shift_drowsiness.update_one(
            {"shift_id": shift_id},
            {"$set": doc},
            upsert=True,
        )

        return jsonify({
            "message": "Drowsiness timeline saved",
            "total":   len(readings),
        }), 200

    except Exception as exc:
        app.logger.exception("save_shift_drowsiness error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/analyze-drowsiness-video", methods=["POST"])
def analyze_drowsiness_video():
    """Analyse an uploaded video file for drowsiness events.

    Multipart form field: "video"
    Query param (optional): sample_every (default 3)
    Returns JSON with summary + per-frame timeline.
    """
    if not _dw_engine.ready:
        return jsonify({
            "error": (
                "Drowsiness engine not loaded. "
                "Ensure models are present in backend/Drownsiness/ "
                "and mediapipe is installed."
            )
        }), 503

    video_file = request.files.get("video")
    if not video_file:
        return jsonify({"error": "No video file provided (field name: 'video')"}), 400

    # Determine extension for temp file
    suffix = ".mp4"
    if video_file.filename and "." in video_file.filename:
        suffix = "." + video_file.filename.rsplit(".", 1)[-1].lower()

    sample_every = max(1, int(request.args.get("sample_every", 3)))

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            video_file.save(tmp.name)
            tmp_path = tmp.name

        result = _dw_engine.process_video(tmp_path, sample_every=sample_every)
        if not result.get("ok"):
            return jsonify({"error": result.get("error", "Processing failed")}), 500

        return jsonify(result)

    except Exception as exc:
        app.logger.exception("Drowsiness video analysis error: %s", exc)
        return jsonify({"error": str(exc)}), 500

    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


# -----------------------------
# SERVER
# -----------------------------

if __name__ == "__main__":
    # Optionally start GPS TCP client (e.g. connect to GPS2IP on your phone)
    try:
        gps_host = os.getenv("GPS_TCP_HOST")
        gps_port = os.getenv("GPS_TCP_PORT")
        if gps_host and gps_port:
            try:
                from services.gps_listener import start_tcp_nmea_client
                t = threading.Thread(target=start_tcp_nmea_client, args=(gps_host, int(gps_port)), daemon=True)
                t.start()
                app.logger.info(f"Started GPS TCP client to {gps_host}:{gps_port}")
            except Exception as e:
                app.logger.warning(f"Could not start GPS TCP client: {e}")
        # Also optionally start UDP listener if configured
        udp_port = os.getenv("GPS_UDP_PORT")
        udp_enable = os.getenv("GPS_UDP_ENABLE", "false").lower() in ("1", "true", "yes")
        if udp_enable and udp_port:
            try:
                from services.gps_listener import start_udp_nmea_listener
                t2 = threading.Thread(target=start_udp_nmea_listener, args=("0.0.0.0", int(udp_port)), daemon=True)
                t2.start()
                app.logger.info(f"Started GPS UDP listener on 0.0.0.0:{udp_port}")
            except Exception as e:
                app.logger.warning(f"Could not start GPS UDP listener: {e}")

    except Exception:
        pass

    socketio.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=False,
        allow_unsafe_werkzeug=True,
    )