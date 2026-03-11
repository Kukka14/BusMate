"""
Drowsiness Detection Engine
===========================
Three-model ensemble (matches reference predictor.py exactly):
  LSTM     (60%)  — temporal feature sequence  [EAR, MAR, pitch, yaw, IR_score]
  RGB CNN  (25%)  — MobileNetV3Small on full frame
  IR CNN   (15%)  — grayscale eye-state classifier

Feature extraction via MediaPipe FaceLandmarker (478 landmarks).
MinMax scaler fitted from nthu_features.csv — identical to training pipeline.

Alert fires when ensemble drowsy-probability > 0.6 for 5 consecutive frames
(same blink-filter logic as reference predictor.py).

Model files expected in:  backend/Drownsiness/
  lstm.h5              – 2-layer LSTM, input (None, 30, 5), output [alert_p, drowsy_p]
  rgb_cnn.keras        – MobileNetV3Small, input (None, 224, 224, 3)  [prefer .keras]
  rgb_cnn.h5           – fallback if .keras absent
  ir_cnn.h5            – custom CNN, output [alert_p, drowsy_p]
  face_landmarker.task – MediaPipe Tasks API model (478 landmarks)
  nthu_features.csv    – training features CSV for MinMaxScaler
"""

import logging
import math
import threading
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ─── Model directory ──────────────────────────────────────────────────────────
_MODEL_DIR = Path(__file__).resolve().parent / "Drownsiness"

# ─── Landmark IDs (MediaPipe 478-landmark canonical mesh) ─────────────────────
# Identical to reference system's feature_extractor.py
_LEFT_EYE  = [362, 385, 387, 263, 373, 380]
_RIGHT_EYE = [33,  160, 158, 133, 153, 144]

# Mouth landmarks — 4-point MAR (same as reference)
_MOUTH_V1 = 82;  _MOUTH_V2 = 87;  _MOUTH_V3 = 312; _MOUTH_V4 = 317
_MOUTH_LEFT = 78; _MOUTH_RIGHT = 308

# 6 stable landmarks for head-pose solvePnP
# nose tip, chin, l-eye outer, r-eye outer, l-mouth corner, r-mouth corner
_POSE_IDS = [1, 152, 226, 446, 57, 287]

# ─── Canonical 3-D face model for solvePnP (mm) ───────────────────────────────
# Exact values from reference feature_extractor.py
_FACE_3D = np.array([
    [  0.0,    0.0,     0.0  ],   # 1   — nose tip
    [  0.0, -330.0,   -65.0 ],   # 152 — chin
    [-165.0,  170.0, -135.0 ],   # 226 — left-eye outer
    [ 165.0,  170.0, -135.0 ],   # 446 — right-eye outer
    [-150.0, -150.0, -125.0 ],   # 57  — left mouth corner
    [ 150.0, -150.0, -125.0 ],   # 287 — right mouth corner
], dtype=np.float64)

# ─── Scaler — fitted from nthu_features.csv (same as reference) ───────────────
_SCALER    = None   # set during DrowsinessEngine._load()
_FEAT_COLS = ['EAR', 'MAR', 'pitch', 'yaw', 'IR_score']

# ─── Ensemble weights — exactly match reference predictor.py ──────────────────
_W_LSTM = 0.60   # LSTM temporal model   (dominant — 99.95 % acc in reference)
_W_RGB  = 0.25   # RGB CNN (MobileNetV3)
_W_IR   = 0.15   # IR CNN (grayscale eye-state)

# ─── Decision thresholds — exactly match reference predictor.py ───────────────
_DROWSY_LABEL_THR = 0.5   # ensemble score > 0.5 → "Drowsy" verdict  (argmax equiv.)
_ALERT_CONF_THR   = 0.6   # streak increments only when score > 0.6
_CONSECUTIVE_THR  = 5     # consecutive confident drowsy frames before alert fires

_LSTM_SEQ_LEN  = 30       # frames per LSTM input window
_LSTM_FEAT_DIM = 5        # [EAR, MAR, pitch, yaw, IR_score]


