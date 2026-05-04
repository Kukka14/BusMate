"""
seed_admin.py
─────────────
Run this script once (or any time) to create / reset the hard-coded
admin account in MongoDB.

Usage:
    cd backend
    python seed_admin.py

The credentials are read from backend/.env:
    ADMIN_EMAIL    (default: admin@busmate.com)
    ADMIN_USERNAME (default: BusMate Admin)
    ADMIN_PASSWORD (default: BusMate@Admin2025)
    ADMIN_COMPANY  (default: BusMate Fleet)
"""

import os
import sys
from pathlib import Path
from datetime import datetime

# ── Load .env ────────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    print("[seed] python-dotenv not installed — reading env vars from shell only")

# ── Config ───────────────────────────────────────────────────────────────────
ADMIN_EMAIL    = os.getenv("ADMIN_EMAIL",    "admin@busmate.com")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "BusMate Admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "BusMate@Admin2025")
ADMIN_COMPANY  = os.getenv("ADMIN_COMPANY",  "BusMate Fleet")
MONGO_URI      = os.getenv("MONGO_URI",      "mongodb://localhost:27017/driveguard")

print("=" * 55)
print("  BusMate Admin Seed Script")
print("=" * 55)
print(f"  Email    : {ADMIN_EMAIL}")
print(f"  Username : {ADMIN_USERNAME}")
print(f"  Company  : {ADMIN_COMPANY}")
print(f"  Password : {'*' * len(ADMIN_PASSWORD)}")
print("=" * 55)

# ── Dependencies ─────────────────────────────────────────────────────────────
try:
    import bcrypt
    from pymongo import MongoClient
except ImportError as e:
    print(f"\n[ERROR] Missing dependency: {e}")
    print("  Run:  pip install pymongo bcrypt")
    sys.exit(1)

# ── Connect to MongoDB ───────────────────────────────────────────────────────
try:
    client  = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db_name = MONGO_URI.rsplit("/", 1)[-1].split("?")[0] or "driveguard"
    db      = client[db_name]
    client.admin.command("ping")
    print(f"\n[DB] Connected to MongoDB → database: {db_name}")
except Exception as e:
    print(f"\n[ERROR] Cannot connect to MongoDB: {e}")
    print("  Check MONGO_URI in backend/.env")
    sys.exit(1)

# ── Hash password ────────────────────────────────────────────────────────────
pw_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()

# ── Upsert admin ─────────────────────────────────────────────────────────────
now      = datetime.utcnow()
existing = db.users.find_one({"email": ADMIN_EMAIL})

if existing:
    db.users.update_one(
        {"email": ADMIN_EMAIL},
        {"$set": {
            "username":      ADMIN_USERNAME,
            "password_hash": pw_hash,
            "role":          "admin",
            "company":       ADMIN_COMPANY,
            "is_active":     True,
            "updated_at":    now,
        }},
    )
    print(f"\n[seed] ✓ Admin account UPDATED  → {ADMIN_EMAIL}")
    print(f"        (existing _id kept: {existing['_id']})")
else:
    doc = {
        "username":      ADMIN_USERNAME,
        "email":         ADMIN_EMAIL,
        "password_hash": pw_hash,
        "role":          "admin",
        "company":       ADMIN_COMPANY,
        "is_active":     True,
        "sso_provider":  None,
        "sso_subject":   None,
        "created_at":    now,
        "updated_at":    now,
    }
    result = db.users.insert_one(doc)
    print(f"\n[seed] ✓ Admin account CREATED  → {ADMIN_EMAIL}")
    print(f"        _id: {result.inserted_id}")

print("\n  Login credentials:")
print(f"    Email    : {ADMIN_EMAIL}")
print(f"    Password : {ADMIN_PASSWORD}")
print("\n  Done. Restart the Flask server if it is running.")
print("=" * 55)
