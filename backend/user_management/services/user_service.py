from datetime import datetime
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from ..database import get_db
from ..models.user import User
from ..utils.password import hash_password, check_password
from ..utils.auth_helpers import generate_token


class UserService:

    # ── Auth ────────────────────────────────────────────────────────────
    @staticmethod
    def register(username, email, password, company="", role="driver"):
        if not username or not email or not password:
            return {"error": "All fields are required"}, 400

        db = get_db()
        doc = User.new_doc(
            username=username,
            email=email,
            password_hash=hash_password(password),
            role=role,
            company=company or "",
        )
        try:
            result = db.users.insert_one(doc)
            doc["_id"] = result.inserted_id
            return {"message": "User registered", "user": User(doc).to_dict()}, 201
        except DuplicateKeyError as e:
            field = "Email" if "email" in str(e) else "Username"
            return {"error": f"{field} already in use"}, 409

    @staticmethod
    def login(email, password, role=None):
        db = get_db()
        doc = db.users.find_one({"email": email})
        if not doc:
            return {"error": "Invalid credentials"}, 401

        user = User(doc)
        if not user.is_active:
            return {"error": "Account is disabled"}, 403
        if not check_password(password, user.password_hash):
            return {"error": "Invalid credentials"}, 401

        # Role verification: if a role was selected on the login form, check it matches
        # Treat legacy "user" role as equivalent to "driver"
        effective_role = user.role if user.role != "user" else "driver"
        if role and effective_role != role:
            role_display = "Admin" if role == "admin" else "Driver"
            return {"error": f"This account does not have {role_display} access."}, 403

        token = generate_token(user.id, user.role)
        return {"token": token, "user": user.to_dict()}, 200

    @staticmethod
    def login_or_register_sso(provider: str, subject: str,
                               email: str, username: str):
        """Find-or-create a user from an SSO assertion."""
        db = get_db()
        doc = db.users.find_one({"sso_provider": provider, "sso_subject": subject})
        if not doc:
            doc = db.users.find_one({"email": email})

        if doc:
            user = User(doc)
            if not user.is_active:
                return {"error": "Account is disabled"}, 403
            # link SSO if not already
            if not doc.get("sso_provider"):
                db.users.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"sso_provider": provider, "sso_subject": subject,
                              "updated_at": datetime.utcnow()}}
                )
        else:
            new_doc = User.new_doc(
                username=username or email.split("@")[0],
                email=email,
                password_hash="",
                role="user",
                sso_provider=provider,
                sso_subject=subject,
            )
            try:
                result = db.users.insert_one(new_doc)
                new_doc["_id"] = result.inserted_id
                doc = new_doc
            except DuplicateKeyError:
                return {"error": "Account conflict — contact support"}, 409

        user = User(doc)
        token = generate_token(user.id, user.role)
        return {"token": token, "user": user.to_dict()}, 200

    # ── CRUD ───────────────────────────────────────────────────────────
    @staticmethod
    def get_all():
        db = get_db()
        return [User(doc) for doc in db.users.find()]

    @staticmethod
    def get_by_id(user_id: str):
        db = get_db()
        try:
            doc = db.users.find_one({"_id": ObjectId(user_id)})
        except Exception:
            return None
        return User(doc) if doc else None

    @staticmethod
    def update(user_id: str, data: dict):
        db = get_db()
        update = {"updated_at": datetime.utcnow()}
        if "username" in data: update["username"] = data["username"]
        if "email"    in data: update["email"]    = data["email"]
        if "password" in data: update["password_hash"] = hash_password(data["password"])
        if "role"     in data: update["role"]     = data["role"]
        if "is_active" in data: update["is_active"] = data["is_active"]
        try:
            res = db.users.find_one_and_update(
                {"_id": ObjectId(user_id)},
                {"$set": update},
                return_document=True
            )
        except Exception:
            return {"error": "Invalid ID"}, 400
        if not res:
            return {"error": "User not found"}, 404
        return {"message": "Updated", "user": User(res).to_dict()}, 200

    @staticmethod
    def delete(user_id: str):
        db = get_db()
        try:
            res = db.users.delete_one({"_id": ObjectId(user_id)})
        except Exception:
            return {"error": "Invalid ID"}, 400
        if res.deleted_count == 0:
            return {"error": "User not found"}, 404
        return {"message": "User deleted"}, 200
