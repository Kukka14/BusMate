from datetime import datetime
from bson import ObjectId


class User:
    """
    Plain Python class that wraps a MongoDB document dict.
    Not an ORM model — just a convenient shape for the service layer.
    """

    def __init__(self, doc: dict):
        self._doc = doc

    # ── Accessors ──────────────────────────────────────────────────────────
    @property
    def id(self) -> str:
        return str(self._doc.get("_id", ""))

    @property
    def username(self) -> str:
        return self._doc.get("username", "")

    @property
    def email(self) -> str:
        return self._doc.get("email", "")

    @property
    def password_hash(self) -> str:
        return self._doc.get("password_hash", "")

    @property
    def role(self) -> str:
        return self._doc.get("role", "user")

    @property
    def is_active(self) -> bool:
        return self._doc.get("is_active", True)

    @property
    def sso_provider(self) -> str | None:
        return self._doc.get("sso_provider")

    @property
    def sso_subject(self) -> str | None:
        return self._doc.get("sso_subject")

    @property
    def company(self) -> str:
        return self._doc.get("company", "")

    # ── Serialisation ──────────────────────────────────────────────────────
    def to_dict(self) -> dict:
        # Normalize legacy "user" role → "driver" for frontend compatibility
        display_role = self.role if self.role != "user" else "driver"
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "role": display_role,
            "company": self.company,
            "is_active": self.is_active,
            "sso_provider": self.sso_provider,
            "created_at": self._doc.get("created_at", datetime.utcnow()).isoformat(),
        }

    # ── Factory ────────────────────────────────────────────────────────────
    @staticmethod
    def new_doc(username: str, email: str, password_hash: str,
                role: str = "user", sso_provider: str = None,
                sso_subject: str = None, company: str = "") -> dict:
        """Return a raw dict ready to be inserted into MongoDB."""
        now = datetime.utcnow()
        return {
            "username": username,
            "email": email,
            "password_hash": password_hash or "",
            "role": role,
            "company": company or "",
            "is_active": True,
            "sso_provider": sso_provider,
            "sso_subject": sso_subject,
            "created_at": now,
            "updated_at": now,
        }

    def __repr__(self):
        return f"<User {self.username}>"
