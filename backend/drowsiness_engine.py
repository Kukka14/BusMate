"""
Drowsiness Detection Engine  —  PyTorch 5-Model Ensemble
=========================================================
Five EfficientNet-B0 based models trained across three datasets:

  Model | Architecture      | Dataset   | Test Acc | Weight
  ------+-------------------+-----------+----------+-------
  M1    | EfficientNet-B0   | UTA-RLDD  |  94.61%  |  0.10
  M2    | CNN + LSTM        | UTA-RLDD  |  98.21%  |  0.35
  M3    | Fusion + Eye      | UTA-RLDD  | ~100%*   |  0.25
  M4    | CNN + Transformer | YAWDD     |  56.94%  |  0.15
  M5    | CNN + MS-TCN      | NTHU-DDD  |  41.90%  |  0.15

  * M3 accuracy inflated by subject overlap; architecture is multi-modal.
    M4/M5 use subject-independent splits on harder, out-of-distribution data.

All models are PyTorch (.pth), run on CPU by default.
Input:  raw BGR frames from webcam or video file.
Preprocessing: resize + ImageNet normalisation — no feature engineering.

Alert fires when ensemble drowsy-probability > 0.6 for 5 consecutive frames.

Model files expected in  backend/Drownsiness/ :
  model1_best.pth          EfficientNet-B0 classifier
  model2_best.pth          CNN+LSTM temporal model
  model3_best.pth          Reliability-aware temporal fusion
  model4_best.pth          CNN+Transformer
  model5_best.pth          CNN+MS-TCN

Dependencies (beyond the standard BusMate stack):
  pip install torch torchvision timm
"""

import base64
import io
import logging
import threading
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from PIL import Image as _PILImage

logger = logging.getLogger(__name__)

# ─── Model directory ───────────────────────────────────────────────────────────
_MODEL_DIR = Path(__file__).resolve().parent / "Drownsiness"

# ─── Sequence / image constants (match training scripts exactly) ───────────────
_SEQ_LEN    = 16     # frames per temporal window  (M2, M3, M4, M5)
_IMG_SIZE   = 112    # spatial resolution for M2-M5
_IMG_SIZE_1 = 224    # spatial resolution for M1
_EYE_SIZE   = 64     # eye-crop resolution for M3
_EYE_RATIO  = 0.40   # top 40 % of frame used as eye-region proxy

# ─── ImageNet normalisation (same mean/std as training) ───────────────────────
_MEAN = [0.485, 0.456, 0.406]
_STD  = [0.229, 0.224, 0.225]

# ─── Ensemble weights ──────────────────────────────────────────────────────────
_W = {"m1": 0.10, "m2": 0.35, "m3": 0.25, "m4": 0.15, "m5": 0.15}

# ─── Decision thresholds ───────────────────────────────────────────────────────
_DROWSY_LABEL_THR = 0.72  # default/fallback threshold
_ALERT_CONF_THR   = 0.82  # default/fallback alert increment threshold
_CONSECUTIVE_THR  = 5     # alert fires after N consecutive confident frames

# Runtime sensitivity profiles for live tuning from the frontend.
_SENSITIVITY_PROFILES = {
    "normal": {
        "drowsy_thr": 0.70,
        "alert_thr": 0.80,
        "eye_closure": 0.50,
        "perclos": 0.35,
        "mar": 0.64,
        "yawn_freq": 0.22,
    },
    "strict": {
        "drowsy_thr": 0.78,
        "alert_thr": 0.86,
        "eye_closure": 0.55,
        "perclos": 0.40,
        "mar": 0.68,
        "yawn_freq": 0.25,
    },
    "very_strict": {
        "drowsy_thr": 0.84,
        "alert_thr": 0.90,
        "eye_closure": 0.60,
        "perclos": 0.48,
        "mar": 0.74,
        "yawn_freq": 0.30,
    },
}


# =============================================================================
# MODEL ARCHITECTURE DEFINITIONS
# (copied verbatim from training scripts — only inference-relevant parts kept)
# =============================================================================

_torch_available = False
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    _torch_available = True
except ImportError:
    logger.warning("PyTorch not installed — drowsiness engine disabled. "
                   "Run: pip install torch torchvision")

_timm_available = False
try:
    import timm  # noqa: F401
    _timm_available = True
except ImportError:
    logger.warning("timm not installed — drowsiness engine disabled. "
                   "Run: pip install timm")


