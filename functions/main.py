import json
import os
import logging
import traceback
from firebase_functions import https_fn, options

logger = logging.getLogger(__name__)

# Python's firebase_functions SDK does not support 'cors' in set_global_options.
# Therefore, we define a global CORS configuration and apply it to all HTTP functions.
global_cors = options.CorsOptions(cors_origins="*", cors_methods=["get", "post", "options"])


@https_fn.on_request(cors=global_cors, memory=options.MemoryOption.MB_512)
def extract_document_data(req: https_fn.Request) -> https_fn.Response:
    """
    Extracts structured data from a document stored in GCS.
    Accepts POST requests with JSON payload: {"gcs_uri": "gs://...", "document_type": "..."}
    """
    if req.method != "POST":
        return https_fn.Response(
            json.dumps({"error": "Only POST requests are accepted"}),
            status=405,
            content_type="application/json"
        )

    try:
        data = req.get_json()
        if not data:
            return https_fn.Response(
                json.dumps({"error": "Missing JSON payload"}),
                status=400,
                content_type="application/json"
            )

        gcs_uri = data.get("gcs_uri")

        if not gcs_uri or not isinstance(gcs_uri, str):
            return https_fn.Response(
                json.dumps({"error": "Missing or invalid gcs_uri"}),
                status=400,
                content_type="application/json"
            )

        document_type = data.get("document_type")

        from core.extractor import DocumentExtractor
        extractor = DocumentExtractor()
        extracted_data = extractor.extract(gcs_uri, document_type=document_type)

        return https_fn.Response(
            json.dumps({"status": "success", "data": extracted_data}),
            status=200,
            content_type="application/json"
        )
    except ValueError as e:
        # Catch specific value errors raised during extraction (e.g., config missing)
        logger.error("ValueError in extract_document_data", exc_info=True)
        return https_fn.Response(
            json.dumps({
                "error": str(e),
                "traceback": traceback.format_exc()
            }),
            status=400,
            content_type="application/json"
        )
    except Exception as e:
        logger.error("Error in extract_document_data", exc_info=True)
        return https_fn.Response(
            json.dumps({
                "error": f"Internal server error: {str(e)}",
                "traceback": traceback.format_exc()
            }),
            status=500,
            content_type="application/json"
        )

@https_fn.on_request(cors=global_cors, memory=options.MemoryOption.MB_256)
def submit_audit_event(req: https_fn.Request) -> https_fn.Response:
    """
    Accepts feedback on document validation and logs it asynchronously to Firestore.
    Accepts POST requests with JSON payload containing:
    - document_id (optional, string)
    - document_type (string)
    - ai_detected (dict)
    - user_corrected (dict)
    - validation_errors (list)
    """
    if req.method != "POST":
        return https_fn.Response(
            json.dumps({"error": "Only POST requests are accepted"}),
            status=405,
            content_type="application/json"
        )

    try:
        data = req.get_json()
        if not data:
            return https_fn.Response(
                json.dumps({"error": "Missing JSON payload"}),
                status=400,
                content_type="application/json"
            )

        # Validate required fields
        if "document_type" not in data or "ai_detected" not in data or "user_corrected" not in data:
            return https_fn.Response(
                json.dumps({"error": "Missing required fields: document_type, ai_detected, user_corrected"}),
                status=400,
                content_type="application/json"
            )

        if not isinstance(data.get("ai_detected"), dict) or not isinstance(data.get("user_corrected"), dict):
            return https_fn.Response(
                json.dumps({"error": "ai_detected and user_corrected must be dictionaries"}),
                status=400,
                content_type="application/json"
            )

        event_data = {
            "document_id": data.get("document_id", "unknown"),
            "document_type": data.get("document_type"),
            "ai_detected": data.get("ai_detected"),
            "user_corrected": data.get("user_corrected"),
            "validation_errors": data.get("validation_errors", [])
        }

        # Asynchronously log the event to Firestore
        from core.audit import log_audit_event_async
        log_audit_event_async(event_data)

        # Return 200 OK immediately
        return https_fn.Response(
            json.dumps({"status": "success", "message": "Audit event submitted"}),
            status=200,
            content_type="application/json"
        )
    except Exception as e:
        return https_fn.Response(
            json.dumps({"error": f"Internal server error: {str(e)}"}),
            status=500,
            content_type="application/json"
        )

@https_fn.on_request(cors=global_cors, memory=options.MemoryOption.MB_256)
def api_status(req: https_fn.Request) -> https_fn.Response:
    """Returns the API status."""
    return https_fn.Response(
        json.dumps({"status": "online", "version": "1.0.0"}),
        content_type="application/json"
    )

@https_fn.on_request(cors=global_cors, memory=options.MemoryOption.MB_512)
def validate_document_text(req: https_fn.Request) -> https_fn.Response:
    """
    Validates typed text against ground truth deterministically.
    Accepts POST requests with JSON payload: {"ground_truth": {...}, "typed_text": "..."}
    """
    if req.method != "POST":
        return https_fn.Response(
            json.dumps({"error": "Only POST requests are accepted"}),
            status=405,
            content_type="application/json"
        )

    try:
        data = req.get_json()
        if not data:
            return https_fn.Response(
                json.dumps({"error": "Missing JSON payload"}),
                status=400,
                content_type="application/json"
            )

        ground_truth = data.get("ground_truth", {})
        typed_text = data.get("typed_text", "")

        if not isinstance(ground_truth, dict) or not isinstance(typed_text, str):
            return https_fn.Response(
                json.dumps({"error": "Invalid payload types. Expected dict for ground_truth and string for typed_text"}),
                status=400,
                content_type="application/json"
            )

        from core.validator import DocumentValidator
        validator = DocumentValidator(ground_truth, typed_text)
        errors = validator.validate()

        return https_fn.Response(
            json.dumps({"status": "success", "errors": errors}),
            status=200,
            content_type="application/json"
        )
    except Exception as e:
        return https_fn.Response(
            json.dumps({"error": f"Internal server error: {str(e)}"}),
            status=500,
            content_type="application/json"
        )
