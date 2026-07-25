# Technical Design Document (TDD): Cartório Meneghel AI

## 1. System Architecture Overview

The "Cartório Meneghel AI" project is a B2B SaaS platform designed to assist Brazilian Notary Offices (Cartórios) in validating manually transcribed legal drafts against scanned identity documents. The system employs a "Read-Only Audit/Validation" architecture, ensuring 100% accuracy and preventing AI hallucinations from leaking into final legal documents.

**Core Flow of Data:**
1.  **Document Upload (Frontend):** The user uploads source identity documents (e.g., CNH, RG, Certidões) via the frontend (`DocumentViewer.tsx`).
2.  **Storage (GCS):** The frontend uploads these files directly to Google Cloud Storage (Firebase Storage) and retrieves their `gs://` URIs.
3.  **Extraction Trigger (Backend):** The frontend calls the backend HTTP Cloud Function (`extract_document_data`) with the GCS URI.
4.  **AI Extraction (Vertex AI):** The backend uses Vertex AI with the **Gemini 2.5 Flash** model (via `core/extractor.py`) to asynchronously extract structured entity data from the documents. It uses a strict system prompt with `temperature=0.0` to minimize hallucinations.
5.  **Aggregation & Deduplication (Frontend/Backend):**
    - The frontend aggregates the extracted JSON data into a unified "Ground Truth" state.
    - Entities are deduplicated using an O(N^2) pairwise algorithm based on CPF, normalized names, and parent names, enforcing a "Universal Legal Hierarchy Rule" (e.g., *Certidões* take precedence).
    - Conflicts are flagged in a `_conflicts` object for human resolution.
6.  **Human-in-the-Loop Validation:** The user uploads or types a legal draft (the "minuta"). The backend `validate_document_text` endpoint is called.
7.  **Deterministic Auditing:** The backend extracts entities from the draft text using Gemini, but then deterministically compares them (via Python code in `validator.py`) against the provided Ground Truth, using exact substring matching to filter out LLM hallucinations.
8.  **Formatting & Visual Review (Frontend):** Discrepancies are shown to the user. The user can request the LLM to format the draft securely injecting ground truth data. The frontend displays a track-changes visual review using `diff-match-patch`.

## 2. Backend Breakdown (Python Functions)

The backend is built with **Firebase Cloud Functions (Python 3.11)**. It handles AI extraction, deterministic validation, and audit logging.

### Core Modules (`functions/core/`):
*   **`extractor.py`**: The core AI orchestration module.
    *   Uses `google-genai` (Vertex AI integration) to call Gemini 2.5 Flash.
    *   Implements `DocumentExtractor` with methods `extract` (for source documents) and `extract_from_text` (for drafts). It uses structured XML-like prompts and strict schemas.
    *   Contains the `deduplicate_entities` function, which merges entities across documents, applying the Universal Legal Hierarchy Rule and explicitly flagging conflicting values instead of silently overwriting them.
    *   Implements `audit_draft`, which extracts data from a draft and deterministically compares it to the ground truth.
    *   Applies rate limiting and retries using `threading.Semaphore` and `tenacity`.
*   **`validator.py`**: The deterministic hallucination filter.
    *   Contains `normalize_digits`, `normalize_string`, and `normalize_date` to handle Brazilian Portuguese text nuances (e.g., gender suffixes, accents).
    *   Implements `DocumentValidator`, which filters the raw discrepancies from the LLM. It drops `VALUE_MISMATCH` errors if the expected value matches the text after normalization, and drops `MISSING_FIELD` errors if the expected text is actually present in the raw text (reverse-hallucination check).
    *   Defines `CORE_IDENTITY_FIELDS` to restrict validation to specific fields.
*   **`audit.py`**: Handles synchronous (but conceptually asynchronous to the frontend flow) logging of audit events to Firestore using `firebase-admin`.
*   **`firebase_utils.py`**: Lazily initializes the Firebase Admin SDK (`_init_firebase`).

### Main Entry Points (`functions/main.py`):
HTTP Cloud Functions decorated with `@https_fn.on_request`:
*   `extract_batch_document_data`: Processes a batch of GCS URIs using Map-Reduce (extract individually, merge deterministically).
*   `extract_document_data`: Extracts entities from a single source document.
*   `submit_audit_event`: Logs validation feedback to Firestore.
*   `api_status`: Simple health check.
*   `format_draft`: Secures injects Ground Truth into the raw draft using an LLM, returning the formatted text.
*   `validate_document_text`: Triggers the deterministic cross-checking process.
*   `log_audit_event`: Logs general file quality flags.
*   `log_hitl_resolution`: Logs when a user resolves a validation discrepancy manually.

## 3. Frontend Breakdown (React/Vite/TS)

The frontend is a Single Page Application built with **React, Vite, and TypeScript**, styled with Tailwind CSS.

### Main Components (`frontend/src/components/`):
*   **`DocumentViewer.tsx`**:
    *   Manages the upload of source documents.
    *   Displays uploaded files using `URL.createObjectURL` for immediate local preview.
    *   Uses `react-zoom-pan-pinch` for zooming and panning documents.
    *   Orchestrates the multi-document state, merging entities from different files into a unified state and applying fallback deterministic merging logic similar to the backend.
