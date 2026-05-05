from flask import Flask
from .routes.auth import auth_bp
from .routes.users import users_bp
from .routes.driver import driver_bp
from .routes.admin import admin_bp


def register_user_management(app: Flask):
    """Call this from your main app.py to attach all user management routes."""
    app.register_blueprint(auth_bp,   url_prefix="/api/auth")
    app.register_blueprint(users_bp,  url_prefix="/api/users")
    app.register_blueprint(driver_bp, url_prefix="/api/driver")
    app.register_blueprint(admin_bp,  url_prefix="/api/admin")
