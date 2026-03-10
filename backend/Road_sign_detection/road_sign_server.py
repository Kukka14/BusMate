"""
Road Sign Detection API  –  Flask server on port 5001
=======================================================
Endpoints
  POST /upload              – analyse an image or video file
  GET  /video_feed          – MJPEG live-webcam stream (starts camera lazily)
  GET  /get_detection_info  – latest YOLO detection from the webcam
  POST /capture_webcam      – capture current frame & run full ensemble
  GET  /stop_camera         – stop webcam
"""

from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import cv2, base64, json, numpy as np, threading, tempfile, os, time
from pathlib import Path
from ultralytics import YOLO
from tensorflow import keras
from tensorflow.keras import layers
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

app = Flask(__name__)
CORS(app)

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
W        = BASE_DIR / "Weight"

YOLO_DETECT_PATH     = W / "Detect_Model/RoadSignDetector_v22/weights/best.pt"
MOBILENET_PATH       = W / "mobilenet_weights/Mobilenetv2_Retrain_weight/phase2_epoch_015.weights.h5"
CUSTOM_MODEL_PATH    = W / "Custom_model2_weights/epoch_026.weights.h5"
YOLO_CLASSIFIER_PATH = W / "YOLO8/YOLOv8_Classifier/weights/best.pt"
CLASS_MAPPING_PATH   = W / "Custom_model2_weights/class_mapping.json"

# ── Config ─────────────────────────────────────────────────────────────────────
IMG_SIZE          = 224
MARGIN_RATIO      = 0.15
NORMAL_THRESHOLD  = 0.75
DAMAGED_THRESHOLD = 0.40
SAMPLE_EVERY      = 30   # video frames: analyse 1 of every 30
MAX_DETECTIONS    = 20   # cap at 20 detected frames per video


# ── Load models ────────────────────────────────────────────────────────────────
print("⏳ Loading models…")

detector = YOLO(str(YOLO_DETECT_PATH))
print("  ✅ YOLO Detection Model")

with open(CLASS_MAPPING_PATH) as f:
    class_indices = json.load(f)

index_to_class = {v: k for k, v in class_indices.items()}
NUM_CLASSES     = len(class_indices)

# ── MobileNetV2 ─────────────────────────────────────────────────────────────
def build_mobilenet():
    base = keras.applications.MobileNetV2(
        input_shape=(IMG_SIZE, IMG_SIZE, 3), include_top=False, weights=None
    )
    x = layers.GlobalAveragePooling2D()(base.output)
    x = layers.Dense(256, activation="relu")(x)
    x = layers.Dropout(0.5)(x)
    return keras.Model(inputs=base.input, outputs=layers.Dense(NUM_CLASSES, activation="softmax")(x))

mobilenet_model = build_mobilenet()
mobilenet_model.load_weights(str(MOBILENET_PATH))
print("  ✅ MobileNetV2")

# ── Custom ResNet-like ───────────────────────────────────────────────────────
def _conv_block(x, filters, stride=1):
    sc = x
    x  = layers.Conv2D(filters,(3,3),strides=stride,padding="same",use_bias=False)(x)
    x  = layers.BatchNormalization()(x); x = layers.ReLU()(x)
    x  = layers.Conv2D(filters,(3,3),padding="same",use_bias=False)(x)
    x  = layers.BatchNormalization()(x)
    if stride != 1 or sc.shape[-1] != filters:
        sc = layers.Conv2D(filters,(1,1),strides=stride,padding="same",use_bias=False)(sc)
        sc = layers.BatchNormalization()(sc)
    return layers.ReLU()(layers.Add()([x, sc]))

def _dw_block(x, filters, stride=1):
    sc = x
    x  = layers.DepthwiseConv2D((3,3),strides=stride,padding="same",use_bias=False)(x)
    x  = layers.BatchNormalization()(x); x = layers.ReLU()(x)
    x  = layers.Conv2D(filters,(1,1),padding="same",use_bias=False)(x)
    x  = layers.BatchNormalization()(x)
    if stride == 1 and sc.shape[-1] == filters:
        x = layers.Add()([x, sc])
    return layers.ReLU()(x)

def build_custom():
    inp = keras.Input(shape=(224, 224, 3))
    x = layers.Conv2D(32,(3,3),strides=2,padding="same",use_bias=False)(inp)
    x = layers.BatchNormalization()(x); x = layers.ReLU()(x)
    x = _conv_block(x,64);  x = _conv_block(x,64)
    x = _conv_block(x,128,stride=2); x = _conv_block(x,128)
    x = _dw_block(x,256,stride=2);  x = _dw_block(x,256)
    x = _dw_block(x,512,stride=2);  x = _dw_block(x,512)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.BatchNormalization()(x); x = layers.Dropout(0.6)(x)
    x = layers.Dense(512, activation="relu")(x)
    x = layers.BatchNormalization()(x); x = layers.Dropout(0.5)(x)
    return keras.Model(inp, layers.Dense(NUM_CLASSES, activation="softmax")(x))

