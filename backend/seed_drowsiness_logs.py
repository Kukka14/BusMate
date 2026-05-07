"""
Seed script: generates realistic shift_drowsiness_logs from driving_sessions CSV.

Usage (from backend/ directory):
    python seed_drowsiness_logs.py
    python seed_drowsiness_logs.py --clear     # drop existing docs first
    python seed_drowsiness_logs.py --dry-run   # print count only, no insert

Requirements:
    pip install pymongo
    MongoDB must be running on localhost:27017 (or set MONGO_URI env var)
"""

import argparse
import csv
import math
import os
import random
import sys
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

# ── Config ────────────────────────────────────────────────────────────────────
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/driveguard")
INTERVAL_SEC = 30          # one reading every 30 seconds
MAX_READINGS = 120         # cap at 120 readings (~60 min) per session
MIN_DURATION = 60          # skip sessions shorter than 60 seconds
VALID_STATUSES = {"completed", "aborted"}

# Route name → (start_town, end_town) mapping
ROUTE_MAP = {
    "Active Route":      ("Colombo", "Kandy"),
    "Drowsiness Monitor": ("Galle", "Matara"),
}
DEFAULT_ROUTE = ("Colombo", "Destination")

# ── Helpers ───────────────────────────────────────────────────────────────────

def _jitter(val, noise=0.03):
    """Add small Gaussian noise to a value, clamp to [0, 1]."""
    return max(0.0, min(1.0, val + random.gauss(0, noise)))


def _drowsy_prob(t_frac: float, driver_seed: float) -> float:
    """
    Simulate a realistic drowsiness curve over a shift.
    t_frac: 0.0 = shift start, 1.0 = shift end
    driver_seed: per-driver baseline offset [0, 1]

    Pattern:
      - 0–15%  of shift: low & stable (wake-up phase)
      - 15–60%:          slow rise
      - 60–85%:          peak drowsiness
      - 85–100%:         slight recovery (anticipation of stop)
    Plus random micro-spikes.
    """
    # Baseline shaped by a sine arc peaking at 70% through shift
    base = 0.08 + 0.18 * math.sin(math.pi * t_frac)
    # Driver-specific tendency (some drivers naturally drowsier)
    base += driver_seed * 0.15
    # Random fluctuation
    base += random.gauss(0, 0.04)
    # Occasional micro-spike (1 in 8 readings)
    if random.random() < 0.125:
        base += random.uniform(0.1, 0.25)
    return max(0.0, min(0.98, base))


def _features(drowsy_prob: float) -> dict:
    """
    Generate realistic facial feature values correlated with drowsy_prob.
    Higher drowsy_prob → lower EAR, higher PERCLOS, etc.
    """
    # EAR: alert ~0.30, drowsy ~0.18
    ear = _jitter(0.30 - drowsy_prob * 0.15, noise=0.02)
    # MAR: yawning more when drowsy
    mar = _jitter(0.45 + drowsy_prob * 0.25, noise=0.04)
    # PERCLOS: fraction of closed-eye frames; mirrors drowsy_prob loosely
    perclos = _jitter(drowsy_prob * 0.65, noise=0.05)
    # Yawn frequency: 0–0.4
    yawn_freq = _jitter(drowsy_prob * 0.4, noise=0.03)
    # Head pitch/yaw: nodding increases with drowsiness
    pitch = random.gauss(drowsy_prob * 12, 4)   # degrees
    yaw   = random.gauss(0, 8)
    # Eye closure (average over rolling window, mirrors EAR)
    eye_closure = _jitter(1.0 - ear - 0.05, noise=0.02)

    return {
        "ear":         round(ear, 4),
        "mar":         round(mar, 4),
        "pitch":       round(pitch, 2),
        "yaw":         round(yaw, 2),
        "eye_closure": round(eye_closure, 4),
        "perclos":     round(perclos, 4),
        "yawn_freq":   round(yawn_freq, 4),
    }


def _models(drowsy_prob: float) -> dict:
    """Simulate 5 model softmax outputs around the drowsy_prob value."""
    probs = {}
    for i in range(1, 6):
        noise = random.gauss(0, 0.06)
        probs[f"m{i}"] = round(max(0.0, min(1.0, drowsy_prob + noise)), 4)
    return probs


