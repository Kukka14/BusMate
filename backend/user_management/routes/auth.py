import os
from flask import Blueprint, request, jsonify, redirect
from ..services.user_service import UserService
from ..utils.auth_helpers import token_required
from ..utils.auth_helpers import generate_token

auth_bp = Blueprint("auth", __name__)


# ── Standard auth ────────────────────────────────────────────────────
@auth_bp.post("/register")
def register():
    data = request.get_json()
    requested_role = data.get("role", "driver")
    # Admin accounts cannot be self-registered through the public endpoint.
    if requested_role == "admin":
        return jsonify({
            "error": "Admin accounts cannot be self-registered. "
                     "Contact your system administrator."
        }), 403
    # Force to 'driver' for any unknown roles
    if requested_role not in ("driver",):
        requested_role = "driver"
    result, status = UserService.register(
        username=data.get("username"),
        email=data.get("email"),
        password=data.get("password"),
        company=data.get("company", ""),
        role=requested_role,
    )
    return jsonify(result), status


@auth_bp.post("/login")
def login():
    data = request.get_json()
    result, status = UserService.login(
        email=data.get("email"),
        password=data.get("password"),
        role=data.get("role"),
    )
    return jsonify(result), status


@auth_bp.post("/logout")
@token_required
def logout(current_user):
    return jsonify({"message": "Logged out"}), 200


# ── SSO ──────────────────────────────────────────────────────────────
@auth_bp.get("/sso/login")
def sso_login():
    """
    Redirect the browser to the SSO provider's authorization endpoint.
    In production replace this stub with a real OIDC/SAML redirect.
    """
    provider_url = os.getenv("SSO_PROVIDER_URL", "")
    client_id    = os.getenv("SSO_CLIENT_ID",    "")
    redirect_uri = os.getenv("SSO_REDIRECT_URI", "http://localhost:5174/login/sso/callback")

    if not provider_url:
        # Dev stub: return a demo token so the frontend can test the flow
        return jsonify({"sso_url": None, "stub": True,
                        "message": "Set SSO_PROVIDER_URL in .env to enable real SSO"}), 200

    authorization_url = (
        f"{provider_url}/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=openid%20email%20profile"
    )
    return jsonify({"sso_url": authorization_url}), 200


@auth_bp.post("/sso/callback")
def sso_callback():
    """
    Exchange the authorization code (sent from the frontend)
    for user info, then issue a JWT.
    In production: verify the OIDC token / SAML assertion here.
    """
    data = request.get_json()
    code = data.get("code")          # OIDC auth code
    provider = data.get("provider", "sso")

    # ——  STUB for local dev  ——
    # In production, exchange 'code' with the IdP for an id_token,
    # verify it, then extract sub/email/name.
    if not code:
        return jsonify({"error": "Authorization code required"}), 400

    # Simulated IdP response (replace with real token exchange)
    sso_subject = f"sso_stub_{code[:8]}"
    email       = data.get("email",    f"{sso_subject}@enterprise.local")
    username    = data.get("username", sso_subject)

    result, status = UserService.login_or_register_sso(
        provider=provider,
        subject=sso_subject,
        email=email,
        username=username,
    )
    return jsonify(result), status