custom_model = build_custom()
custom_model.load_weights(str(CUSTOM_MODEL_PATH))
print("  ✅ Custom Model")

yolo_classifier = YOLO(str(YOLO_CLASSIFIER_PATH))
print("  ✅ YOLOv8 Classifier")
print("✅ All models ready.\n")


# ── Image utilities ────────────────────────────────────────────────────────────
def img_to_b64(img: np.ndarray) -> str:
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()

def sharpen_image(img: np.ndarray) -> np.ndarray:
    g = cv2.GaussianBlur(img, (9, 9), 10)
    return cv2.addWeighted(img, 1.5, g, -0.5, 0)

def apply_clahe(img: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    cl = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((cl, a, b)), cv2.COLOR_LAB2BGR)


# ── Model predictions ──────────────────────────────────────────────────────────
def mobilenet_predict(crop: np.ndarray) -> np.ndarray:
    img = cv2.resize(crop, (IMG_SIZE, IMG_SIZE))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype("float32")
    return mobilenet_model.predict(np.expand_dims(preprocess_input(img), 0), verbose=0)[0]

def custom_predict(crop: np.ndarray) -> np.ndarray:
    img = cv2.resize(crop, (IMG_SIZE, IMG_SIZE))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype("float32") / 255.0
    return custom_model.predict(np.expand_dims(img, 0), verbose=0)[0]

def yolo_predict(crop: np.ndarray) -> np.ndarray:
    res = yolo_classifier.predict(cv2.resize(crop, (IMG_SIZE, IMG_SIZE)), verbose=False)
    return res[0].probs.data.cpu().numpy()

def ensemble_predict(crop: np.ndarray):
    ens = (mobilenet_predict(crop) + custom_predict(crop) + yolo_predict(crop)) / 3
    idx  = int(np.argmax(ens))
    return index_to_class[idx], float(ens[idx])


