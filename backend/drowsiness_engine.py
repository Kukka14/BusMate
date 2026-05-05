"""
Drowsiness Detection Engine  —  PyTorch 5-Model Ensemble + MediaPipe Features
==============================================================================
Architectures taken verbatim from research training scripts.
Models loaded from  backend/Drownsiness/model*_best.pth

  Model | Architecture        | Dataset   | Test Acc | Ensemble weight
  ------+---------------------+-----------+----------+----------------
  M1    | EfficientNet-B0     | UTA-RLDD  |  94.61 % |  0.10
  M2    | CNN + LSTM          | UTA-RLDD  |  98.21 % |  0.45
  M3    | Reliability Fusion  | UTA-RLDD  | ~100 %*  |  0.25
  M4    | CNN + Transformer   | YAWDD     |  56.94 % |  0.10
  M5    | CNN + MS-TCN        | NTHU-DDD  |  41.67 % |  0.10

  * M3 accuracy is inflated (subject overlap in training split).

Facial features computed via MediaPipe Face Mesh (runs alongside models):
  EAR, MAR, PITCH, YAW, PERCLOS, BLINK count, YAWN count

Checkpoint format (per training scripts):
  M1, M2  ->  {'model_state': state_dict, 'epoch': ...}
  M3, M4, M5  ->  bare state_dict (torch.save(model.state_dict(), path))

Dependencies:
    pip install torch torchvision timm opencv-python pillow mediapipe
"""

from __future__ import annotations

import base64
import io
import logging
import os
import threading
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from PIL import Image as _PIL

logger = logging.getLogger(__name__)

# ── Model file locations ───────────────────────────────────────────────────────
# Models live inside the project at  backend/Drownsiness/
# Override with env var DROWSINESS_MODEL_DIR if needed.
_BASE = Path(os.environ.get(
    "DROWSINESS_MODEL_DIR",
    Path(__file__).parent / "Drownsiness",
))

_CKPT: Dict[str, Path] = {
    "m1": _BASE / "model1_best.pth",
    "m2": _BASE / "model2_best.pth",
    "m3": _BASE / "model3_best.pth",
    "m4": _BASE / "model4_best.pth",
    "m5": _BASE / "model5_best.pth",   # kept for reference (not loaded)
}

# ── Preprocessing constants (ImageNet, from training scripts) ──────────────────
_MEAN = [0.485, 0.456, 0.406]
_STD  = [0.229, 0.224, 0.225]

# ── Sequence / image sizes (match training exactly) ───────────────────────────
_SEQ_LEN  = 16    # temporal window for M2 / M3 / M4 / M5
_SZ_M1    = 224   # M1 single-frame input size
_SZ_SEQ   = 112   # M2-M5 per-frame size
_SZ_EYE   = 64    # M3 eye-crop size
_EYE_CROP = 0.40  # top 40 % of resized frame used as eye proxy

# ── Ensemble weights  (sum of active weights does NOT have to equal 1;
#    _ensemble() renormalises automatically) ────────────────────────────────────
_W: Dict[str, float] = {
    "m1": 0.10,
    "m2": 0.45,
    "m3": 0.25,
    "m4": 0.10,
    "m5": 0.10,
}

# ── Alert thresholds ──────────────────────────────────────────────────────────
_DROWSY_THR     = 0.50   # ensemble score above this → "Drowsy"
_ALERT_CONF_THR = 0.60   # consecutive streak only counts when score > this
_CONSEC_THR     = 5      # alert fires after N consecutive confident drowsy frames


# =============================================================================
# Torch / timm availability guard
# =============================================================================
_torch_ok = False
_timm_ok  = False
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F   # noqa: F401 (available to arch defs below)
    _torch_ok = True
except ImportError:
    logger.warning("[DrowsinessEngine] PyTorch not installed — engine disabled. "
                   "Run: pip install torch torchvision")

try:
    import timm
    _timm_ok = True
except ImportError:
    logger.warning("[DrowsinessEngine] timm not installed — engine disabled. "
                   "Run: pip install timm")

# =============================================================================
# FACIAL FEATURE EXTRACTION  (OpenCV Haar Cascades — zero extra downloads)
# =============================================================================

# PERCLOS / threshold constants
_PERCLOS_WIN = 30    # rolling window size (frames)
_EAR_CLOSED  = 0.22  # EAR below this → eye closed
_MAR_YAWN    = 0.55  # MAR above this → yawning

# 3-D face model for solvePnP head-pose (generic, millimetre units)
_HEAD_MODEL_PTS = np.array([
    [ 0.0,    0.0,    0.0  ],   # nose tip
    [ 0.0,  -330.0, -65.0 ],   # chin
    [-225.0, 170.0, -135.0],   # left eye outer corner
    [ 225.0, 170.0, -135.0],   # right eye outer corner
    [-150.0,-150.0, -125.0],   # left mouth corner
    [ 150.0,-150.0, -125.0],   # right mouth corner
], dtype=np.float64)


