from pymongo import MongoClient, ASCENDING
from pymongo.errors import ConnectionFailure
import os

_client = None
_db = None


def get_db():
    """Return the MongoDB database instance (lazy singleton)."""
    global _client, _db
    if _db is None:
        uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/driveguard")
        _client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        db_name = uri.rsplit("/", 1)[-1].split("?")[0] or "driveguard"
        _db = _client[db_name]
        _ensure_indexes(_db)
    return _db


def _ensure_indexes(db):
    db.users.create_index([("email", ASCENDING)], unique=True)
    db.users.create_index([("username", ASCENDING)], unique=True)
    db.driving_sessions.create_index([("driver_id", ASCENDING), ("started_at", ASCENDING)])


def ping():
    try:
        get_db().command("ping")
        return True
    except ConnectionFailure:
        return False