# =============================================================================
class DrowsinessEngine:
    """
    Thread-safe drowsiness detection engine — mirrors reference predictor.py.

    Typical usage (module-level singleton in app.py):
        _dw = DrowsinessEngine()
        result = _dw.process_frame(img_bgr, session_id=request.sid)
    """

    def __init__(self) -> None:
        self._ready      = False
        self._lstm       = None
        self._rgb        = None
        self._ir         = None
        self._landmarker = None
        self._lock       = threading.Lock()   # guards model inference + landmark detection

        # Per-session runtime state
        # {session_id: {"feat_buf": deque(maxlen=30), "consec": int}}
        self._sessions: Dict[str, Dict] = {}
        self._sess_lock = threading.Lock()

        self._load()

    # ── Initialisation ─────────────────────────────────────────────────────────

    def _load(self) -> None:
        lstm_p = _MODEL_DIR / "lstm.h5"
        rgb_p  = _MODEL_DIR / "rgb_cnn.keras"
        ir_p   = _MODEL_DIR / "ir_cnn.h5"
        mp_p   = _MODEL_DIR / "face_landmarker.task"
        csv_p  = _MODEL_DIR / "nthu_features.csv"

        missing = [p.name for p in (lstm_p, ir_p, mp_p) if not p.exists()]
        if missing:
            logger.warning(
                "⚠  Drowsiness models missing (%s) — endpoints disabled.", missing
            )
            return

        try:
            import tensorflow as tf
            tf.get_logger().setLevel("ERROR")
            from tensorflow.keras.models import load_model

            self._lstm = load_model(str(lstm_p))
            self._ir   = load_model(str(ir_p))

            # RGB CNN — try .keras first, then fall back to .h5
            rgb_h5 = _MODEL_DIR / "rgb_cnn.h5"
            if rgb_p.exists():
                self._rgb = load_model(str(rgb_p))
            elif rgb_h5.exists():
                self._rgb = load_model(str(rgb_h5))
            else:
                logger.warning("⚠  rgb_cnn not found — RGB model disabled.")
                self._rgb = None

            # Warm-up — eliminates first-call latency spike
            self._lstm.predict(
                np.zeros((1, _LSTM_SEQ_LEN, _LSTM_FEAT_DIM), np.float32), verbose=0
            )
            if self._rgb:
                self._rgb.predict(np.zeros((1, 224, 224, 3), np.float32), verbose=0)
            self._ir.predict(np.zeros((1, 64, 64, 1), np.float32), verbose=0)

            # MediaPipe FaceLandmarker (Tasks API, mediapipe >= 0.10)
            import mediapipe as mp
            from mediapipe.tasks.python import vision as mpv
            from mediapipe.tasks.python.core.base_options import BaseOptions

            opts = mpv.FaceLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(mp_p)),
                num_faces=1,
                min_face_detection_confidence=0.5,
                min_face_presence_confidence=0.5,
                min_tracking_confidence=0.5,
                output_face_blendshapes=False,              # not used in reference
                output_facial_transformation_matrixes=False,
            )
            self._landmarker = mpv.FaceLandmarker.create_from_options(opts)

            # Fit MinMaxScaler from training CSV — same approach as reference
            global _SCALER
            _SCALER = self._fit_scaler(csv_p)

            self._ready = True
            print("✅ Drowsiness engine ready — LSTM(60%) + RGB-CNN(25%) + IR-CNN(15%).")

        except Exception as exc:
            logger.exception("⚠  Drowsiness engine failed to load: %s", exc)

    @staticmethod
    def _fit_scaler(csv_p: Path):
        """Fit MinMaxScaler on nthu_features.csv — identical to reference _fit_scaler."""
        from sklearn.preprocessing import MinMaxScaler
        sc = MinMaxScaler()
        if csv_p.exists():
            try:
                import pandas as pd
                df = pd.read_csv(str(csv_p))
                sc.fit(df[_FEAT_COLS].values)
                print(f'[DrowsinessEngine] Scaler fitted on {len(df)} CSV rows.')
                return sc
            except Exception as e:
                print(f'[DrowsinessEngine] WARNING: CSV scaler failed ({e}) — using identity.')
        # Fallback: identity scaler (no scaling)
        sc.fit(np.zeros((2, len(_FEAT_COLS))))
        return sc

    # ── Session state ───────────────────────────────────────────────────────────

    def _session(self, sid: str) -> Dict:
        with self._sess_lock:
            if sid not in self._sessions:
                self._sessions[sid] = {
                    "feat_buf": deque(maxlen=_LSTM_SEQ_LEN),
                    "consec":   0,
                }
            return self._sessions[sid]

    def reset_session(self, sid: str) -> None:
        """Clear accumulated state for a session (call on session end)."""
        with self._sess_lock:
            self._sessions.pop(sid, None)

    # ── Feature extraction ──────────────────────────────────────────────────────

    @staticmethod
    def _lmdist(a, b) -> float:
        """Euclidean distance between two NormalizedLandmark objects."""
        return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)

    @classmethod
    def _ear(cls, lm: Any, indices: List[int]) -> float:
        """Eye Aspect Ratio — identical formula to reference feature_extractor.py."""
        p = [lm[i] for i in indices]
        v1 = cls._lmdist(p[1], p[5])
        v2 = cls._lmdist(p[2], p[4])
        h  = cls._lmdist(p[0], p[3])
        return (v1 + v2) / (2.0 * h + 1e-6)

    @classmethod
    def _mar(cls, lm: Any) -> float:
        """Mouth Aspect Ratio — 4-point formula, identical to reference."""
        v1 = cls._lmdist(lm[_MOUTH_V1], lm[_MOUTH_V4])
        v2 = cls._lmdist(lm[_MOUTH_V2], lm[_MOUTH_V3])
        h  = cls._lmdist(lm[_MOUTH_LEFT], lm[_MOUTH_RIGHT])
        return (v1 + v2) / (2.0 * h + 1e-6)

    def _extract_features(
        self,
        landmarks: Any,
        img_h: int,
        img_w: int,
    ) -> Tuple[float, float, float, float]:
        """Return (EAR, MAR, pitch_deg, yaw_deg).
        Identical math to reference feature_extractor.py.
        """
        # EAR — average of both eyes
        ear = (self._ear(landmarks, _LEFT_EYE) + self._ear(landmarks, _RIGHT_EYE)) / 2.0

        # MAR
        mar = self._mar(landmarks)

        # Head pose via solvePnP
        pts_2d = np.array(
            [[landmarks[i].x * img_w, landmarks[i].y * img_h] for i in _POSE_IDS],
            dtype=np.float64)
        cam  = np.array([[img_w, 0, img_w / 2],
                         [0, img_w, img_h / 2],
                         [0,     0,          1]], dtype=np.float64)
        dist = np.zeros((4, 1))
        ok, rvec, _ = cv2.solvePnP(_FACE_3D, pts_2d, cam, dist,
                                    flags=cv2.SOLVEPNP_ITERATIVE)
        pitch = yaw = 0.0
        if ok:
            rmat, _ = cv2.Rodrigues(rvec)
            sy = math.sqrt(rmat[0, 0] ** 2 + rmat[1, 0] ** 2)
            if sy > 1e-6:
                pitch = math.degrees(math.atan2(-rmat[2, 0], sy))
                yaw   = math.degrees(math.atan2(rmat[2, 1], rmat[2, 2]))
            else:
                pitch = math.degrees(math.atan2(-rmat[1, 2], rmat[1, 1]))

        return float(ear), float(mar), float(pitch), float(yaw)

    # ── Preprocessing ──────────────────────────────────────────────────────────

    @staticmethod
    def _scale_feats(ear: float, mar: float, pitch: float, yaw: float) -> np.ndarray:
        """Scale [EAR, MAR, pitch, yaw, IR_score=0.0] with the fitted MinMaxScaler.
        IR_score is always 0.0 (no IR sensor on webcam) — same as reference.
        """
        raw = np.array([[ear, mar, pitch, yaw, 0.0]], dtype=np.float32)
        if _SCALER is not None:
            return _SCALER.transform(raw)[0].astype(np.float32)
        return raw[0]

    @staticmethod
    def _prep_rgb(bgr: np.ndarray) -> np.ndarray:
        """BGR → RGB, resize 224×224, /255.
        Full frame (not face crop) — identical to reference _run_rgb.
        Note: preprocess_input is baked into the model architecture itself,
              so external preprocessing is /255 only (same as reference).
        """
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        rgb = cv2.resize(rgb, (224, 224), interpolation=cv2.INTER_LINEAR)
        return (rgb.astype(np.float32) / 255.0)[np.newaxis]   # (1, 224, 224, 3)

    @staticmethod
    def _prep_ir(bgr: np.ndarray) -> np.ndarray:
        """BGR → grayscale, resize 64×64, /255.
        Full frame — identical to reference _run_ir.
        """
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_LINEAR)
        return (gray.astype(np.float32) / 255.0)[np.newaxis, :, :, np.newaxis]  # (1,64,64,1)

    def _run_cnn(self, bgr: np.ndarray) -> Tuple[Optional[float], float]:
        """Run RGB CNN and IR CNN on the full frame.

        Both CNNs produce a 2-class softmax [alert_p, drowsy_p].
        drowsy_p = probs[1] — identical to reference _make_result with argmax.

        Returns (rgb_drowsy_p, ir_drowsy_p).
        rgb_drowsy_p is None when RGB CNN is unavailable.
        """
        with self._lock:
            # IR CNN: [alert_p, drowsy_p] — drowsy is index 1
            ir_probs = self._ir.predict(self._prep_ir(bgr), verbose=0)[0]
            ir_p = float(ir_probs[1]) if len(ir_probs) > 1 else float(ir_probs[0])

            rgb_p: Optional[float] = None
            if self._rgb is not None:
                rgb_probs = self._rgb.predict(self._prep_rgb(bgr), verbose=0)[0]
                rgb_p = float(rgb_probs[1]) if len(rgb_probs) > 1 else float(rgb_probs[0])

        return rgb_p, ir_p

    # ── Ensemble ───────────────────────────────────────────────────────────────

    @staticmethod
    def _ensemble(
        lstm_p: Optional[float],
        rgb_p: Optional[float],
        ir_p: float,
    ) -> float:
        """Weighted ensemble — 3 models, matches reference _run_fusion weights.

        Reference weights: LSTM(0.60) + RGB(0.25) + IR(0.15) = 1.00
        Gracefully renormalises when LSTM is warming up (<30 frames) or RGB is missing.
        """
        # All 3 models available — reference case
        if lstm_p is not None and rgb_p is not None:
            return _W_LSTM * lstm_p + _W_RGB * rgb_p + _W_IR * ir_p

        # LSTM still warming up (<30 frames) — redistribute its weight to RGB + IR
        if lstm_p is None and rgb_p is not None:
            w = _W_RGB + _W_IR
            return (_W_RGB * rgb_p + _W_IR * ir_p) / w

        # RGB CNN disabled / missing
        if lstm_p is not None:
            w = _W_LSTM + _W_IR
            return (_W_LSTM * lstm_p + _W_IR * ir_p) / w

        # Only IR available (edge case fallback)
        return ir_p

    # ── Public API ─────────────────────────────────────────────────────────────

    @property
    def ready(self) -> bool:
        return self._ready

    def process_frame(
        self,
        img_bgr: np.ndarray,
        session_id: str = "default",
    ) -> Dict[str, Any]:
        """Analyse a single BGR video frame.

        Returns:
            ok                  bool
            face_detected       bool
            verdict             "Alert" | "Drowsy"
            confidence          float  (ensemble drowsy probability)
            alert               bool   (consecutive confident frames >= 5)
            consecutive_frames  int
            models              {lstm, rgb, ir}  — per-model drowsy probabilities
            features            {ear, mar, pitch, yaw}
            bbox                {x, y, w, h} in pixels  |  None
        """
        if not self._ready:
            return {"ok": False, "error": "Drowsiness engine not loaded"}

        h, w = img_bgr.shape[:2]

        # ── MediaPipe: detect 478 face landmarks ──────────────────────────────
        import mediapipe as mp
        rgb_mp = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_mp)

        with self._lock:
            detection = self._landmarker.detect(mp_img)

        state = self._session(session_id)

        _no_model = {"drowsy_prob": 0.0, "available": False}

        if not detection.face_landmarks:
            # No face — reset consecutive counter, return safe defaults
            state["consec"] = 0
            return {
                "ok":                 True,
                "face_detected":      False,
                "verdict":            "Alert",
                "confidence":         0.0,
                "alert":              False,
                "consecutive_frames": 0,
                "models": {
                    "lstm": _no_model,
                    "rgb":  _no_model,
                    "ir":   _no_model,
                },
                "features": {
                    "ear": None, "mar": None, "pitch": None, "yaw": None,
                },
                "bbox": None,
            }

        landmarks = detection.face_landmarks[0]

        # ── Bounding box from landmark extents ────────────────────────────────
        xs = [lm.x * w for lm in landmarks]
        ys = [lm.y * h for lm in landmarks]
        x1 = max(0, int(min(xs)));  y1 = max(0, int(min(ys)))
        x2 = min(w, int(max(xs)));  y2 = min(h, int(max(ys)))
        bbox = {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1}

        # ── Feature extraction ────────────────────────────────────────────────
        ear, mar, pitch, yaw = self._extract_features(landmarks, h, w)

        # ── CNN inference on full frame ───────────────────────────────────────
        rgb_p, ir_p = self._run_cnn(img_bgr)

        # ── Build LSTM feature vector and push into rolling buffer ────────────
        # IR_score is always 0.0 (no IR sensor on webcam) — same as reference
        feat_vec = self._scale_feats(ear, mar, pitch, yaw)
        state["feat_buf"].append(feat_vec)

        # ── LSTM inference (needs full 30-frame buffer) ───────────────────────
        lstm_p: Optional[float] = None
        if len(state["feat_buf"]) == _LSTM_SEQ_LEN:
            with self._lock:
                seq    = np.array(state["feat_buf"], dtype=np.float32)[np.newaxis]
                lstm_p = float(self._lstm.predict(seq, verbose=0)[0][1])

        # ── Weighted ensemble ─────────────────────────────────────────────────
        score = self._ensemble(lstm_p, rgb_p, ir_p)

        # ── Verdict (argmax-equivalent: drowsy when ensemble score > 0.5) ─────
        verdict = "Drowsy" if score > _DROWSY_LABEL_THR else "Alert"

        # ── Consecutive-frame alert filter (matches reference predictor.py) ───
        # Streak increments only when CONFIDENT drowsy (score > 0.6).
        # A normal blink lasts ~2-4 frames @10 fps; 5 frames ≈ 500 ms min.
        if verdict == "Drowsy" and score > _ALERT_CONF_THR:
            state["consec"] += 1
        else:
            state["consec"] = 0

        return {
            "ok":                 True,
            "face_detected":      True,
            "verdict":            verdict,
            "confidence":         round(score, 4),
            "alert":              state["consec"] >= _CONSECUTIVE_THR,
            "consecutive_frames": state["consec"],
            "models": {
                "lstm": {"drowsy_prob": round(lstm_p, 4), "available": True}
                        if lstm_p is not None
                        else {"drowsy_prob": 0.0, "available": False},
                "rgb":  {"drowsy_prob": round(rgb_p, 4), "available": True}
                        if rgb_p is not None
                        else {"drowsy_prob": 0.0, "available": False},
                "ir":   {"drowsy_prob": round(ir_p, 4), "available": True},
            },
            "features": {
                "ear":   round(ear,   4),
                "mar":   round(mar,   4),
                "pitch": round(pitch, 2),
                "yaw":   round(yaw,   2),
            },
            "bbox": bbox,
        }

    def process_video(
        self,
        video_path: str,
        sample_every: int = 3,
    ) -> Dict[str, Any]:
        """Analyse a video file for drowsiness events.

        Skips the first LSTM_SEQ_LEN processed frames (LSTM warm-up window).
        Uses a dedicated session ID so it never pollutes live-session state.

        Returns:
            ok            bool
            total_frames  int   — total raw frames in video
            analyzed      int   — frames actually scored (after warm-up)
            drowsy_frames int
            drowsy_pct    float
            alert_events  list  — de-duplicated alert timestamps
            timeline      list  — per-frame records
            summary       dict  — high-level verdict and stats
        """
        if not self._ready:
            return {"ok": False, "error": "Drowsiness engine not loaded"}

        SID = "__video_analysis__"
        self.reset_session(SID)

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {"ok": False, "error": "Cannot open video file"}

        fps_src   = cap.get(cv2.CAP_PROP_FPS) or 30.0
        raw_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        timeline:     List[Dict] = []
        alert_events: List[Dict] = []
        frame_raw       = 0
        frame_processed = 0
        drowsy_count    = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                frame_raw += 1
                if frame_raw % sample_every != 0:
                    continue

                res = self.process_frame(frame, SID)
                frame_processed += 1

                # Exclude LSTM warm-up period from results
                if frame_processed <= _LSTM_SEQ_LEN:
                    continue

                ts = round(frame_raw / fps_src, 2)
                timeline.append({
                    "frame":      frame_raw,
                    "ts":         ts,
                    "verdict":    res.get("verdict"),
                    "confidence": res.get("confidence"),
                    "alert":      res.get("alert"),
                    "face":       res.get("face_detected"),
                    "models":     res.get("models"),
                    "features":   res.get("features"),
                })

                if res.get("verdict") == "Drowsy":
                    drowsy_count += 1

                # De-duplicate alert events — require >= 2 s gap between entries
                if res.get("alert") and (
                    not alert_events
                    or abs(ts - alert_events[-1]["ts"]) >= 2.0
                ):
                    alert_events.append({
                        "ts":         ts,
                        "frame":      frame_raw,
                        "confidence": res["confidence"],
                    })

        finally:
            cap.release()
            self.reset_session(SID)

        total_analyzed = len(timeline)
        drowsy_pct     = round(drowsy_count / max(1, total_analyzed) * 100, 1)
        duration_sec   = round(raw_total / fps_src, 1)

        return {
            "ok":            True,
            "total_frames":  raw_total,
            "analyzed":      total_analyzed,
            "drowsy_frames": drowsy_count,
            "drowsy_pct":    drowsy_pct,
            "alert_events":  alert_events,
            "timeline":      timeline,
            "summary": {
                "verdict":      "Drowsy" if drowsy_pct >= 30.0 else "Alert",
                "drowsy_pct":   drowsy_pct,
                "alert_count":  len(alert_events),
                "fps_source":   round(fps_src, 1),
                "duration_sec": duration_sec,
            },
        }
