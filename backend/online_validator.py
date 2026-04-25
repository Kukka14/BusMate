"""
Classical Rule-Based Drowsiness Validator
==========================================
A secondary validator that cross-checks the neural-network ensemble using
classical signal-processing thresholds — no API key, no internet required.

Three physiological cues over a rolling window (default 30 frames ≈ 3 s at 10 fps):

  PERCLOS   – proportion of frames where EAR < EAR_THRESHOLD  (eye closure)
  Yawn freq – proportion of frames where MAR > MAR_THRESHOLD   (mouth opening)
  Nod freq  – proportion of frames where |pitch| > PITCH_THRESHOLD (head drooping)

Composite drowsiness score:
  score = W_PERCLOS * perclos + W_YAWN * yawn_freq + W_NOD * nod_freq

Verdict: "Drowsy" if score > SCORE_THRESHOLD, else "Alert"

Usage (called from app.py every frame):
    validator    = ClassicalValidator()
    online_result = validator.validate(features, session_id)
    consensus    = compute_consensus(local_verdict, local_confidence, online_result)

Consensus logic:
    Local == Classical  →  "confirmed"   — boost confidence +10%
    Local != Classical  →  "conflicting" — reduce confidence -15%, trust local
    No face / no features → "unvalidated" — show local result only
"""

from collections import deque
from typing import Any, Dict, Optional

# ─── Thresholds ───────────────────────────────────────────────────────────────
EAR_THRESHOLD   = 0.25   # below → eye considered closed
MAR_THRESHOLD   = 0.60   # above → yawning
PITCH_THRESHOLD = 20.0   # degrees absolute → head-nodding / drooping

WINDOW_SIZE     = 30     # rolling buffer length (frames)

W_PERCLOS = 0.55         # PERCLOS weight
W_YAWN    = 0.30         # yawn-frequency weight
W_NOD     = 0.15         # head-nod weight

SCORE_THRESHOLD = 0.40   # composite score above this → Drowsy


# =============================================================================
class ClassicalValidator:
    """
    Synchronous, per-session rule-based drowsiness cross-validator.

    Maintains a rolling buffer of binary physiological flags per driver session.
    Call ``validate(features, session_id)`` on every processed frame — it returns
    immediately with the current window verdict for that session.

    No threads, no HTTP calls, no external API keys needed.
    """

    def __init__(self) -> None:
        # Maps session_id → dict of deques (one per cue)
        self._sessions: Dict[str, Dict[str, deque]] = {}

    # ── Public interface ───────────────────────────────────────────────────────

    def validate(
        self,
        features: Optional[Dict[str, Any]],
        session_id: str = "default",
    ) -> Dict[str, Any]:
        """
        Update the rolling buffer with the latest physiological readings and
        return the classical verdict for this session's current window.

        ``features`` is the dict returned by DrowsinessEngine.process_frame()
        under the "features" key.  Required sub-keys:
            ear   – Eye Aspect Ratio         (float)
            mar   – Mouth Aspect Ratio       (float)
            pitch – Head pitch angle in deg  (float, negative = downward)

        Return dict keys:
            ok, available, verdict, confidence,
            perclos, yawn_freq, nod_freq, score, n_frames
        """
        if not features or not isinstance(features, dict):
            return self._unavailable("No feature data — classical validator skipped.")

        ear   = features.get("ear")
        mar   = features.get("mar")
        pitch = features.get("pitch")

        # All three cues must be present (face not detected → skip this frame)
        if ear is None or mar is None or pitch is None:
            return self._unavailable("Face not detected — classical validator skipped.")

        # ── Update rolling buffer ─────────────────────────────────────────────
        buf = self._get_or_create_buffer(session_id)
        buf["eye_closed"].append(1 if ear        < EAR_THRESHOLD   else 0)
        buf["yawning"]   .append(1 if mar        > MAR_THRESHOLD   else 0)
        buf["nodding"]   .append(1 if abs(pitch) > PITCH_THRESHOLD else 0)

        n = len(buf["eye_closed"])  # all three deques share the same maxlen

        # ── Compute proportions over window ───────────────────────────────────
        perclos   = sum(buf["eye_closed"]) / n
        yawn_freq = sum(buf["yawning"])    / n
        nod_freq  = sum(buf["nodding"])    / n

        score = W_PERCLOS * perclos + W_YAWN * yawn_freq + W_NOD * nod_freq

        verdict = "Drowsy" if score > SCORE_THRESHOLD else "Alert"

        # Confidence: how far above/below threshold
        if verdict == "Drowsy":
            confidence = min(1.0, score / SCORE_THRESHOLD)
        else:
            confidence = max(0.0, 1.0 - score / SCORE_THRESHOLD)

        return {
            "ok":         True,
            "available":  True,
            "verdict":    verdict,
            "confidence": round(float(confidence), 4),
            "perclos":    round(float(perclos),    4),
            "yawn_freq":  round(float(yawn_freq),  4),
            "nod_freq":   round(float(nod_freq),   4),
            "score":      round(float(score),      4),
            "n_frames":   n,
        }

    def reset_session(self, session_id: str) -> None:
        """Release the rolling buffer for a disconnected session."""
        self._sessions.pop(session_id, None)

    # ── Private helpers ────────────────────────────────────────────────────────

    def _get_or_create_buffer(self, session_id: str) -> Dict[str, deque]:
        if session_id not in self._sessions:
            self._sessions[session_id] = {
                "eye_closed": deque(maxlen=WINDOW_SIZE),
                "yawning":    deque(maxlen=WINDOW_SIZE),
                "nodding":    deque(maxlen=WINDOW_SIZE),
            }
        return self._sessions[session_id]

    @staticmethod
    def _unavailable(reason: str) -> Dict[str, Any]:
        return {
            "ok":        False,
            "available": False,
            "verdict":   None,
            "error":     reason,
        }