*   **`DataChecker.tsx`**:
    *   The primary Validation UI. It receives `groundTruth` as a prop.
    *   Allows uploading a draft file or typing text directly.
    *   Handles Human-in-the-Loop conflict resolution if source documents have conflicting data.
    *   Displays validation errors returned by the backend as actionable cards.
    *   Implements a 3-tab review system: "Validação" (errors), "Revisão Visual" (track changes), and "Minuta Corrigida" (final text).
    *   Uses `diff-match-patch` with custom word-level tokenization for the "Revisão Visual" tab to highlight changes gracefully.

### Custom Hooks (`frontend/src/hooks/`):
*   **`useDocumentUpload.ts`**: Handles uploading a file to Firebase Storage (`gs://` URI) and immediately calling the `extract_document_data` backend endpoint. Manages loading and error states.
*   **`useAuditLog.ts`**: Provides a reusable function to call the `log_audit_event` backend endpoint.

### State Management & Communication:
*   State is strictly managed locally using React `useState` and `useRef`.
*   The overall state (`groundTruth`) flows from `DocumentViewer` (extraction) up to a parent component (likely `App.tsx`) and down into `DataChecker` (validation).
*   Communication with Firebase backend functions is done via native `fetch` API calls, using `VITE_API_URL` as the base URL. Firebase Hosting rewrites proxy `/api/*` to the respective Cloud Functions, preventing CORS issues.

## 4. Database Schema

The system primarily uses **Firestore** for audit logging and **Google Cloud Storage** for storing documents.

### Firestore Collections:
*   **`audit_logs`**: Stores various audit and Human-in-the-Loop (HitL) resolution events.
    *   Fields vary by event type but generally include:
        *   `timestamp`: Firestore Server Timestamp.
        *   `project_id`: The GCP project ID.
        *   `event_type`: e.g., "hitl_resolution".
        *   `document_id`: Optional identifier.
        *   `file_name`, `quality_flag`: For general logs.
        *   `field`, `expected`, `found`, `resolution_type`: For HitL resolutions.
        *   `ai_detected`, `user_corrected`, `validation_errors`: For full audit events.

### Data Models (JSON Schemas):
The backend Python dictionaries dictate the data schema.
*   **Entity Data Model:**
    ```json
    {
      "nome": "João Silva",
      "cpf": "123.456.789-00",
      "rg": "1234567",
      "orgao_emissor_rg": "SSP",
      "data_nascimento": "1990-01-01",
      "estado_civil": "Casado(a)",
      "filiacao_mae": "Maria Silva",
      "filiacao_pai": "José Silva",
      "naturalidade": "São Paulo - SP",
      "has_marriage_certificate": true,
      "_source_document_type": "Certidão de Casamento",
      "sources": ["RG", "Certidão de Casamento"],
      "_conflicts": {
        "estado_civil": {
          "options": [
            {"value": "Solteiro", "source": "RG"},
            {"value": "Casado(a)", "source": "Certidão de Casamento"}
          ]
        }
      },
      "_resolved_conflicts": ["estado_civil"]
    }
    ```

## 5. Deployment & CI/CD

Deployment is automated via GitHub Actions (`.github/workflows/deploy.yml`).

*   **Workflow Steps:**
    1.  **Frontend Build:** Installs Node.js dependencies and builds the Vite app.
    2.  **Frontend Deploy:** Uses `FirebaseExtended/action-hosting-deploy` to deploy the `frontend/dist` folder to Firebase Hosting.
    3.  **Backend Setup:** Sets up Python 3.11, creates a `venv`, and installs `requirements.txt`.
    4.  **GCP Auth & Config:** Authenticates with GCP using Application Default Credentials (ADC) via `FIREBASE_SERVICE_ACCOUNT`. It programmatically enables `aiplatform.googleapis.com` (Vertex AI API) using the `gcloud CLI` and sets CORS rules for GCS using `gsutil`.
    5.  **Backend Deploy:** Uses the `firebase-tools` CLI to deploy the Python backend to Firebase Cloud Functions.
*   **Firebase Configuration (`firebase.json`):** Crucially uses Hosting Rewrites (`"source": "/api/*", "function": "..."`) to map frontend requests to the correct Cloud Functions, acting as a reverse proxy to eliminate CORS problems and provide clean URLs.

## 6. Current Status & Missing Pieces

**Current Status:**
The core pipeline (Upload -> Extract -> Merge -> Validate -> Display) is structurally complete. The deterministic validation engine effectively filters LLM hallucinations. The frontend implements the necessary UI for multi-document review and visual diffing.

**Technical Debt & Missing Pieces:**
*   **Backend Data Models:** The Python backend currently relies heavily on unstructured dictionaries (`Dict[str, Any]`). This is identified as a planned migration area in memory: moving to strict Pydantic models or dataclasses is needed to natively enforce schemas and encapsulate merging logic safely.
*   **Frontend Merging Logic Duplication:** `DocumentViewer.tsx` contains significant fallback deterministic merging logic (`isNameCompatible`, conflict generation) that partially duplicates the logic in `backend/core/extractor.py`. This logic should ideally be centralized in the backend to ensure a single source of truth, though it might be present in the frontend for immediate responsiveness.
*   **File Cleanup:** The frontend uses `URL.revokeObjectURL` on unmount, but continuous file swapping might leave un-revoked URLs in memory during a long session.
*   **Environment Variables:**
    *   Local `.env` files are required for development but excluded from git (e.g., `VITE_API_URL` for the frontend to point to the local emulator, `CORS_ORIGINS` for the backend).
    *   GitHub Secrets (`FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT`) are critical for the CI/CD pipeline to function. Explicit API keys (like `GEMINI_API_KEY`) must not be used, as the system relies on ADC for Vertex AI.
