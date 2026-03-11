import threading as _threading_module
_RealThread = _threading_module.Thread  # save before eventlet patches it

import eventlet
eventlet.monkey_patch()
import os
import json
import tempfile
import base64
from collections import defaultdict, deque, Counter
from typing import Dict, Optional, Any

import cv2
import numpy as np
from flask import Flask, request, jsonify, Response
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from tensorflow.keras.models import load_model
from ultralytics import YOLO
import time
import threading
from pathlib import Path
from tensorflow import keras as _keras
from tensorflow.keras import layers as _layers
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input as _mob_preprocess

from dotenv import load_dotenv
load_dotenv()

from user_management import register_user_management
from user_management.config import Config
from drowsiness_engine import DrowsinessEngine


app = Flask(__name__)
app.config.from_object(Config)
CORS(app, origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175", "http://127.0.0.1:5176"])
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# Register user management blueprints (MongoDB — no table creation needed)
register_user_management(app)

# Drowsiness detection engine (loaded once at startup)
_dw_engine = DrowsinessEngine()


# -----------------------------
# Emotion model
# -----------------------------

MODEL_PATH = "emotion_model.h5"
LABELS_PATH = "emotion_labels.json"

with open(LABELS_PATH, "r") as f:
    EMOTION_LABELS = json.load(f)

emotion_model = load_model(MODEL_PATH)


# -----------------------------
# YOLO cheating object model
# -----------------------------

YOLO_MODEL_PATH = "yolov8n.pt"
yolo_model = YOLO(YOLO_MODEL_PATH)

CHEATING_LABELS = {
    "phone", "cell phone", "mobile phone", "smartphone",
    "headphones", "headphone", "earphones", "earbuds",
    "smartwatch", "watch",
    "hand raise", "extra person",
}


# -----------------------------
# BVI CONFIG
# -----------------------------

WINDOW_SIZE = 30

# Normalized weights
ALPHA = 0.4
BETA = 0.3
GAMMA = 0.3


session_buffers: Dict[str, deque] = defaultdict(lambda: deque(maxlen=WINDOW_SIZE))


# Emotion intensity map (covers all labels the model can emit)
EMOTION_VALUE_MAP = {
    "neutral":   0,
    "happy":     1,
    "sad":      -1,
    "angry":    -2,
    "fearful":  -2,
    "fear":     -2,
    "surprised": 0.5,
    "surprise":  0.5,
    "disgusted": -1,
    "disgust":  -1,
}


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
# BVI CALCULATIONS
# -----------------------------

def compute_transition_rate(labels):

    changes = sum(
        1 for i in range(1,len(labels))
        if labels[i] != labels[i-1]
    )

    return changes / max(1,len(labels)-1)


def compute_emotion_variance(labels):

    values = [EMOTION_VALUE_MAP.get(l, 0) for l in labels]

    return float(np.var(values))


def compute_entropy(labels):

    counts = Counter(labels)
    total = len(labels)

    entropy = 0

    for c in counts.values():

        p = c / total
        entropy -= p * np.log2(p)

    return float(entropy)


def compute_bvi_components(probs_buffer):
    """Shared helper: compute T, V, E from a list of prediction arrays."""
    label_ids = [int(np.argmax(p)) for p in probs_buffer]
    emotions  = [EMOTION_LABELS[i].lower() for i in label_ids]
    T = compute_transition_rate(emotions)
    V = compute_emotion_variance(emotions)
    E = compute_entropy(emotions)
    return T, V, E


def compute_bvi_for_session(session_id):

    buffer = session_buffers[session_id]

    if len(buffer) < 5:
        return None

    probs_list = [np.array(p) for p in buffer]
    T, V, E = compute_bvi_components(probs_list)

    bvi = ALPHA * T + BETA * V + GAMMA * E

    if bvi < 0.4:
        state = "stable"
    elif bvi < 0.55:
        state = "unstable"
    else:
        state = "erratic"

    return {
        "bvi_score": float(bvi),
        "state": state,
        "transition_rate": float(T),
        "emotion_variance": float(V),
        "entropy": float(E),
        "window_size": len(buffer)
    }


# =============================================================================
# ROAD SIGN DETECTION  – models, webcam state, helpers, routes
# All served at /upload  /video_feed  /get_detection_info
#                /capture_webcam  /stop_camera
# (Vite proxy strips the /road-sign prefix so the paths arrive here as-is)
# =============================================================================

_RS_W            = Path(__file__).resolve().parent / "Road_sign_detection" / "Weight"
_RS_IMG_SIZE     = 224
_RS_MARGIN       = 0.15
_RS_NORM_THR     = 0.75
_RS_DMG_THR      = 0.40
_RS_SAMPLE_EVERY = 30
_RS_MAX_DET      = 20

_rs_ready      = False
_rs_detector   = None
_rs_mobilenet  = None
_rs_custom_mdl = None
_rs_yolo_clf   = None
_rs_idx2class: dict = {}


def _rs_init():
    """Load all road-sign models once at startup; no-op if weights are missing."""
    global _rs_ready, _rs_detector, _rs_mobilenet, _rs_custom_mdl, _rs_yolo_clf, _rs_idx2class

    det_pt   = _RS_W / "Detect_Model/RoadSignDetector_v22/weights/best.pt"
    mob_h5   = _RS_W / "mobilenet_weights/Mobilenetv2_Retrain_weight/phase2_epoch_015.weights.h5"
    cst_h5   = _RS_W / "Custom_model2_weights/epoch_026.weights.h5"
    clf_pt   = _RS_W / "YOLO8/YOLOv8_Classifier/weights/best.pt"
    map_json = _RS_W / "Custom_model2_weights/class_mapping.json"

    if not all(p.exists() for p in [det_pt, mob_h5, cst_h5, clf_pt, map_json]):
        print("\u26a0  Road-sign weights not found \u2014 /upload and related routes disabled.")
        return

    try:
        _rs_detector = YOLO(str(det_pt))

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
    res_det = _rs_detector(frame, conf=0.25, verbose=False)
    boxes   = res_det[0].boxes
    if len(boxes) == 0:
        return None

    best = max(boxes, key=lambda b: float(b.conf[0]))
    x1, y1, x2, y2 = best.xyxy[0].cpu().numpy().astype(int)
    w, h   = x2 - x1, y2 - y1
    mx, my = int(w * _RS_MARGIN), int(h * _RS_MARGIN)
    x1, y1 = max(0, x1 - mx), max(0, y1 - my)
    x2, y2 = min(frame.shape[1], x2 + mx), min(frame.shape[0], y2 + my)
    crop    = frame[y1:y2, x1:x2]

    candidates = [(c, *_rs_ensemble(c)) for c in [crop, _rs_sharpen(crop), _rs_clahe(crop)]]
    best_crop, class_name, confidence = max(candidates, key=lambda v: v[2])

    status = (
        "Normal"           if confidence >= _RS_NORM_THR else
        "Damaged"          if confidence <  _RS_DMG_THR  else
        "Possibly unclear"
    )
    color = (0, 255, 0) if status == "Normal" else (0, 0, 255)

    det = orig.copy()
    cv2.rectangle(det, (x1, y1), (x2, y2), color, 3)
    cv2.putText(det, f"{class_name.replace('_', ' ')} ({confidence:.2f})",
                (x1, max(14, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.75, color, 2)

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
    }


# ── Road-sign webcam state ─────────────────────────────────────────────────────

_rs_cam_lock    = threading.Lock()
_rs_cap         = None
_rs_cam_running = False
_rs_latest_raw  = None
_rs_latest_ann  = None
_rs_latest_info: dict = {}


def _rs_cam_worker():
    global _rs_latest_raw, _rs_latest_ann, _rs_latest_info, _rs_cam_running
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
        if _rs_ready:
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
                color = (0, 255, 0) if status == "Normal" else (0, 0, 255)
                cv2.rectangle(ann, (x1, y1), (x2, y2), color, 2)
                lbl = f"{cls.replace('_', ' ')} {conf * 100:.0f}%"
                tw  = len(lbl) * 9
                cv2.rectangle(ann, (x1, max(0, y1 - 24)), (x1 + tw, y1), (0, 0, 0), -1)
                cv2.putText(ann, lbl, (x1 + 3, max(14, y1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
                _rs_latest_info = {"class_name": cls, "confidence": conf, "status": status}
            else:
                _rs_latest_info = {}
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
    _rs_cam_running = True
    _RealThread(target=_rs_cam_worker, daemon=True).start()
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
        return jsonify({"detected": True, "results": results_list, "input_type": "video"})

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


@app.route("/capture_webcam", methods=["POST"])
def rs_capture_webcam():
    frame = _rs_latest_raw
    if frame is None:
        return jsonify({"error": "Camera not active \u2014 no frame available"}), 400
    result = rs_process_frame(frame)
    if not result:
        return jsonify({"detected": False, "message": "No road sign in current frame."})
    result["input_type"] = "webcam"
    return jsonify(result)


@app.route("/stop_camera")
def rs_stop_camera_route():
    _rs_stop_camera()
    return jsonify({"stopped": True})


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
        from user_management.database import get_db
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

        processed, err = preprocess_face_from_bgr(img)

        if err:
            return jsonify({
                "error":err,
                "objects":objects
            })

        face_input, bbox = processed

        preds = emotion_model.predict(face_input)[0]

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
                processed, err = preprocess_face_from_bgr(frame)
                emotion_label   = "no_face"
                confidence      = 0.0
                probs_dict      = {}
                bbox            = None
                bvi_result      = None

                if not err:
                    face_input, bbox = processed
                    preds = emotion_model.predict(face_input, verbose=0)[0]
                    idx   = int(np.argmax(preds))
                    emotion_label = EMOTION_LABELS[idx]
                    confidence    = float(preds[idx])
                    probs_dict    = {lbl: float(p) for lbl, p in zip(EMOTION_LABELS, preds)}

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

    processed, err = preprocess_face_from_bgr(img)

    if err:
        emit("prediction", {
            "ok":          True,
            "driver_id":   driver_id,
            "emotion":     "No Face Detected",
            "confidence":  0.0,
            "probabilities": {},
            "bbox":        None,
            "objects":     objects,
            "error":       err
        })
        return

    face_input, bbox = processed

    preds = emotion_model.predict(face_input, verbose=0)[0]

    idx   = int(np.argmax(preds))
    label = EMOTION_LABELS[idx]

    confidence = float(preds[idx])

    probs_dict = {
        lbl: float(p) for lbl, p in zip(EMOTION_LABELS, preds)
    }

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
# Socket event : client emits  "drowsiness_frame"  {image, session_id, client_ts}
#                server emits  "drowsiness_result" {ok, verdict, confidence, …}
# REST endpoint: POST /analyze-drowsiness-video   (multipart: field "video")
# =============================================================================

# Per-driver sequence buffers for LSTM are managed inside _dw_engine automatically.


@socketio.on("drowsiness_frame")
def on_drowsiness_frame(data):
    """Process one webcam frame for drowsiness detection."""
    img_data   = data.get("image")
    session_id = data.get("session_id") or data.get("driver_id") or "default"

    img = decode_base64_image(img_data)
    if img is None:
        emit("drowsiness_result", {"ok": False, "error": "Invalid image data"})
        return

    if not _dw_engine.ready:
        emit("drowsiness_result", {
            "ok":      False,
            "error":   "Drowsiness engine not loaded — check server logs.",
        })
        return

    result = _dw_engine.process_frame(img, session_id=session_id)
    emit("drowsiness_result", result)


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
        logger.exception("Drowsiness video analysis error: %s", exc)
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
    socketio.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=False
    )