# Only define model classes when torch + timm are present
if _torch_available and _timm_available:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    import timm

    # ── Shared EfficientNet-B0 backbone (used inside M2 – M5) ─────────────────
    class _CNNEncoder(nn.Module):
        """EfficientNet-B0 per-frame feature extractor → 1280-d vector."""
        def __init__(self):
            super().__init__()
            self.backbone = timm.create_model(
                "efficientnet_b0", pretrained=False, num_classes=0
            )
            self.feat_dim = self.backbone.num_features  # 1280

        def forward(self, x):
            return self.backbone(x)  # (B, 1280)

    # ── Model 1 : EfficientNet-B0 single-frame baseline ───────────────────────
    class _Model1(nn.Module):
        """Single 224×224 frame → 2-class logits."""
        def __init__(self, num_classes=2, dropout=0.4):
            super().__init__()
            self.backbone = timm.create_model(
                "efficientnet_b0", pretrained=False,
                num_classes=0, global_pool="avg"
            )
            feat_dim = self.backbone.num_features   # 1280
            self.classifier = nn.Sequential(
                nn.Dropout(p=dropout),
                nn.Linear(feat_dim, 256),
                nn.ReLU(inplace=True),
                nn.Dropout(p=dropout / 2),
                nn.Linear(256, num_classes),
            )

        def forward(self, x):
            return self.classifier(self.backbone(x))

    # ── Model 2 : CNN + LSTM ───────────────────────────────────────────────────
    class _Model2(nn.Module):
        """16-frame 112×112 sequences → 2-class logits via EfficientNet+LSTM."""
        def __init__(self, num_classes=2, hidden=256, num_layers=2, dropout=0.3):
            super().__init__()
            self.cnn = _CNNEncoder()
            feat_dim = self.cnn.feat_dim

            self.lstm = nn.LSTM(
                input_size  = feat_dim,
                hidden_size = hidden,
                num_layers  = num_layers,
                batch_first = True,
                dropout     = dropout if num_layers > 1 else 0.0,
            )
            self.classifier = nn.Sequential(
                nn.Dropout(p=dropout),
                nn.Linear(hidden, 128),
                nn.ReLU(inplace=True),
                nn.Dropout(p=dropout / 2),
                nn.Linear(128, num_classes),
            )

        def forward(self, x):
            B, T, C, H, W = x.shape
            feats    = self.cnn(x.view(B * T, C, H, W)).view(B, T, -1)
            out, _   = self.lstm(feats)
            return self.classifier(out[:, -1, :])

    # ── Model 3 : Reliability-Aware Temporal Fusion ───────────────────────────
    class _EyeReliabilityNet(nn.Module):
        """EfficientNet-B0 fine-tuned for eye-state classification."""
        def __init__(self, num_classes=2):
            super().__init__()
            self.backbone = timm.create_model(
                "efficientnet_b0", pretrained=False, num_classes=0
            )
            feat_dim = self.backbone.num_features   # 1280
            self.head = nn.Sequential(
                nn.Dropout(0.3),
                nn.Linear(feat_dim, 128),
                nn.ReLU(inplace=True),
                nn.Dropout(0.2),
                nn.Linear(128, num_classes),
            )

        def forward(self, x):
            return self.head(self.backbone(x))   # (B, 2)

    class _ReliabilityGate(nn.Module):
        """Learnable gate: eye logits → scalar reliability weight in (0, 1)."""
        def __init__(self, eye_dim=2, hidden=32):
            super().__init__()
            self.gate = nn.Sequential(
                nn.Linear(eye_dim, hidden),
                nn.ReLU(inplace=True),
                nn.Linear(hidden, 1),
                nn.Sigmoid(),
            )

        def forward(self, eye_logits):
            return self.gate(eye_logits)   # (B, 1)

    class _Model3(nn.Module):
        """Face CNN + frozen eye-net + reliability gate + LSTM → 2-class logits."""
        def __init__(self, lstm_hidden=256, lstm_layers=2, num_classes=2):
            super().__init__()
            self.face_cnn         = _CNNEncoder()
            self.eye_net          = _EyeReliabilityNet(num_classes=2)
            self.reliability_gate = _ReliabilityGate(eye_dim=2)

            fusion_in = 1280 + 2   # face-feat dim + reliability-weighted eye logit
            self.lstm = nn.LSTM(
                input_size  = fusion_in,
                hidden_size = lstm_hidden,
                num_layers  = lstm_layers,
                batch_first = True,
                dropout     = 0.3 if lstm_layers > 1 else 0.0,
            )
            self.classifier = nn.Sequential(
                nn.Dropout(0.4),
                nn.Linear(lstm_hidden, num_classes),
            )

        def forward(self, face_seq, eye_seq):
            """
            face_seq : (B, T, 3, 112, 112)
            eye_seq  : (B, T, 3,  64,  64)
            """
            B, T = face_seq.shape[:2]

            face_feats = self.face_cnn(
                face_seq.view(B * T, *face_seq.shape[2:])
            ).view(B, T, 1280)

            eye_logits = self.eye_net(
                eye_seq.view(B * T, *eye_seq.shape[2:])
            )                                           # (B*T, 2)
            r      = self.reliability_gate(eye_logits) # (B*T, 1)
            eye_w  = (eye_logits * r).view(B, T, 2)   # (B,  T, 2)

            fused      = torch.cat([face_feats, eye_w], dim=-1)  # (B, T, 1282)
            out, _     = self.lstm(fused)
            return self.classifier(out[:, -1, :])

    # ── Model 4 : CNN + Temporal Self-Attention Transformer ───────────────────
    _PROJ_DIM  = 256
    _T_HEADS   = 8
    _T_LAYERS  = 3
    _T_FF      = 512
    _DROP_PATH = 0.1

    class _DropPath(nn.Module):
        def __init__(self, drop_prob=0.0):
            super().__init__()
            self.drop_prob = drop_prob

        def forward(self, x):
            if not self.training or self.drop_prob == 0.0:
                return x
            keep  = 1 - self.drop_prob
            shape = (x.shape[0],) + (1,) * (x.ndim - 1)
            mask  = torch.rand(shape, device=x.device) < keep
            return x * mask / keep

    class _Model4(nn.Module):
        """EfficientNet-B0 → projection → CLS-token Transformer → 2-class."""
        def __init__(self, seq_len=_SEQ_LEN, num_classes=2):
            super().__init__()
            self.cnn = _CNNEncoder()

            self.proj = nn.Sequential(
                nn.Linear(self.cnn.feat_dim, _PROJ_DIM),
                nn.LayerNorm(_PROJ_DIM),
                nn.GELU(),
                nn.Dropout(0.2),
            )

            self.cls_token = nn.Parameter(torch.zeros(1, 1, _PROJ_DIM))
            nn.init.trunc_normal_(self.cls_token, std=0.02)

            self.pos_embed = nn.Parameter(torch.zeros(1, seq_len + 1, _PROJ_DIM))
            nn.init.trunc_normal_(self.pos_embed, std=0.02)

            self.drop_path = _DropPath(_DROP_PATH)
            encoder_layer  = nn.TransformerEncoderLayer(
                d_model         = _PROJ_DIM,
                nhead           = _T_HEADS,
                dim_feedforward = _T_FF,
                dropout         = 0.2,
                batch_first     = True,
                norm_first      = True,
            )
            self.transformer = nn.TransformerEncoder(
                encoder_layer, num_layers=_T_LAYERS
            )

            self.classifier = nn.Sequential(
                nn.LayerNorm(_PROJ_DIM * 2),
                nn.Dropout(0.5),
                nn.Linear(_PROJ_DIM * 2, 128),
                nn.GELU(),
                nn.Dropout(0.3),
                nn.Linear(128, num_classes),
            )

        def forward(self, x):
            B, T = x.shape[:2]
            feats = self.cnn(x.view(B * T, *x.shape[2:]))
            feats = self.proj(feats).view(B, T, _PROJ_DIM)

            cls   = self.cls_token.expand(B, -1, -1)
            feats = torch.cat([cls, feats], dim=1) + self.pos_embed[:, :T + 1, :]
            out   = self.transformer(feats)

            pooled = torch.cat([out[:, 0, :], out[:, 1:, :].mean(dim=1)], dim=-1)
            return self.classifier(pooled)

    # ── Model 5 : Multi-Scale Temporal Convolutional Network ──────────────────
    _TCN_CHANNELS  = 256
    _TCN_KERNEL    = 3
    _TCN_DILATIONS = [1, 2, 4, 8]
    _TCN_DROPOUT   = 0.15

    class _DilatedResidualBlock(nn.Module):
        """Single dilated 1-D residual block (B, T, C) → (B, T, C)."""
        def __init__(self, channels, dilation,
                     kernel_size=_TCN_KERNEL, dropout=_TCN_DROPOUT):
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

        def forward(self, x):
            res = x
            x   = self.norm1(x)
            x   = self.conv1(x.transpose(1, 2)).transpose(1, 2)
            x   = self.act(x)
            x   = self.drop(x)
            x   = self.norm2(x)
            x   = self.conv2(x.transpose(1, 2)).transpose(1, 2)
            x   = self.act(x)
            return x + res

    class _Model5(nn.Module):
        """EfficientNet-B0 → projection → 4× dilated TCN → global avg → 2-class."""
        def __init__(self, seq_len=_SEQ_LEN, num_classes=2):
            super().__init__()
            self.cnn = _CNNEncoder()

            self.proj = nn.Sequential(
                nn.Linear(self.cnn.feat_dim, _PROJ_DIM),
                nn.LayerNorm(_PROJ_DIM),
                nn.GELU(),
                nn.Dropout(0.1),
            )

            self.tcn_blocks = nn.ModuleList([
                _DilatedResidualBlock(_TCN_CHANNELS, dilation=d)
                for d in _TCN_DILATIONS
            ])
            self.skip_scales = nn.Parameter(torch.ones(len(_TCN_DILATIONS)))

            self.classifier = nn.Sequential(
                nn.LayerNorm(_TCN_CHANNELS),
                nn.Dropout(0.45),
                nn.Linear(_TCN_CHANNELS, 128),
                nn.GELU(),
                nn.Dropout(0.3),
                nn.Linear(128, num_classes),
            )

        def forward(self, x):
            B, T = x.shape[:2]
            feats = self.cnn(x.view(B * T, *x.shape[2:]))
            feats = self.proj(feats).view(B, T, _PROJ_DIM)

            skip_sum = torch.zeros_like(feats)
            h = feats
            for i, block in enumerate(self.tcn_blocks):
                h        = block(h)
                skip_sum = skip_sum + self.skip_scales[i] * h

            return self.classifier(skip_sum.mean(dim=1))


