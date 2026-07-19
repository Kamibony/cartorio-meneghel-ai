import json
import os
from firebase_functions import https_fn, options
from firebase_admin import initialize_app, firestore

cors_options = options.CorsOptions(cors_origins=os.environ.get("CORS_ORIGINS", "*").split(","))

from core.validator import DocumentValidator
from core.extractor import get_extractor

initialize_app()

@https_fn.on_request()
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
        document_type = data.get("document_type")

        if not gcs_uri or not isinstance(gcs_uri, str):
            return https_fn.Response(
                json.dumps({"error": "Missing or invalid gcs_uri"}),
                status=400,
                content_type="application/json"
            )

        if not document_type or not isinstance(document_type, str):
            return https_fn.Response(
                json.dumps({"error": "Missing or invalid document_type"}),
                status=400,
                content_type="application/json"
            )

        try:
            extractor = get_extractor(document_type)
        except ValueError as e:
            return https_fn.Response(
                json.dumps({"error": str(e)}),
                status=400,
                content_type="application/json"
            )

        extracted_data = extractor.extract(gcs_uri)

        return https_fn.Response(
            json.dumps({"status": "success", "data": extracted_data}),
            status=200,
            content_type="application/json"
        )
    except ValueError as e:
        # Catch specific value errors raised during extraction (e.g., config missing)
        return https_fn.Response(
            json.dumps({"error": str(e)}),
            status=400,
            content_type="application/json"
        )
    except Exception as e:
        return https_fn.Response(
            json.dumps({"error": f"Internal server error: {str(e)}"}),
            status=500,
            content_type="application/json"
        )

@https_fn.on_request()
def api_status(req: https_fn.Request) -> https_fn.Response:
    """Returns the API status."""
    return https_fn.Response(
        json.dumps({"status": "online", "version": "1.0.0"}),
        content_type="application/json"
    )

@https_fn.on_request(cors=cors_options)
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
@https_fn.on_request(cors=cors_options)
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