def generate_logs(session: dict, driver_seed: float) -> list:
    """Return a list of shift_drowsiness_logs documents for one session."""
    sid    = session["_id"]
    did    = session["driver_id"]
    route  = session.get("route", "")
    s_town, e_town = ROUTE_MAP.get(route, DEFAULT_ROUTE)

    try:
        started = datetime.fromisoformat(session["started_at"].replace("Z", ""))
        ended   = datetime.fromisoformat(session["ended_at"].replace("Z", ""))
    except (ValueError, KeyError):
        return []

    # Make timezone-aware (UTC)
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    if ended.tzinfo is None:
        ended = ended.replace(tzinfo=timezone.utc)

    duration = (ended - started).total_seconds()
    if duration < MIN_DURATION:
        return []

    n_readings = min(int(duration / INTERVAL_SEC), MAX_READINGS)
    if n_readings < 2:
        n_readings = 2

    docs = []
    for i in range(n_readings):
        elapsed = i * INTERVAL_SEC
        t_frac  = i / max(n_readings - 1, 1)
        ts      = started + timedelta(seconds=elapsed)

        dp      = _drowsy_prob(t_frac, driver_seed)
        verdict = "Drowsy" if dp >= 0.5 else "Alert"
        alert   = dp >= 0.65

        docs.append({
            "shift_id":              sid,
            "driver_id":             did,
            "schedule_id":           "",
            "route_name":            route,
            "start_town":            s_town,
            "end_town":              e_town,
            "timestamp":             ts,
            "shift_elapsed_seconds": elapsed,
            "drowsy_prob":           round(dp, 4),
            "verdict":               verdict,
            "alert_triggered":       alert,
            "face_detected":         True,
            "features":              _features(dp),
            "models":                _models(dp),
        })

    return docs


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Seed shift_drowsiness_logs")
    parser.add_argument("--clear",   action="store_true", help="Drop existing documents before seeding")
    parser.add_argument("--dry-run", action="store_true", help="Count docs without inserting")
    parser.add_argument(
        "--sessions-csv",
        default=r"C:\Users\wup03\Downloads\driveguard.driving_sessions.csv",
        help="Path to driveguard.driving_sessions.csv",
    )
    args = parser.parse_args()

    # Load sessions
    print(f"Reading sessions from: {args.sessions_csv}")
    sessions = []
    with open(args.sessions_csv, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            sessions.append(row)
    print(f"  Total sessions in CSV: {len(sessions)}")

    # Build per-driver seed (deterministic, based on driver_id hash)
    driver_seeds: dict[str, float] = {}
    for s in sessions:
        did = s.get("driver_id", "")
        if did and did not in driver_seeds:
            driver_seeds[did] = (hash(did) % 1000) / 1000.0

    # Generate documents
    all_docs = []
    skipped  = 0
    for s in sessions:
        if s.get("status") not in VALID_STATUSES:
            skipped += 1
            continue
        dseed = driver_seeds.get(s.get("driver_id", ""), 0.5)
        docs  = generate_logs(s, dseed)
        if docs:
            all_docs.extend(docs)
        else:
            skipped += 1

    print(f"  Sessions skipped (too short / invalid): {skipped}")
    print(f"  Sessions used: {len(sessions) - skipped}")
    print(f"  Documents generated: {len(all_docs)}")

    if args.dry_run:
        print("Dry-run mode — no documents inserted.")
        # Print sample
        if all_docs:
            sample = all_docs[0]
            sample_copy = {k: (v.isoformat() if isinstance(v, datetime) else v)
                           for k, v in sample.items()}
            import json
            print("\nSample document:")
            print(json.dumps(sample_copy, indent=2))
        return

    # Connect to MongoDB
    print(f"\nConnecting to MongoDB: {MONGO_URI}")
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
        print("  Connected ✓")
    except Exception as e:
        print(f"  Connection failed: {e}")
        sys.exit(1)

    db_name = MONGO_URI.rsplit("/", 1)[-1].split("?")[0] or "driveguard"
    db  = client[db_name]
    col = db["shift_drowsiness_logs"]

    if args.clear:
        result = col.delete_many({})
        print(f"  Cleared {result.deleted_count} existing documents.")

    # Insert in batches of 500
    inserted_total = 0
    batch_size = 500
    for i in range(0, len(all_docs), batch_size):
        batch = all_docs[i:i + batch_size]
        result = col.insert_many(batch)
        inserted_total += len(result.inserted_ids)
        print(f"  Inserted batch {i // batch_size + 1}: {len(result.inserted_ids)} docs "
              f"(total so far: {inserted_total})")

    print(f"\n✅  Done! {inserted_total} documents inserted into shift_drowsiness_logs.")

    # Ensure indexes
    col.create_index([("driver_id", 1), ("timestamp", -1)])
    col.create_index([("shift_id", 1), ("timestamp", 1)])
    print("  Indexes ensured ✓")

    # Quick verify
    total_in_db = col.count_documents({})
    unique_drivers = len(col.distinct("driver_id"))
    unique_shifts  = len(col.distinct("shift_id"))
    print(f"\n📊  Collection stats:")
    print(f"     Total documents : {total_in_db}")
    print(f"     Unique drivers  : {unique_drivers}")
    print(f"     Unique shifts   : {unique_shifts}")


if __name__ == "__main__":
    random.seed(42)   # reproducible output
    main()