# ── Full pipeline ──────────────────────────────────────────────────────────────
def process_frame(frame: np.ndarray):
    """Detect → crop → ensemble classify → return result dict or None."""
    original = frame.copy()
    res_det  = detector(frame, conf=0.25, verbose=False)
    boxes    = res_det[0].boxes

    if len(boxes) == 0:
        return None

    best = max(boxes, key=lambda b: float(b.conf[0]))
    x1, y1, x2, y2 = best.xyxy[0].cpu().numpy().astype(int)

    # Add margin
    w, h  = x2 - x1, y2 - y1
    mx, my = int(w * MARGIN_RATIO), int(h * MARGIN_RATIO)
    x1, y1 = max(0, x1 - mx), max(0, y1 - my)
    x2, y2 = min(frame.shape[1], x2 + mx), min(frame.shape[0], y2 + my)
    crop    = frame[y1:y2, x1:x2]

    # Evaluate 3 versions – pick highest confidence
    candidates = []
    for c in [crop, sharpen_image(crop), apply_clahe(crop)]:
        cls, conf = ensemble_predict(c)
        candidates.append((c, cls, conf))
    best_crop, class_name, confidence = max(candidates, key=lambda v: v[2])

    status = (
        "Normal"           if confidence >= NORMAL_THRESHOLD  else
        "Damaged"          if confidence < DAMAGED_THRESHOLD  else
        "Possibly unclear"
    )
    color = (0, 255, 0) if status == "Normal" else (0, 0, 255)

    # Draw on detected image
    det = original.copy()
    cv2.rectangle(det, (x1, y1), (x2, y2), color, 3)
    label_str = f"{class_name.replace('_', ' ')} ({confidence:.2f})"
    cv2.putText(det, label_str, (x1, max(14, y1 - 10)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, color, 2)

    # Annotate cropped sign
    crop_disp = best_crop.copy()
    cv2.putText(crop_disp, class_name.replace("_", " "), (8, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

    return {
        "detected":       True,
        "original":       img_to_b64(original),
        "detected_image": img_to_b64(det),
        "crop":           img_to_b64(crop_disp),
        "class_name":     class_name,
        "confidence":     f"{confidence * 100:.1f}%",
        "status":         status,
    }


# ── Webcam state (shared between threads) ─────────────────────────────────────
_cam_lock    = threading.Lock()
_cap         = None          # cv2.VideoCapture
_cam_running = False
_latest_raw  = None          # latest raw BGR frame (for capture)
_latest_ann  = None          # latest annotated frame (for MJPEG)
_latest_info = {}            # {class_name, confidence, status}


def _cam_worker():
    global _latest_raw, _latest_ann, _latest_info, _cam_running
    while _cam_running:
        with _cam_lock:
            if _cap is None:
                break
            ret, frame = _cap.read()

        if not ret:
            time.sleep(0.02)
            continue

        _latest_raw = frame.copy()
        ann = frame.copy()

        # Fast live detection: custom YOLO detector + YOLOv8 classifier only
        res_det = detector(frame, conf=0.25, verbose=False)
        boxes   = res_det[0].boxes

        if len(boxes) > 0:
            best = max(boxes, key=lambda b: float(b.conf[0]))
            x1, y1, x2, y2 = best.xyxy[0].cpu().numpy().astype(int)
            crop = frame[y1:y2, x1:x2]

            try:
                r     = yolo_classifier.predict(
                            cv2.resize(crop, (IMG_SIZE, IMG_SIZE)), verbose=False
                        )
                probs = r[0].probs.data.cpu().numpy()
                cls   = index_to_class[int(np.argmax(probs))]
                conf  = float(np.max(probs))
            except Exception:
                cls, conf = "Road Sign", float(best.conf[0])

            status = (
                "Normal"           if conf >= NORMAL_THRESHOLD  else
                "Damaged"          if conf < DAMAGED_THRESHOLD  else
                "Possibly unclear"
            )
            color = (0, 255, 0) if status == "Normal" else (0, 0, 255)

            cv2.rectangle(ann, (x1, y1), (x2, y2), color, 2)
            lbl = f"{cls.replace('_', ' ')} {conf * 100:.0f}%"
            tw  = len(lbl) * 9
            cv2.rectangle(ann, (x1, max(0, y1 - 24)), (x1 + tw, y1), (0, 0, 0), -1)
            cv2.putText(ann, lbl, (x1 + 3, max(14, y1 - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

            _latest_info = {"class_name": cls, "confidence": conf, "status": status}
        else:
            _latest_info = {}

        _latest_ann = ann
        time.sleep(0.01)  # ~100 fps max; actual rate limited by detection


def _start_camera() -> bool:
    global _cap, _cam_running
    if _cam_running:
        return True
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        return False
    with _cam_lock:
        _cap = cap
    _cam_running = True
    threading.Thread(target=_cam_worker, daemon=True).start()
    return True


def _stop_camera():
    global _cap, _cam_running
    _cam_running = False
    time.sleep(0.15)
    with _cam_lock:
        if _cap:
            _cap.release()
            _cap = None


def _gen_mjpeg():
    while _cam_running:
        frame = _latest_ann
        if frame is None:
            time.sleep(0.03)
            continue
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 78])
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + buf.tobytes()
            + b"\r\n"
        )
        time.sleep(0.033)   # cap at ~30 fps


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/upload", methods=["POST"])
def upload():
    file       = request.files.get("file")
    input_type = request.form.get("input_type", "image")

    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    # ── Image ──────────────────────────────────────────────────────────────────
    if input_type == "image":
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            file.save(tmp.name)
            path = tmp.name
        frame = cv2.imread(path)
        try:
            os.unlink(path)
        except OSError:
            pass
        if frame is None:
            return jsonify({"error": "Could not read image"}), 400
        result = process_frame(frame)
        if not result:
            return jsonify({"detected": False, "message": "No road sign detected."})
        result["input_type"] = "image"
        return jsonify(result)

    # ── Video ──────────────────────────────────────────────────────────────────
    if input_type == "video":
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            file.save(tmp.name)
            path = tmp.name

        results_list = []
        cap = cv2.VideoCapture(path)
        fi  = 0
        try:
            while cap.isOpened() and len(results_list) < MAX_DETECTIONS:
                ret, frame = cap.read()
                if not ret:
                    break
                if fi % SAMPLE_EVERY == 0:
                    r = process_frame(frame)
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
def video_feed():
    if not _start_camera():
        return "Cannot open camera", 500
    return Response(
        _gen_mjpeg(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


@app.route("/get_detection_info")
def get_detection_info():
    return jsonify(_latest_info)


@app.route("/capture_webcam", methods=["POST"])
def capture_webcam():
    frame = _latest_raw
    if frame is None:
        return jsonify({"error": "Camera not active – no frame available"}), 400
    result = process_frame(frame)
    if not result:
        return jsonify({"detected": False, "message": "No road sign in current frame."})
    result["input_type"] = "webcam"
    return jsonify(result)


@app.route("/stop_camera")
def stop_camera_route():
    _stop_camera()
    return jsonify({"stopped": True})


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False, threaded=True)