# =============================================================================
def compute_consensus(
    local_verdict:    str,
    local_confidence: float,
    online_result:    Dict[str, Any],
) -> Dict[str, Any]:
    """
    Combine the local neural-ensemble result with the classical-validator result.

    Returns:
        status            "confirmed" | "conflicting" | "unvalidated"
        agreement         True | False | None
        final_verdict     str    — always the local model's verdict
        final_confidence  float  — adjusted: +10% if confirmed, −15% if conflicting
        online_verdict    str | None
        message           str    — human-readable summary
    """
    online_verdict   = online_result.get("verdict")
    online_available = online_result.get("available", False)
    online_ok        = online_result.get("ok",        False)

    if not online_ok or not online_available or online_verdict is None:
        return {
            "status":           "unvalidated",
            "agreement":        None,
            "final_verdict":    local_verdict,
            "final_confidence": round(local_confidence, 4),
            "online_verdict":   None,
            "message":          (
                "Classical validator not ready yet "
                "(waiting for enough frames in window)."
            ),
        }

    agrees = local_verdict == online_verdict

    if agrees:
        boosted = min(1.0, local_confidence * 1.10)
        return {
            "status":           "confirmed",
            "agreement":        True,
            "final_verdict":    local_verdict,
            "final_confidence": round(boosted, 4),
            "online_verdict":   online_verdict,
            "message": (
                f"Both models agree: {local_verdict} "
                f"(neural {round(local_confidence * 100)}% "
                f"→ confirmed {round(boosted * 100)}%)"
            ),
        }
    else:
        reduced = local_confidence * 0.85
        return {
            "status":           "conflicting",
            "agreement":        False,
            "final_verdict":    local_verdict,   # trust local neural model
            "final_confidence": round(reduced, 4),
            "online_verdict":   online_verdict,
            "message": (
                f"Models disagree — Neural: {local_verdict}, "
                f"Classical: {online_verdict}. "
                f"Trusting neural model "
                f"(confidence reduced to {round(reduced * 100)}%)."
            ),
        }
