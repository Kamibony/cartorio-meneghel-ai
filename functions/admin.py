import os
import json
import logging
from firebase_functions import https_fn, options
from firebase_admin import auth, firestore
from core.firebase_utils import _init_firebase
from core.config import global_cors

logger = logging.getLogger(__name__)

@https_fn.on_request(cors=global_cors, memory=options.MemoryOption.MB_256)
def inviteEmployee(req: https_fn.Request) -> https_fn.Response:
    """
    Invites a new Escrevente or Cartorio Admin by a Cartorio Admin.
    """
    if req.method != "POST":
        return https_fn.Response(
            json.dumps({"error": "Only POST requests are accepted"}),
            status=405,
            content_type="application/json"
        )

    auth_header = req.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return https_fn.Response(
            json.dumps({"error": "Unauthorized"}),
            status=401,
            content_type="application/json"
        )

    token = auth_header.split("Bearer ")[1]
    _init_firebase()

    try:
        decoded_token = auth.verify_id_token(token)
        caller_uid = decoded_token.get("uid")

        db = firestore.client()
        caller_doc = db.collection("users").document(caller_uid).get()
        if not caller_doc.exists:
            return https_fn.Response(json.dumps({"error": "Caller user not found in database"}), status=403)

        caller_data = caller_doc.to_dict()

        # Use token claims if available, otherwise fallback to database document
        caller_role = decoded_token.get("role") or caller_data.get("role")
        caller_cartorio = decoded_token.get("cartorio_id") or caller_data.get("cartorio_id")

        if caller_role not in ["super_admin", "cartorio_admin"]:
            return https_fn.Response(json.dumps({"error": "Forbidden: Requires cartorio_admin privileges"}), status=403)

        data = req.get_json(silent=True)
        if not data or not data.get("email"):
            return https_fn.Response(json.dumps({"error": "Missing email in payload"}), status=400)

        email = data.get("email")
        role = data.get("role", "escrevente") # Default to escrevente

        if role not in ["escrevente", "cartorio_admin"]:
            return https_fn.Response(json.dumps({"error": "Invalid role requested"}), status=400)

        target_cartorio_id = caller_cartorio
        if caller_role == "super_admin" and data.get("cartorio_id"):
            target_cartorio_id = data.get("cartorio_id")

        # Create user in Firebase Auth
        try:
            new_user = auth.create_user(
                email=email,
                email_verified=False
            )
        except auth.EmailAlreadyExistsError:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.ALREADY_EXISTS,
                message="Email já cadastrado."
            )

        # Set Custom Claims
        auth.set_custom_user_claims(new_user.uid, {
            "cartorio_id": target_cartorio_id,
            "role": role
        })

        # Send password reset link
        link = auth.generate_password_reset_link(email)
        # In a real app we'd email this link using SendGrid or similar.
        # For this exercise, we can return the link or assume it's handled.

        # Create user document
        db.collection("users").document(new_user.uid).set({
            "uid": new_user.uid,
            "email": email,
            "role": role,
            "cartorio_id": target_cartorio_id,
            "status": "active",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP
        })

        return https_fn.Response(
            json.dumps({"status": "success", "message": "User invited successfully", "uid": new_user.uid, "reset_link": link}),
            status=200,
            content_type="application/json"
        )

    except https_fn.HttpsError as e:
        return https_fn.Response(json.dumps({"error": e.message}), status=400)
    except Exception as e:
        logger.error(f"Error in inviteEmployee: {e}", exc_info=True)
        return https_fn.Response(json.dumps({"error": str(e)}), status=500)

@https_fn.on_request(cors=global_cors, memory=options.MemoryOption.MB_256)
def revokeEmployeeAccess(req: https_fn.Request) -> https_fn.Response:
    """
    Revokes access for an Escrevente by a Cartorio Admin.
    """
    if req.method != "POST":
        return https_fn.Response(
            json.dumps({"error": "Only POST requests are accepted"}),
            status=405,
            content_type="application/json"
        )

    auth_header = req.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return https_fn.Response(
            json.dumps({"error": "Unauthorized"}),
            status=401,
            content_type="application/json"
        )

    token = auth_header.split("Bearer ")[1]
    _init_firebase()

    try:
        decoded_token = auth.verify_id_token(token)
        caller_uid = decoded_token.get("uid")

        db = firestore.client()
        caller_doc = db.collection("users").document(caller_uid).get()
        if not caller_doc.exists:
            return https_fn.Response(json.dumps({"error": "Caller user not found in database"}), status=403)

        caller_data = caller_doc.to_dict()

        # Use token claims if available, otherwise fallback to database document
        caller_role = decoded_token.get("role") or caller_data.get("role")
        caller_cartorio = decoded_token.get("cartorio_id") or caller_data.get("cartorio_id")

        if caller_role not in ["super_admin", "cartorio_admin"]:
            return https_fn.Response(json.dumps({"error": "Forbidden: Requires cartorio_admin privileges"}), status=403)

        data = req.get_json(silent=True)
        if not data:
            return https_fn.Response(json.dumps({"error": "Missing or invalid JSON payload"}), status=400)

        target_uid = data.get("uid")

        if not target_uid:
            return https_fn.Response(json.dumps({"error": "Missing uid in payload"}), status=400)

        if target_uid == caller_uid:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Cannot revoke your own access.")

        # Verify target user belongs to same cartorio
        target_doc = db.collection("users").document(target_uid).get()
        if not target_doc.exists:
            return https_fn.Response(json.dumps({"error": "Target user not found"}), status=404)

        target_data = target_doc.to_dict()
        if target_data.get("cartorio_id") != caller_cartorio and caller_role != "super_admin":
            return https_fn.Response(json.dumps({"error": "Forbidden: Cannot revoke access for user in different cartorio"}), status=403)

        if target_data.get("role") == "cartorio_admin" and caller_role != "super_admin":
             return https_fn.Response(json.dumps({"error": "Forbidden: Cannot revoke another admin"}), status=403)

        # Revoke access in Firebase Auth
        auth.update_user(target_uid, disabled=True)
        auth.revoke_refresh_tokens(target_uid)

        # Update status in Firestore
        db.collection("users").document(target_uid).update({
            "status": "revoked",
            "updatedAt": firestore.SERVER_TIMESTAMP
        })

        return https_fn.Response(
            json.dumps({"status": "success", "message": "Access revoked successfully"}),
            status=200,
            content_type="application/json"
        )

    except https_fn.HttpsError as e:
        return https_fn.Response(json.dumps({"error": e.message}), status=400)
    except Exception as e:
        logger.error(f"Error in revokeEmployeeAccess: {e}", exc_info=True)
        return https_fn.Response(json.dumps({"error": str(e)}), status=500)
