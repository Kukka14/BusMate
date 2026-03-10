from flask import Blueprint, jsonify, request
from ..services.user_service import UserService
from ..utils.auth_helpers import token_required, admin_required

users_bp = Blueprint("users", __name__)


@users_bp.get("/")
@token_required
@admin_required
def list_users(current_user):
    users = UserService.get_all()
    return jsonify([u.to_dict() for u in users]), 200


@users_bp.get("/<string:user_id>")
@token_required
def get_user(current_user, user_id):
    user = UserService.get_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user.to_dict()), 200


@users_bp.put("/<string:user_id>")
@token_required
def update_user(current_user, user_id):
    data = request.get_json()
    result, status = UserService.update(user_id, data)
    return jsonify(result), status


@users_bp.delete("/<string:user_id>")
@token_required
@admin_required
def delete_user(current_user, user_id):
    result, status = UserService.delete(user_id)
    return jsonify(result), status