@https_fn.on_request(cors=global_cors, memory=options.MemoryOption.MB_256)
def log_audit_event(req: https_fn.Request) -> https_fn.Response:
    """
    Logs an audit event, such as marking a document as unreadable.
    Accepts POST requests with JSON payload: {"file_name": "...", "quality_flag": true/false}
    """
    if req.method != "POST":
        return https_fn.Response(
            json.dumps({"error": "Only POST requests are accepted"}),
            status=405,
            content_type="application/json"
        )

    try:
        data = req.get_json()
        if not data:
            return https_fn.Response(
                json.dumps({"error": "Missing JSON payload"}),
                status=400,
                content_type="application/json"
            )

        file_name = data.get("file_name")
        quality_flag = data.get("quality_flag")

        if not file_name or not isinstance(file_name, str):
            return https_fn.Response(
                json.dumps({"error": "Missing or invalid file_name"}),
                status=400,
                content_type="application/json"
            )

        if quality_flag is None or not isinstance(quality_flag, bool):
            return https_fn.Response(
                json.dumps({"error": "Missing or invalid quality_flag (must be boolean)"}),
                status=400,
                content_type="application/json"
            )

        from core.firebase_utils import _init_firebase
        _init_firebase()
        from firebase_admin import firestore
        db = firestore.client()

        # Determine the project ID from env, or use the fallback
        project_id = os.environ.get("FIREBASE_PROJECT_ID", "cartorio-meneghel-ai")

        doc_ref = db.collection("audit_logs").document()
        doc_ref.set({
            "file_name": file_name,
            "quality_flag": quality_flag,
            "timestamp": firestore.SERVER_TIMESTAMP,
            "project_id": project_id
        })

        return https_fn.Response(
            json.dumps({"status": "success", "message": "Audit event logged successfully"}),
            status=200,
            content_type="application/json"
        )
    except Exception as e:
        return https_fn.Response(
            json.dumps({"error": f"Internal server error: {str(e)}"}),
            status=500,
            content_type="application/json"
        )

@https_fn.on_request(cors=global_cors, memory=options.MemoryOption.MB_512)
def correct_document_text(req: https_fn.Request) -> https_fn.Response:
    """
    Applies semantic corrections to typed text based on validation errors, and performs a verification loop.
    Accepts POST requests with JSON payload:
    {"ground_truth": {...}, "typed_text": "...", "validation_errors": [...]}
    """
    if req.method != "POST":
        return https_fn.Response(
            json.dumps({"error": "Only POST requests are accepted"}),
            status=405,
            content_type="application/json"
        )

    try:
        data = req.get_json()
        if not data:
            return https_fn.Response(
                json.dumps({"error": "Missing JSON payload"}),
                status=400,
                content_type="application/json"
            )

        ground_truth = data.get("ground_truth", {})
        typed_text = data.get("typed_text", "")
        validation_errors = data.get("validation_errors", [])

        if not isinstance(ground_truth, dict) or not isinstance(typed_text, str) or not isinstance(validation_errors, list):
            return https_fn.Response(
                json.dumps({"error": "Invalid payload types. Expected dict for ground_truth, string for typed_text, and list for validation_errors"}),
                status=400,
                content_type="application/json"
            )

        if not validation_errors:
            return https_fn.Response(
                json.dumps({
                    "status": "success",
                    "corrected_text": typed_text,
                    "correction_successful": True,
                    "verification_errors": []
                }),
                status=200,
                content_type="application/json"
            )

        from core.corrector import DocumentCorrector
        from core.validator import DocumentValidator

        # 1. Apply semantic correction using AI
        corrector = DocumentCorrector()
        corrected_text = corrector.correct_text(typed_text, validation_errors)

        # 2. Mathematical verification loop
        # Run the corrected text back through the validator
        validator = DocumentValidator(ground_truth, corrected_text)
        verification_errors = validator.validate()

        # Check if the specifically targeted fields still have errors
        correction_successful = True
        targeted_fields = {error.get("field") for error in validation_errors if error.get("field")}

        for v_error in verification_errors:
            if v_error.get("field") in targeted_fields:
                correction_successful = False
                break

        return https_fn.Response(
            json.dumps({
                "status": "success",
                "corrected_text": corrected_text,
                "correction_successful": correction_successful,
                "verification_errors": verification_errors
            }),
            status=200,
            content_type="application/json"
        )

    except Exception as e:
        logger.error("Error in correct_document_text", exc_info=True)
        return https_fn.Response(
            json.dumps({
                "error": f"Internal server error: {str(e)}",
                "traceback": traceback.format_exc()
            }),
            status=500,
            content_type="application/json"
        )