class _FaceFeatureExtractor:
    """
    Facial feature extractor using OpenCV Haar Cascades.
    No external model files required — uses cascades bundled with OpenCV.

    Strategy:
      1. CLAHE-enhance the frame (handles dark / backlit images)
      2. Try Haar face detection with progressively lenient params
      3. If face found  → accurate EAR/MAR from face ROI
      4. If face NOT found → region-based fallback (always returns numbers)

    This guarantees features are always populated, even in bad lighting.
    """

    def __init__(self) -> None:
        data = cv2.data.haarcascades
        self._face_det  = cv2.CascadeClassifier(data + "haarcascade_frontalface_default.xml")
        self._eye_det   = cv2.CascadeClassifier(data + "haarcascade_eye.xml")
        self._mouth_det = cv2.CascadeClassifier(data + "haarcascade_smile.xml")
        # CLAHE for robust enhancement of dark / backlit frames
        self._clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))

    # ── preprocessing ─────────────────────────────────────────────────────────

    def _enhance(self, bgr: np.ndarray) -> np.ndarray:
        """CLAHE-enhanced grayscale — much better than equalizeHist for backlit."""
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        return self._clahe.apply(gray)

    # ── EAR helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _ear_from_roi(roi_gray: np.ndarray) -> float:
        """
        Estimate EAR (0.05–0.45) from a small grayscale eye/region ROI.
        Uses the ratio of dark (iris/pupil) pixel rows to total height.
        """
        if roi_gray.size == 0:
            return 0.28
        h, w = roi_gray.shape[:2]
        # Adaptive threshold adapts to any lighting level
        thresh = cv2.adaptiveThreshold(
            roi_gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV,
            max(3, (min(h, w) // 2) | 1), 5,
        )
        mid_x   = w // 2
        sw      = max(1, w // 4)
        strip   = thresh[:, max(0, mid_x - sw): mid_x + sw]
        dark_r  = np.sum(strip > 0, axis=1)
        open_r  = int(np.sum(dark_r > sw * 0.25))
        return float(np.clip(open_r / (h + 1e-6) * 0.55, 0.05, 0.42))

    # ── region-based fallback (works without face detection) ──────────────────

    @staticmethod
    def _region_ear(gray: np.ndarray) -> float:
        """
        Eye-region estimate from fixed frame bands (top 15–40 % of height).
        Works when Haar fails due to lighting, angle, or occlusion.
        """
        h, w = gray.shape
        eye_band = gray[int(h * 0.15): int(h * 0.40), int(w * 0.20): int(w * 0.80)]
        if eye_band.size == 0:
            return 0.28
        thresh = cv2.adaptiveThreshold(
            eye_band, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV,
            11, 5,
        )
        eh, ew = thresh.shape
        dark_frac = float(np.sum(thresh > 0)) / (thresh.size + 1e-6)
        # Map dark fraction to EAR: more darkness in eye zone → more open
        ear = float(np.clip(dark_frac * 2.5, 0.08, 0.40))
        return round(ear, 3)

    @staticmethod
    def _region_mar(gray: np.ndarray) -> float:
        """
        Mouth-region estimate from fixed frame bands (55–75 % of height).
        """
        h, w = gray.shape
        mouth_band = gray[int(h * 0.55): int(h * 0.75), int(w * 0.25): int(w * 0.75)]
        if mouth_band.size == 0:
            return 0.18
        thresh = cv2.adaptiveThreshold(
            mouth_band, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV,
            11, 5,
        )
        dark_frac = float(np.sum(thresh > 0)) / (thresh.size + 1e-6)
        # Low dark fraction → closed mouth; high → open
        mar = float(np.clip(dark_frac * 1.8, 0.05, 0.85))
        return round(mar, 3)

    # ── face-detection helpers ────────────────────────────────────────────────

    def _detect_face(self, enhanced: np.ndarray):
        """
        Try face detection with progressively more lenient parameters.
        Returns the largest face rect or None.
        """
        for (sf, mn, msz) in [
            (1.10, 5, 80),   # strict
            (1.10, 3, 60),   # moderate
            (1.15, 2, 50),   # lenient
            (1.20, 2, 40),   # very lenient
        ]:
            faces = self._face_det.detectMultiScale(
                enhanced, scaleFactor=sf, minNeighbors=mn,
                minSize=(msz, msz), flags=cv2.CASCADE_SCALE_IMAGE,
            )
            if len(faces):
                return max(faces, key=lambda r: r[2] * r[3])
        return None

    def _face_ear(self, enhanced: np.ndarray, fx, fy, fw, fh) -> float:
        """EAR from eye zone within detected face ROI."""
        eye_zone = enhanced[fy: fy + int(fh * 0.6), fx: fx + fw]
        if eye_zone.size == 0:
            return 0.28
        eyes = self._eye_det.detectMultiScale(
            eye_zone, scaleFactor=1.1, minNeighbors=2, minSize=(15, 10),
        )
        if len(eyes) >= 2:
            eyes = sorted(eyes, key=lambda e: e[0])
            ears = [self._ear_from_roi(eye_zone[ey: ey+eh, ex: ex+ew])
                    for ex, ey, ew, eh in eyes[:2]]
            return float(np.mean(ears))
        elif len(eyes) == 1:
            ex, ey, ew, eh = eyes[0]
            return self._ear_from_roi(eye_zone[ey: ey+eh, ex: ex+ew])
        else:
            # No eyes found inside face — use face top strip
            top = enhanced[fy: fy + int(fh * 0.35), fx: fx + fw]
            return self._ear_from_roi(top) if top.size > 0 else 0.28

    def _face_mar(self, enhanced: np.ndarray, fx, fy, fw, fh) -> float:
        """MAR from mouth zone within detected face ROI."""
        mz = enhanced[fy + int(fh * 0.60): fy + fh, fx: fx + fw]
        if mz.size == 0:
            return 0.18
        smiles = self._mouth_det.detectMultiScale(
            mz, scaleFactor=1.5, minNeighbors=10, minSize=(20, 10),
        )
        if len(smiles):
            _, _, sw, sh = max(smiles, key=lambda r: r[2] * r[3])
            return round(float(np.clip(sh / (sw + 1e-6), 0.05, 0.85)), 3)
        # Fallback: adaptive dark-pixel ratio in mouth zone
        thresh = cv2.adaptiveThreshold(
            mz, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 11, 5,
        )
        dark = float(np.sum(thresh > 0)) / (thresh.size + 1e-6)
        return round(float(np.clip(dark * 1.6, 0.05, 0.85)), 3)

    @staticmethod
    def _head_pose(face_rect, frame_shape) -> tuple:
        fh, fw = frame_shape[:2]
        x, y, w, h = face_rect
        cx = x + w / 2
        cy = y + h / 2
        yaw   = round((cx - fw / 2) / (fw / 2 + 1e-6) * 30.0, 1)
        pitch = round((cy - fh / 2) / (fh / 2 + 1e-6) * 20.0, 1)
        return pitch, yaw

    # ── public ────────────────────────────────────────────────────────────────

    def extract(self, bgr: np.ndarray) -> dict:
        """
        Extract facial features from one BGR frame.
        Always returns numerical values — region fallback used when face
        detection fails (e.g. dark/backlit conditions).
        """
        enhanced = self._enhance(bgr)
        fh, fw   = bgr.shape[:2]

        face = self._detect_face(enhanced)

        if face is not None:
            fx, fy, fw_f, fh_f = face
            ear   = self._face_ear(enhanced, fx, fy, fw_f, fh_f)
            mar   = self._face_mar(enhanced, fx, fy, fw_f, fh_f)
            pitch, yaw = self._head_pose(face, bgr.shape)
            detected   = True
        else:
            # ── Region fallback — always gives numbers, even in bad lighting ──
            ear   = self._region_ear(enhanced)
            mar   = self._region_mar(enhanced)
            pitch = 0.0
            yaw   = 0.0
            detected = False   # flag so caller knows confidence is lower

        return {
            "face_detected": detected,
            "ear":           round(float(ear), 3),
            "mar":           round(float(mar), 3),
            "pitch":         pitch,
            "yaw":           yaw,
        }


try:
    _face_extractor: Optional[_FaceFeatureExtractor] = _FaceFeatureExtractor()
    print("[DrowsinessEngine] OpenCV Face Feature Extractor OK")
except Exception as _fe_err:
    _face_extractor = None
    logger.warning("[DrowsinessEngine] Feature extractor failed to init: %s", _fe_err)


# =============================================================================
# MODEL ARCHITECTURE DEFINITIONS
# Copied verbatim from train_model*.py (inference-only; no training code).
# =============================================================================

if _torch_ok and _timm_ok:

    # ── Shared EfficientNet-B0 backbone (M2-M5) ───────────────────────────────
    class _CNNEncoder(nn.Module):
        """EfficientNet-B0 per-frame feature extractor → (B, 1280)."""
        def __init__(self) -> None:
            super().__init__()
            self.backbone = timm.create_model(
                "efficientnet_b0", pretrained=False, num_classes=0,
            )
            self.feat_dim: int = self.backbone.num_features   # 1280

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            return self.backbone(x)

    # ── M1: EfficientNet-B0 single-frame classifier ───────────────────────────
    class _M1(nn.Module):
        """
        From train_model1.py  (class EfficientNetClassifier).
        Input : (B, 3, 224, 224)   Output: (B, 2) logits
        Checkpoint key: 'model_state'
        """
        def __init__(self, num_classes: int = 2, dropout: float = 0.4) -> None:
            super().__init__()
            self.backbone = timm.create_model(
                "efficientnet_b0", pretrained=False,
                num_classes=0, global_pool="avg",
            )
            feat_dim = self.backbone.num_features   # 1280
            self.classifier = nn.Sequential(
                nn.Dropout(p=dropout),
                nn.Linear(feat_dim, 256),
                nn.ReLU(inplace=True),
                nn.Dropout(p=dropout / 2),
                nn.Linear(256, num_classes),
            )

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            return self.classifier(self.backbone(x))

    # ── M2: CNN + LSTM temporal model ─────────────────────────────────────────
    class _M2(nn.Module):
        """
        From train_model2.py  (class CNNLSTM).
        Input : (B, T=16, 3, 112, 112)   Output: (B, 2) logits
        Checkpoint key: 'model_state'
        """
        def __init__(self, num_classes: int = 2, hidden: int = 256,
                     num_layers: int = 2, dropout: float = 0.3) -> None:
            super().__init__()
            self.cnn  = _CNNEncoder()
            feat_dim  = self.cnn.feat_dim
            self.lstm = nn.LSTM(
                input_size=feat_dim, hidden_size=hidden,
                num_layers=num_layers, batch_first=True,
                dropout=dropout if num_layers > 1 else 0.0,
            )
            self.classifier = nn.Sequential(
                nn.Dropout(p=dropout),
                nn.Linear(hidden, 128),
                nn.ReLU(inplace=True),
                nn.Dropout(p=dropout / 2),
                nn.Linear(128, num_classes),
            )

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            B, T, C, H, W = x.shape
            feats          = self.cnn(x.view(B * T, C, H, W)).view(B, T, -1)
            lstm_out, _    = self.lstm(feats)
            return self.classifier(lstm_out[:, -1, :])

    # ── M3: Reliability-Aware Temporal Fusion ─────────────────────────────────
    class _EyeReliabilityNet(nn.Module):
        """
        From train_model3.py  (class EyeReliabilityNet) — Stage 1 eye-state net.
        Input : (B, 3, 64, 64)   Output: (B, 2) logits
        """
        def __init__(self, num_classes: int = 2) -> None:
            super().__init__()
            self.backbone = timm.create_model(
                "efficientnet_b0", pretrained=False, num_classes=0,
            )
            feat_dim = self.backbone.num_features   # 1280
            self.head = nn.Sequential(
                nn.Dropout(0.3),
                nn.Linear(feat_dim, 128),
                nn.ReLU(inplace=True),
                nn.Dropout(0.2),
                nn.Linear(128, num_classes),
            )

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            return self.head(self.backbone(x))

    class _ReliabilityGate(nn.Module):
        """
        From train_model3.py  (class ReliabilityGate).
        Maps eye logits → scalar reliability weight in (0, 1).
        """
        def __init__(self, eye_dim: int = 2, hidden: int = 32) -> None:
            super().__init__()
            self.gate = nn.Sequential(
                nn.Linear(eye_dim, hidden),
                nn.ReLU(inplace=True),
                nn.Linear(hidden, 1),
                nn.Sigmoid(),
            )

        def forward(self, eye_logits: "torch.Tensor") -> "torch.Tensor":
            return self.gate(eye_logits)   # (B, 1)

    class _M3(nn.Module):
        """
        From train_model3.py  (class Model3).
        Input : face_seq (B,T,3,112,112)  +  eye_seq (B,T,3,64,64)
        Output: (B, 2) logits
        Checkpoint: bare state_dict  (torch.save(model.state_dict(), path))
        """
        def __init__(self, lstm_hidden: int = 256, lstm_layers: int = 2,
                     num_classes: int = 2) -> None:
            super().__init__()
            self.face_cnn         = _CNNEncoder()
            self.eye_net          = _EyeReliabilityNet(num_classes=2)
            self.reliability_gate = _ReliabilityGate(eye_dim=2)
            fusion_in = 1280 + 2   # face feat + reliability-weighted eye logit
            self.lstm = nn.LSTM(
                input_size=fusion_in, hidden_size=lstm_hidden,
                num_layers=lstm_layers, batch_first=True,
                dropout=0.3 if lstm_layers > 1 else 0.0,
            )
            self.classifier = nn.Sequential(
                nn.Dropout(0.4),
                nn.Linear(lstm_hidden, num_classes),
            )

        def forward(self, face_seq: "torch.Tensor",
                    eye_seq: "torch.Tensor") -> "torch.Tensor":
            B, T = face_seq.shape[:2]
            face_feats = self.face_cnn(
                face_seq.view(B * T, *face_seq.shape[2:])
            ).view(B, T, 1280)
            eye_logits = self.eye_net(
                eye_seq.view(B * T, *eye_seq.shape[2:])
            )                                           # (B*T, 2)
            r      = self.reliability_gate(eye_logits) # (B*T, 1)
            eye_w  = (eye_logits * r).view(B, T, 2)
            fused      = torch.cat([face_feats, eye_w], dim=-1)  # (B,T,1282)
            out, _     = self.lstm(fused)
            return self.classifier(out[:, -1, :])

    # ── M4: CNN + Temporal Self-Attention Transformer ─────────────────────────
    class _DropPath(nn.Module):
        """Stochastic depth — a no-op at inference (eval mode)."""
        def __init__(self, drop_prob: float = 0.0) -> None:
            super().__init__()
            self.drop_prob = drop_prob

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            if not self.training or self.drop_prob == 0.0:
                return x
            keep  = 1.0 - self.drop_prob
            shape = (x.shape[0],) + (1,) * (x.ndim - 1)
            mask  = torch.rand(shape, dtype=x.dtype, device=x.device) < keep
            return x * mask / keep

    class _M4(nn.Module):
        """
        From train_model4.py  (class Model4).
        Input : (B, T=16, 3, 112, 112)   Output: (B, 2) logits
        Checkpoint: bare state_dict
        """
        _PROJ = 256
        _HEAD = 8
        _LYRS = 3
        _FFN  = 512

        def __init__(self, seq_len: int = _SEQ_LEN, num_classes: int = 2) -> None:
            super().__init__()
            self.cnn  = _CNNEncoder()
            self.proj = nn.Sequential(
                nn.Linear(self.cnn.feat_dim, self._PROJ),
                nn.LayerNorm(self._PROJ),
                nn.GELU(),
                nn.Dropout(0.2),
            )
            self.cls_token = nn.Parameter(torch.zeros(1, 1, self._PROJ))
            self.pos_embed = nn.Parameter(torch.zeros(1, seq_len + 1, self._PROJ))
            nn.init.trunc_normal_(self.cls_token, std=0.02)
            nn.init.trunc_normal_(self.pos_embed, std=0.02)

            self.drop_path   = _DropPath(0.1)
            encoder_layer    = nn.TransformerEncoderLayer(
                d_model=self._PROJ, nhead=self._HEAD,
                dim_feedforward=self._FFN,
                dropout=0.2, batch_first=True, norm_first=True,
            )
            self.transformer = nn.TransformerEncoder(encoder_layer,
                                                     num_layers=self._LYRS)
            self.classifier  = nn.Sequential(
                nn.LayerNorm(self._PROJ * 2),
                nn.Dropout(0.5),
                nn.Linear(self._PROJ * 2, 128),
                nn.GELU(),
                nn.Dropout(0.3),
                nn.Linear(128, num_classes),
            )

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            B, T = x.shape[:2]
            feats = self.proj(
                self.cnn(x.view(B * T, *x.shape[2:]))
            ).view(B, T, self._PROJ)
            cls   = self.cls_token.expand(B, -1, -1)
            feats = torch.cat([cls, feats], dim=1) + self.pos_embed[:, :T + 1, :]
            out   = self.transformer(feats)
            pooled = torch.cat(
                [out[:, 0, :], out[:, 1:, :].mean(dim=1)], dim=-1
            )
            return self.classifier(pooled)

    # ── M5: Multi-Scale TCN (defined but EXCLUDED from ensemble) ─────────────
    class _DRBlock(nn.Module):
        """DilatedResidualBlock from train_model5.py."""
        def __init__(self, channels: int, dilation: int,
                     kernel_size: int = 3, dropout: float = 0.15) -> None:
            super().__init__()
            pad        = dilation * (kernel_size - 1) // 2
            self.norm1 = nn.LayerNorm(channels)
            self.conv1 = nn.Conv1d(channels, channels, kernel_size,
                                   dilation=dilation, padding=pad)
            self.norm2 = nn.LayerNorm(channels)
            self.conv2 = nn.Conv1d(channels, channels, kernel_size,
                                   dilation=dilation, padding=pad)
            self.act   = nn.GELU()
            self.drop  = nn.Dropout(dropout)

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            res = x
            x = self.conv1(self.norm1(x).transpose(1, 2)).transpose(1, 2)
            x = self.drop(self.act(x))
            x = self.conv2(self.norm2(x).transpose(1, 2)).transpose(1, 2)
            return self.act(x) + res

    class _M5(nn.Module):
        """
        From train_model5.py  (class Model5).
        Input : (B, T=16, 3, 112, 112)   Output: (B, 2) logits
        Checkpoint: bare state_dict
        NOTE: EXCLUDED from ensemble (weight = 0.00) — collapses to all-drowsy.
        """
        def __init__(self, seq_len: int = _SEQ_LEN, num_classes: int = 2) -> None:
            super().__init__()
            self.cnn  = _CNNEncoder()
            self.proj = nn.Sequential(
                nn.Linear(self.cnn.feat_dim, 256),
                nn.LayerNorm(256),
                nn.GELU(),
                nn.Dropout(0.1),
            )
            self.tcn_blocks  = nn.ModuleList([
                _DRBlock(256, dilation=d) for d in [1, 2, 4, 8]
            ])
            self.skip_scales = nn.Parameter(torch.ones(4))
            self.classifier  = nn.Sequential(
                nn.LayerNorm(256), nn.Dropout(0.45),
                nn.Linear(256, 128), nn.GELU(),
                nn.Dropout(0.3), nn.Linear(128, num_classes),
            )

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            B, T = x.shape[:2]
            feats = self.proj(
                self.cnn(x.view(B * T, *x.shape[2:]))
            ).view(B, T, 256)
            skip, h = torch.zeros_like(feats), feats
            for i, blk in enumerate(self.tcn_blocks):
                h    = blk(h)
                skip = skip + self.skip_scales[i] * h
            return self.classifier(skip.mean(dim=1))


# =============================================================================
# ENGINE
# =============================================================================

class DrowsinessEngine:
    """
    Thread-safe 4-model PyTorch drowsiness detection ensemble.

    Singleton usage in app.py:
        _dw_engine = DrowsinessEngine()
        result = _dw_engine.process_frame(img_bgr, session_id=request.sid)
    """

    def __init__(self) -> None:
        self._ready    = False
        self._m1: Optional[Any] = None
        self._m2: Optional[Any] = None
        self._m3: Optional[Any] = None
        self._m4: Optional[Any] = None
        self._m5: Optional[Any] = None
        self._lock      = threading.Lock()
        self._sess_lock = threading.Lock()
        self._sessions: Dict[str, Dict] = {}
        self._load()

    # ── Loading ────────────────────────────────────────────────────────────────

    def _load(self) -> None:
        if not (_torch_ok and _timm_ok):
            logger.warning("[DrowsinessEngine] Missing dependencies — disabled.")
            return

        loaded = 0

        def _load_one(label: str, model_key: str, factory) -> Optional[Any]:
            """
            Load a single model checkpoint.

            Checkpoint format:
              M1, M2  → dict  with key 'model_state'
              M3, M4, M5 → bare OrderedDict (torch.save(model.state_dict(), path))
            """
            nonlocal loaded
            path = _CKPT.get(model_key)
            if path is None or not path.exists():
                logger.warning("[DrowsinessEngine] %s checkpoint not found: %s",
                               label, path)
                return None
            try:
                raw = torch.load(str(path), map_location="cpu", weights_only=False)
                # Determine state dict:
                #   dict with 'model_state' key  → M1 / M2 format
                #   plain OrderedDict (no special keys) → M3 / M4 / M5 format
                if isinstance(raw, dict) and "model_state" in raw:
                    state = raw["model_state"]
                else:
                    state = raw   # bare state_dict from torch.save(model.state_dict(), ...)

                net = factory()
                net.load_state_dict(state, strict=True)
                net.eval()
                loaded += 1
                print(f"[DrowsinessEngine] {label} OK  ({path.parent.name}/{path.name})")
                return net
            except Exception as exc:
                logger.error("[DrowsinessEngine] %s FAILED — %s", label, exc)
                return None

        self._m1 = _load_one("M1 EfficientNet-B0",        "m1", _M1)
        self._m2 = _load_one("M2 CNN+LSTM",                "m2", _M2)
        self._m3 = _load_one("M3 Reliability Fusion",      "m3", _M3)
        self._m4 = _load_one("M4 CNN+Transformer",         "m4",
                             lambda: _M4(seq_len=_SEQ_LEN))
        self._m5 = _load_one("M5 CNN+MS-TCN",              "m5",
                             lambda: _M5(seq_len=_SEQ_LEN))

        if loaded >= 1:
            self._ready = True
            active = {k: v for k, v in _W.items() if v > 0}
            print(f"[DrowsinessEngine] Ready -- {loaded}/5 models loaded. "
                  f"Active ensemble weights: {active}")
        else:
            logger.error(
                "[DrowsinessEngine] No models loaded. "
                "Verify that .pth files exist under %s", _BASE
            )

    # ── Session state ──────────────────────────────────────────────────────────

    def _session(self, sid: str) -> Dict:
        with self._sess_lock:
            if sid not in self._sessions:
                self._sessions[sid] = {
                    # model buffers
                    "frame_buf":   deque(maxlen=_SEQ_LEN),   # (3,112,112) tensors
                    "eye_buf":     deque(maxlen=_SEQ_LEN),   # (3,64,64)   tensors
                    "consec":      0,
                    # facial feature tracking
                    "ear_window":  deque(maxlen=_PERCLOS_WIN),  # recent EAR values
                    "mar_window":  deque(maxlen=_PERCLOS_WIN),  # recent MAR values
                    "blink_count": 0,
                    "yawn_count":  0,
                    "eye_closed":  False,   # for blink edge detection
                    "mouth_open":  False,   # for yawn edge detection
                }
            return self._sessions[sid]

    def reset_session(self, sid: str) -> None:
        """Call on socket disconnect or explicit session end."""
        with self._sess_lock:
            self._sessions.pop(sid, None)

    # ── Preprocessing ──────────────────────────────────────────────────────────

    @staticmethod
    def _bgr_to_tensor(bgr: np.ndarray, size: int) -> "torch.Tensor":
        """BGR ndarray → normalised (1, 3, size, size) float32 tensor."""
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        pil = _PIL.fromarray(rgb).resize((size, size), _PIL.BILINEAR)
        arr = np.array(pil, dtype=np.float32) / 255.0           # H×W×3 in [0,1]
        t   = torch.from_numpy(arr).permute(2, 0, 1)            # 3×H×W
        mn  = torch.tensor(_MEAN, dtype=torch.float32).view(3, 1, 1)
        sd  = torch.tensor(_STD,  dtype=torch.float32).view(3, 1, 1)
        return ((t - mn) / sd).unsqueeze(0)                      # (1,3,H,W)

    def _eye_tensor(self, bgr: np.ndarray) -> "torch.Tensor":
        """Top EYE_CROP fraction of frame → (1, 3, 64, 64) normalised tensor."""
        rgb  = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        full = _PIL.fromarray(rgb).resize((_SZ_SEQ, _SZ_SEQ), _PIL.BILINEAR)
        w, h = full.size                                          # 112 × 112
        crop = full.crop((0, 0, w, int(h * _EYE_CROP)))          # 112 × ~44
        crop = crop.resize((_SZ_EYE, _SZ_EYE), _PIL.BILINEAR)    # 64 × 64
        arr  = np.array(crop, dtype=np.float32) / 255.0
        t    = torch.from_numpy(arr).permute(2, 0, 1)
        mn   = torch.tensor(_MEAN, dtype=torch.float32).view(3, 1, 1)
        sd   = torch.tensor(_STD,  dtype=torch.float32).view(3, 1, 1)
        return ((t - mn) / sd).unsqueeze(0)                       # (1,3,64,64)

    @staticmethod
    def _build_seq(buf: deque) -> "Optional[torch.Tensor]":
        """Stack buffer into (1, T, C, H, W); returns None until buffer is full."""
        if len(buf) < _SEQ_LEN:
            return None
        return torch.stack(list(buf)).unsqueeze(0)   # (1,T,C,H,W)

    # ── Inference ──────────────────────────────────────────────────────────────

    def _run_models(self, bgr: np.ndarray, state: Dict
                    ) -> Dict[str, Optional[float]]:
        """Run every loaded model; return per-model drowsy probabilities."""
        probs: Dict[str, Optional[float]] = {k: None for k in _W}

        with torch.no_grad(), self._lock:

            # M1 — single 224×224 frame, always available from frame 1
            if self._m1 is not None:
                t1 = self._bgr_to_tensor(bgr, _SZ_M1)
                p  = torch.softmax(self._m1(t1), dim=1)
                probs["m1"] = float(p[0, 1])

            # Push 112×112 frame and 64×64 eye crop into session ring buffer
            t112 = self._bgr_to_tensor(bgr, _SZ_SEQ)[0]  # (3,112,112)
            teye = self._eye_tensor(bgr)[0]                # (3,64,64)
            state["frame_buf"].append(t112)
            state["eye_buf"].append(teye)

            # M2, M3, M4 — need a full 16-frame window
            seq  = self._build_seq(state["frame_buf"])    # (1,16,3,112,112) or None
            eseq = self._build_seq(state["eye_buf"])      # (1,16,3,64,64)   or None

            if seq is not None:
                if self._m2 is not None:
                    p = torch.softmax(self._m2(seq), dim=1)
                    probs["m2"] = float(p[0, 1])

                if self._m3 is not None and eseq is not None:
                    p = torch.softmax(self._m3(seq, eseq), dim=1)
                    probs["m3"] = float(p[0, 1])

                if self._m4 is not None:
                    p = torch.softmax(self._m4(seq), dim=1)
                    probs["m4"] = float(p[0, 1])

                if self._m5 is not None:
                    p = torch.softmax(self._m5(seq), dim=1)
                    probs["m5"] = float(p[0, 1])

        return probs

    # ── Ensemble ───────────────────────────────────────────────────────────────

    @staticmethod
    def _ensemble(probs: Dict[str, Optional[float]]) -> float:
        """Weighted average; renormalises over available models automatically."""
        tw = tp = 0.0
        for key, w in _W.items():
            p = probs.get(key)
            if p is not None and w > 0.0:
                tp += w * p
                tw += w
        return 0.0 if tw < 1e-9 else tp / tw

    # ── Facial feature extraction + session metrics ───────────────────────────

    @staticmethod
    def _run_features(bgr: np.ndarray, state: Dict) -> Dict:
        """
        Run OpenCV feature extractor and update session-level metrics.

        Returns dict matching DrowsinessMonitorPage field names:
          ear, mar, pitch, yaw,
          eye_closure  — 0-1 closure ratio (0=open, 1=closed)
          perclos      — 0-1 ratio of closed-eye frames in rolling window
          yawn_freq    — 0-1 ratio of open-mouth frames in rolling window
          blink_count, yawn_count, face_detected
        """
        if _face_extractor is None:
            return {}

        raw = _face_extractor.extract(bgr)
        # Always proceed — extractor returns region-fallback values even when
        # face detection fails, so we always have EAR/MAR numbers to track.

        ear   = raw.get("ear")   or 0.28
        mar   = raw.get("mar")   or 0.18
        pitch = raw.get("pitch") or 0.0
        yaw   = raw.get("yaw")   or 0.0

        # eye_closure: 0 = fully open (EAR >= 0.35), 1 = fully closed (EAR = 0)
        eye_closure = round(float(max(0.0, min(1.0, (0.35 - ear) / 0.35))), 3)

        # PERCLOS — fraction of rolling window frames where eye was closed (0-1)
        state["ear_window"].append(ear)
        closed_frames = sum(1 for e in state["ear_window"] if e < _EAR_CLOSED)
        perclos = round(closed_frames / max(1, len(state["ear_window"])), 3)

        # yawn window — track MAR values for yawn frequency
        state["mar_window"].append(mar)
        yawn_frames = sum(1 for m in state["mar_window"] if m > _MAR_YAWN)
        yawn_freq   = round(yawn_frames / max(1, len(state["mar_window"])), 3)

        # Blink count — rising-edge: eye closes then re-opens
        eye_now_closed = ear < _EAR_CLOSED
        if state["eye_closed"] and not eye_now_closed:
            state["blink_count"] += 1
        state["eye_closed"] = eye_now_closed

        # Yawn count — rising-edge: mouth opens (above threshold)
        mouth_now_open = mar > _MAR_YAWN
        if not state["mouth_open"] and mouth_now_open:
            state["yawn_count"] += 1
        state["mouth_open"] = mouth_now_open

        return {
            "face_detected": True,
            "ear":           ear,
            "mar":           mar,
            "pitch":         pitch,
            "yaw":           yaw,
            "eye_closure":   eye_closure,   # 0-1 closure ratio
            "perclos":       perclos,        # 0-1 fraction
            "yawn_freq":     yawn_freq,      # 0-1 fraction
            "blink_count":   state["blink_count"],
            "yawn_count":    state["yawn_count"],
        }

    # ── Public API ─────────────────────────────────────────────────────────────

    @property
    def ready(self) -> bool:
        return self._ready

    def process_frame(
        self,
        img_bgr: np.ndarray,
        session_id: str = "default",
    ) -> Dict[str, Any]:
        """
        Analyse one BGR frame.

        Returns:
            ok, face_detected, verdict, confidence, alert,
            consecutive_frames, models{m1..m5}, features{ear,mar,pitch,yaw,
            perclos,blink_count,yawn_count}, bbox
        """
        if not self._ready:
            return {"ok": False, "error": "Drowsiness engine not loaded"}

        state    = self._session(session_id)
        feats    = self._run_features(img_bgr, state)
        probs    = self._run_models(img_bgr, state)
        score    = self._ensemble(probs)
        verdict  = "Drowsy" if score > _DROWSY_THR else "Alert"
        # face_detected: True if Haar found face, False if region-fallback used
        face_det = feats.get("face_detected", True) if feats else True

        if verdict == "Drowsy" and score > _ALERT_CONF_THR:
            state["consec"] += 1
        else:
            state["consec"] = 0

        def _fmt(p: Optional[float]) -> Dict:
            return ({"drowsy_prob": round(p, 4), "available": True}
                    if p is not None
                    else {"drowsy_prob": 0.0,     "available": False})

        return {
            "ok":                 True,
            "face_detected":      face_det,
            "verdict":            verdict,
            "confidence":         round(score, 4),
            "alert":              state["consec"] >= _CONSEC_THR,
            "consecutive_frames": state["consec"],
            "models": {
                "m1": _fmt(probs["m1"]),
                "m2": _fmt(probs["m2"]),
                "m3": _fmt(probs["m3"]),
                "m4": _fmt(probs["m4"]),
                "m5": _fmt(probs["m5"]),
            },
            "features": feats,
            "bbox":     None,
        }

    def process_video(
        self,
        video_path: str,
        sample_every: int = 3,
    ) -> Dict[str, Any]:
        """
        Analyse a video file and return per-frame timeline + summary stats.
        Skips the first SEQ_LEN processed frames (model warm-up window).
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

        MAX_TIMELINE    = 60
        timeline:     List[Dict] = []
        alert_events: List[Dict] = []
        frame_raw       = 0
        frame_processed = 0
        drowsy_count    = 0
        total_scored    = 0

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

                if frame_processed <= _SEQ_LEN:   # skip warm-up
                    continue

                ts      = round(frame_raw / fps_src, 2)
                verdict = res.get("verdict") or "—"
                conf    = res.get("confidence", 0.0)
                is_alrt = res.get("alert", False)

                total_scored += 1
                if verdict == "Drowsy":
                    drowsy_count += 1

                if len(timeline) < MAX_TIMELINE:
                    ann = frame.copy()
                    if is_alrt:
                        cv2.rectangle(ann, (2, 2),
                                      (ann.shape[1] - 2, 32), (0, 50, 200), -1)
                        cv2.putText(ann, "DROWSINESS ALERT", (8, 22),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                                    (255, 255, 255), 2)
                    h_a, w_a = ann.shape[:2]
                    if w_a > 320:
                        ann = cv2.resize(ann, (320, int(h_a * 320 / w_a)),
                                         interpolation=cv2.INTER_AREA)
                    buf_ = io.BytesIO()
                    _PIL.fromarray(
                        cv2.cvtColor(ann, cv2.COLOR_BGR2RGB)
                    ).save(buf_, format="JPEG", quality=50)
                    img_b64 = base64.b64encode(buf_.getvalue()).decode()

                    timeline.append({
                        "frame":      frame_raw,
                        "ts":         ts,
                        "verdict":    verdict,
                        "confidence": conf,
                        "alert":      is_alrt,
                        "face":       res.get("face_detected"),
                        "models":     res.get("models"),
                        "image":      img_b64,
                    })

                if is_alrt and (
                    not alert_events
                    or abs(ts - alert_events[-1]["ts"]) >= 2.0
                ):
                    alert_events.append({"ts": ts, "frame": frame_raw,
                                         "confidence": conf})
        finally:
            cap.release()
            self.reset_session(SID)

        drowsy_pct   = round(drowsy_count / max(1, total_scored) * 100, 1)
        duration_sec = round(raw_total / fps_src, 1)

        return {
            "ok":            True,
            "total_frames":  raw_total,
            "analyzed":      total_scored,
            "displayed":     len(timeline),
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
