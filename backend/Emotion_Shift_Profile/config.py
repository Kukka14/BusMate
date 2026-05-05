import os


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
    JWT_SECRET = os.getenv("JWT_SECRET", "jwt-secret-key")
    JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", 24))

    # MongoDB
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/driveguard")

    # SSO (SAML / OIDC)
    SSO_PROVIDER_URL = os.getenv("SSO_PROVIDER_URL", "")
    SSO_CLIENT_ID = os.getenv("SSO_CLIENT_ID", "")
    SSO_CLIENT_SECRET = os.getenv("SSO_CLIENT_SECRET", "")
    SSO_REDIRECT_URI = os.getenv("SSO_REDIRECT_URI", "http://localhost:5174/login/sso/callback")
