from datetime import datetime


class DriverProfile:
    """
    Extended driver-specific profile data stored in the 'driver_profiles'
    MongoDB collection, linked to the 'users' collection via user_id.

    The base 'User' model holds auth/identity fields (email, password, role).
    This model holds everything that only a driver has: vehicle assignment,
    route, shift, license details, emergency contact, etc.

    Admins do NOT have a DriverProfile — their profile is just the User doc.
    """

    def __init__(self, doc: dict):
        self._doc = doc

    # ── Accessors ──────────────────────────────────────────────────────────
    @property
    def user_id(self) -> str:
        return str(self._doc.get("user_id", ""))

    @property
    def license_number(self) -> str:
        return self._doc.get("license_number", "")

    @property
    def license_expiry(self):
        return self._doc.get("license_expiry")  # ISO string or None

    @property
    def phone(self) -> str:
        return self._doc.get("phone", "")

    @property
    def vehicle(self) -> str:
        return self._doc.get("vehicle", "")

    @property
    def route(self) -> str:
        return self._doc.get("route", "")

    @property
    def shift(self) -> str:
        return self._doc.get("shift", "")

    @property
    def emergency_contact(self) -> dict:
        return self._doc.get("emergency_contact", {"name": "", "phone": "", "relation": ""})

    @property
    def photo_url(self) -> str:
        return self._doc.get("photo_url", "")

    @property
    def experience_years(self) -> int:
        return self._doc.get("experience_years", 0)

    # ── Serialisation ──────────────────────────────────────────────────────
    def to_dict(self) -> dict:
        return {
            "user_id":          self.user_id,
            "license_number":   self.license_number,
            "license_expiry":   self.license_expiry,
            "phone":            self.phone,
            "vehicle":          self.vehicle,
            "route":            self.route,
            "shift":            self.shift,
            "emergency_contact":self.emergency_contact,
            "photo_url":        self.photo_url,
            "experience_years": self.experience_years,
            "updated_at":       self._doc.get("updated_at", datetime.utcnow()).isoformat(),
        }

    # ── Factory ────────────────────────────────────────────────────────────
    @staticmethod
    def new_doc(user_id: str) -> dict:
        """Return a blank driver profile document ready for MongoDB insert."""
        now = datetime.utcnow()
        return {
            "user_id":          user_id,
            "license_number":   "",
            "license_expiry":   None,
            "phone":            "",
            "vehicle":          "",
            "route":            "",
            "shift":            "",
            "emergency_contact": {"name": "", "phone": "", "relation": ""},
            "photo_url":        "",
            "experience_years": 0,
            "created_at":       now,
            "updated_at":       now,
        }