# =============================================================================
# ENGINE
# =============================================================================

class DrowsinessEngine:
    """
    Thread-safe 5-model PyTorch drowsiness detection ensemble.

    Typical usage (module-level singleton in app.py):
        _dw = DrowsinessEngine()
        result = _dw.process_frame(img_bgr, session_id=request.sid)
    """

    def __init__(self) -> None:
        self._ready     = False
        self._m1        = None   # _Model1
        self._m2        = None   # _Model2
        self._m3        = None   # _Model3
        self._m4        = None   # _Model4
        self._m5        = None   # _Model5
        self._lock      = threading.Lock()   # guards model inference
        self._sessions: Dict[str, Dict] = {}
        self._sess_lock = threading.Lock()
        # Haar cascades for feature extraction (bundled with OpenCV)
        self._face_cas = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        self._eye_cas  = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_eye.xml")
        self._load()

    # ── Initialisation ─────────────────────────────────────────────────────────

    def _load(self) -> None:
        if not (_torch_available and _timm_available):
            logger.warning("[DrowsinessEngine] torch or timm missing — engine disabled.")
            return

        loaded = 0

        def _try_load(name, factory, ckpt_name):
            nonlocal loaded
            path = _MODEL_DIR / ckpt_name
            if not path.exists():
                logger.warning("[DrowsinessEngine] %s not found — skipped.", ckpt_name)
                return None
            try:
                ckpt  = torch.load(str(path), map_location="cpu")
                model = factory()
                # M1 and M2 wrap weights in {"model_state": ...}
                # M3, M4, M5 are saved as bare state dicts
                state = ckpt.get("model_state", ckpt) if isinstance(ckpt, dict) else ckpt
                model.load_state_dict(state, strict=True)
                model.eval()
                loaded += 1
                print(f"[DrowsinessEngine] {name} loaded from {ckpt_name}.")
                return model
            except Exception as exc:
                logger.warning("[DrowsinessEngine] %s failed to load: %s", name, exc)
                return None

        self._m1 = _try_load("M1 EfficientNet",   _Model1,                   "model1_best.pth")
        self._m2 = _try_load("M2 CNN+LSTM",        _Model2,                   "model2_best.pth")
        self._m3 = _try_load("M3 Fusion+Eye",      _Model3,                   "model3_best.pth")
        self._m4 = _try_load("M4 Transformer",     lambda: _Model4(_SEQ_LEN), "model4_best.pth")
        self._m5 = _try_load("M5 MS-TCN",          lambda: _Model5(_SEQ_LEN), "model5_best.pth")

        if loaded >= 1:
            self._ready = True
            print(f"[DrowsinessEngine] Ready — {loaded}/5 models loaded. "
                  f"Ensemble weights: M1={_W['m1']} M2={_W['m2']} "
                  f"M3={_W['m3']} M4={_W['m4']} M5={_W['m5']}")
        else:
            logger.warning("[DrowsinessEngine] No models loaded — engine disabled.")

    # ── Session state ───────────────────────────────────────────────────────────

    def _session(self, sid: str) -> Dict:
        with self._sess_lock:
            if sid not in self._sessions:
                self._sessions[sid] = {
                    "frame_buf": deque(maxlen=_SEQ_LEN),  # (3,112,112) tensors
                    "eye_buf":   deque(maxlen=_SEQ_LEN),  # (3,64,64)   tensors
                    "eye_hist":  deque(maxlen=30),         # for PERCLOS
                    "yawn_hist": deque(maxlen=30),         # for yawn frequency
                    "consec":    0,
                }
            return self._sessions[sid]

    def reset_session(self, sid: str) -> None:
        """Clear accumulated state for a session (call on disconnect / session end)."""
        with self._sess_lock:
            self._sessions.pop(sid, None)

    # ── Preprocessing ──────────────────────────────────────────────────────────

    @staticmethod
    def _to_tensor(pil_img: _PILImage.Image) -> "torch.Tensor":
        """PIL RGB → normalised (3, H, W) float32 tensor (ImageNet stats)."""
        arr  = np.array(pil_img, dtype=np.float32) / 255.0   # H×W×3
        t    = torch.from_numpy(arr).permute(2, 0, 1)         # 3×H×W
        mean = torch.tensor(_MEAN, dtype=torch.float32).view(3, 1, 1)
        std  = torch.tensor(_STD,  dtype=torch.float32).view(3, 1, 1)
        return (t - mean) / std

    def _preprocess(self, bgr: np.ndarray, size: int) -> "torch.Tensor":
        """BGR numpy → (1, 3, size, size) normalised tensor."""
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        pil = _PILImage.fromarray(rgb).resize((size, size), _PILImage.BILINEAR)
        return self._to_tensor(pil).unsqueeze(0)   # (1, 3, H, H)

    def _eye_crop_tensor(self, bgr: np.ndarray) -> "torch.Tensor":
        """Top EYE_RATIO of BGR frame → (1, 3, 64, 64) normalised tensor."""
        rgb  = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        pil  = _PILImage.fromarray(rgb).resize((_IMG_SIZE, _IMG_SIZE), _PILImage.BILINEAR)
        w, h = pil.size                                    # 112 × 112
        pil  = pil.crop((0, 0, w, int(h * _EYE_RATIO)))   # 112 × 44
        pil  = pil.resize((_EYE_SIZE, _EYE_SIZE), _PILImage.BILINEAR)
        return self._to_tensor(pil).unsqueeze(0)           # (1, 3, 64, 64)

    @staticmethod
    def _build_seq(buf: deque) -> "Optional[torch.Tensor]":
        """Stack buffer frames → (1, T, C, H, W). Returns None if not full yet."""
        if len(buf) < _SEQ_LEN:
            return None
        return torch.stack(list(buf), dim=0).unsqueeze(0)  # (1, T, C, H, W)

    # ── Inference ──────────────────────────────────────────────────────────────

    def _infer(
        self,
        img_bgr: np.ndarray,
        state: Dict,
    ) -> Dict[str, Optional[float]]:
        """Run all loaded models; return per-model drowsy probabilities."""
        probs: Dict[str, Optional[float]] = {k: None for k in ("m1","m2","m3","m4","m5")}

        with torch.no_grad(), self._lock:

            # ── M1: single 224×224 frame (no warmup needed) ───────────────────
            if self._m1 is not None:
                t1 = self._preprocess(img_bgr, _IMG_SIZE_1)
                p  = torch.softmax(self._m1(t1), dim=1)
                probs["m1"] = float(p[0, 1])

            # ── Preprocess 112×112 frame + eye crop, push into session buffers ─
            t112 = self._preprocess(img_bgr, _IMG_SIZE)[0]  # (3, 112, 112)
            teye = self._eye_crop_tensor(img_bgr)[0]         # (3, 64, 64)
            state["frame_buf"].append(t112)
            state["eye_buf"].append(teye)

            # ── M2 / M3 / M4 / M5: need a full 16-frame window ────────────────
            seq  = self._build_seq(state["frame_buf"])  # (1,16,3,112,112) or None
            eseq = self._build_seq(state["eye_buf"])    # (1,16,3,64,64)   or None

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
        """Weighted average — renormalises automatically for unavailable models."""
        total_w = total_p = 0.0
        for key, w in _W.items():
            p = probs.get(key)
            if p is not None:
                total_p += w * p
                total_w += w
        return 0.0 if total_w < 1e-9 else total_p / total_w

    # ── Feature extraction ─────────────────────────────────────────────────────

    def _extract_features(self, img_bgr: np.ndarray, state: Dict) -> Dict[str, Any]:
        """Extract facial features using Haar cascades for the UI metrics panel."""
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        # Equalize histogram to handle backlit / low-contrast webcam frames
        gray = cv2.equalizeHist(gray)
        h_img, w_img = gray.shape[:2]

        faces = self._face_cas.detectMultiScale(
            gray, scaleFactor=1.05, minNeighbors=3, minSize=(30, 30))

        feats: Dict[str, Any] = {}

        if len(faces) == 0:
            state["eye_hist"].append(1)
            state["yawn_hist"].append(0)
            feats["perclos"]   = round(sum(state["eye_hist"])  / max(len(state["eye_hist"]),  1), 3)
            feats["yawn_freq"] = round(sum(state["yawn_hist"]) / max(len(state["yawn_hist"]), 1), 3)
            return feats

        fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
        fcx = fx + fw / 2
        fcy = fy + fh / 2

        feats["pitch"] = round((fcy / h_img - 0.5) * 80, 1)
        feats["yaw"]   = round((fcx / w_img - 0.5) * 80, 1)

        eye_roi = gray[fy: fy + int(fh * 0.55), fx: fx + fw]
        eyes = self._eye_cas.detectMultiScale(
            eye_roi, scaleFactor=1.05, minNeighbors=2, minSize=(10, 10))

        if len(eyes) >= 2:
            eyes_s = sorted(eyes, key=lambda e: e[0])[:2]
            ear_vals = [e[3] / max(e[2], 1) for e in eyes_s]
            ear = round(sum(ear_vals) / 2, 3)
        elif len(eyes) == 1:
            ear = round(eyes[0][3] / max(eyes[0][2], 1), 3)
        else:
            ear = 0.30  # neutral — eyes likely open but not detected clearly

        feats["ear"]         = ear
        feats["eye_closure"] = round(max(0.0, 1.0 - ear / 0.40), 2)
        eye_closed           = ear < 0.22

        mouth_roi = gray[fy + int(fh * 0.6): fy + fh, fx: fx + fw]
        if mouth_roi.size > 0:
            m_std = float(np.std(mouth_roi))
            mar   = round(min(1.0, m_std / 60.0), 3)
            feats["mar"] = mar
            yawning = mar > 0.60
        else:
            yawning = False

        state["eye_hist"].append(1 if eye_closed else 0)
        state["yawn_hist"].append(1 if yawning else 0)
        feats["perclos"]   = round(sum(state["eye_hist"])  / max(len(state["eye_hist"]),  1), 3)
        feats["yawn_freq"] = round(sum(state["yawn_hist"]) / max(len(state["yawn_hist"]), 1), 3)

        return feats

    # ── Public API ─────────────────────────────────────────────────────────────

    @property
    def ready(self) -> bool:
        return self._ready

    def process_frame(
        self,
        img_bgr: np.ndarray,
        session_id: str = "default",
        sensitivity: str = "strict",
    ) -> Dict[str, Any]:
        """
        Analyse a single BGR video frame.

        Returns dict with keys:
            ok, face_detected, verdict, confidence, alert,
            consecutive_frames, models, features, bbox
        """
        if not self._ready:
            return {"ok": False, "error": "Drowsiness engine not loaded"}

        state = self._session(session_id)
        feats = self._extract_features(img_bgr, state)
        probs = self._infer(img_bgr, state)
        raw_score = self._ensemble(probs)
        face_detected = len(feats) > 2
        temporal_ready = any(probs[k] is not None for k in ("m2", "m3", "m4", "m5"))
        profile_key = (sensitivity or "strict").strip().lower()
        profile = _SENSITIVITY_PROFILES.get(profile_key, _SENSITIVITY_PROFILES["strict"])
        drowsy_thr = float(profile.get("drowsy_thr", _DROWSY_LABEL_THR))
        alert_thr = float(profile.get("alert_thr", _ALERT_CONF_THR))

        # Guard rails for webcam noise: avoid drowsy verdicts when face is unstable
        # or before temporal models have enough frames to infer reliably.
        score = raw_score if (face_detected and temporal_ready) else min(raw_score, drowsy_thr - 0.01)

        eye_closure = feats.get("eye_closure")
        perclos = feats.get("perclos")
        mar = feats.get("mar")
        yawn_freq = feats.get("yawn_freq")
        drowsy_feature_evidence = (
            (eye_closure is not None and eye_closure >= float(profile.get("eye_closure", 0.55))) or
            (perclos is not None and perclos >= float(profile.get("perclos", 0.40))) or
            (mar is not None and mar >= float(profile.get("mar", 0.68))) or
            (yawn_freq is not None and yawn_freq >= float(profile.get("yawn_freq", 0.25)))
        )

        verdict = "Drowsy" if (score > drowsy_thr and drowsy_feature_evidence) else "Alert"

        if verdict == "Drowsy" and score > alert_thr and face_detected and drowsy_feature_evidence:
            state["consec"] += 1
        else:
            state["consec"] = 0

        def _fmt(p: Optional[float]) -> Dict:
            return ({"drowsy_prob": round(p, 4), "available": True}
                    if p is not None
                    else {"drowsy_prob": 0.0, "available": False})

        return {
            "ok":                 True,
            "face_detected":      face_detected,
            "verdict":            verdict,
            "confidence":         round(score, 4),
            "sensitivity":        profile_key,
            "alert":              state["consec"] >= _CONSECUTIVE_THR,
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
        Analyse a video file for drowsiness events.

        Skips the first SEQ_LEN processed frames (model warm-up window).
        Returns JSON-serialisable dict with summary + per-frame timeline.
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

                # Skip warm-up window (models need SEQ_LEN frames to fill buffer)
                if frame_processed <= _SEQ_LEN:
                    continue

                ts       = round(frame_raw / fps_src, 2)
                verdict  = res.get("verdict") or "—"
                conf     = res.get("confidence", 0.0)
                is_alert = res.get("alert", False)

                total_scored += 1
                if verdict == "Drowsy":
                    drowsy_count += 1

                # ── Build annotated thumbnail (capped at MAX_TIMELINE entries) ─
                if len(timeline) < MAX_TIMELINE:
                    ann = frame.copy()
                    if is_alert:
                        cv2.rectangle(ann, (2, 2), (ann.shape[1] - 2, 32),
                                      (0, 50, 200), -1)
                        cv2.putText(ann, "DROWSINESS ALERT", (8, 22),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                                    (255, 255, 255), 2)
                    # Resize to max 320 px wide for compact thumbnails
                    h_ann, w_ann = ann.shape[:2]
                    if w_ann > 320:
                        scale = 320 / w_ann
                        ann   = cv2.resize(ann, (320, int(h_ann * scale)),
                                           interpolation=cv2.INTER_AREA)
                    pil_img = _PILImage.fromarray(cv2.cvtColor(ann, cv2.COLOR_BGR2RGB))
                    _buf    = io.BytesIO()
                    pil_img.save(_buf, format="JPEG", quality=50)
                    img_b64 = base64.b64encode(_buf.getvalue()).decode()

                    timeline.append({
                        "frame":      frame_raw,
                        "ts":         ts,
                        "verdict":    verdict,
                        "confidence": conf,
                        "alert":      is_alert,
                        "face":       res.get("face_detected"),
                        "models":     res.get("models"),
                        "features":   res.get("features"),
                        "image":      img_b64,
                    })

                # De-duplicate alert events — require >= 2 s gap
                if is_alert and (
                    not alert_events
                    or abs(ts - alert_events[-1]["ts"]) >= 2.0
                ):
                    alert_events.append({
                        "ts":         ts,
                        "frame":      frame_raw,
                        "confidence": conf,
                    })

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
