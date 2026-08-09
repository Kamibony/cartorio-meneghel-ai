# SYSTEM_STATE_REPORT.md

## Overview
This document serves as the unified baseline for the Cartório Meneghel AI system, detailing the current production status, capabilities, and the planned architecture for upcoming modules. The system operates as a B2B SaaS platform for Brazilian Notary Offices (Cartórios), ensuring 100% accuracy and preventing AI hallucinations from leaking into final legal documents through a strict Read-Only Audit/Validation architecture.

## 1. Module 1: Extraction, Validation, and Human-in-the-Loop (HitL)

### Current Production Status
Module 1 is currently in a structurally complete production state. The core pipeline is fully operational:
*   **Upload:** Secure document upload (PDFs/Images) directly to Google Cloud Storage (GCS) isolated by tenant path (`cartorios/${cartorioId}/scans/`).
*   **Extract:** Asynchronous, stochastic extraction using Vertex AI (Gemini 2.5 Flash) structured outputs with a `temperature=0.0`.
*   **Merge & Deduplicate:** Multi-document entity merging using a Master Truth Profile architecture. It deduplicates entities via an O(N^2) pairwise algorithm.
*   **Validate:** Deterministic validation cross-checking a user-provided draft text against the extracted Ground Truth to filter out AI hallucinations.
*   **HitL:** A 3-tab review system in the frontend ("Validação", "Revisão Visual", "Minuta Corrigida") allowing the user to resolve discrepancies using `diff-match-patch` for character-level visual diffing.

### Capabilities & Key Features
*   **Universal Legal Hierarchy Rule:** Applies Document Hierarchy Weights (e.g., Certidões > IDs) to silently resolve expected state changes.
*   **Hard Conflict Resolution:** Hard conflicts (mismatches on immutable fields like CPF or DOB) are strictly flagged in a `_conflicts` object, forcing HitL resolution.
*   **Tiered Canonicalization:** Uses a `DataNormalizer` for deterministic matching:
    *   Tier 1 (Identifiers/Financials): Strict equality.
    *   Tier 2 (Descriptive fields): Expands abbreviations and strips punctuation/accents, replacing non-alphanumerics with spaces to prevent word collapsing.
    *   Tier 3 (Enums): Exact spelling enforcement.
*   **Domain-Specific Coercion:** Business rules (e.g., coercing `estado_civil` to `Casado(a)` based on a marriage certificate) are handled declaratively via `@model_validator` on Pydantic models.
*   **Strict Immutable Field Matching:** Exact equality enforced for core fields (`entity_name`, `cpf`, `rg`) after normalization; no fuzzy matching allowed to prevent False Negatives.
*   **Audit Logging:** An append-only ledger in Firestore records all manual HitL corrections for LGPD compliance.

### Solved Bottlenecks
*   **Custom Claims for RBAC:** Implemented Firebase Auth Custom Claims (`cartorio_id` and `role`) to eliminate slow cross-service Firestore reads in `storage.rules` and `firestore.rules`. Backend operations now enforce a kill switch via custom claims and `getUserData().status != 'revoked'`.
*   **JSON Serialization Resiliency:** Fixed frontend parsing crashes by ensuring backend endpoints (`extract_document_data`, etc.) serialize outputs strictly with `json.dumps(..., ensure_ascii=False, allow_nan=False)`, preventing unparseable `NaN` values from LLMs. Frontend data fetching also utilizes `await response.text()` and `JSON.parse()` within try/catch blocks.
*   **HitL State Persistence:** Adopted a hybrid cache for HitL state: instantaneous `localStorage` saves with a 30-second debounced sync to Firestore (`minutas/{document_id}`), handling multi-workstation concurrency safely.
*   **Missing Field Normalization (Reverse-Hallucination):** Resolved issues where the validator flagged missing fields by checking if the expected text actually exists in the raw text.

### E2E Test Suite Coverage
The backend leverages an extensive suite of E2E tests:
*   Tests such as `test_e2e_procuracao.py`, `test_e2e_compra_venda.py`, `test_e2e_doacao.py`, and `test_e2e_inventario.py` validate act-specific pipelines.
*   These E2E tests mock the HTTP environment and explicitly inject `super_admin` claims for authorization context, asserting strict JSON serialization constraints.

## 2. Module 2: Minute Generation & Legal Structuring

### Current Architecture & Objectives
Module 2 focuses on securely generating and formatting the final legal documents ("minutas"). It employs a **"Smart Payload + Dumb Template" Hybrid Architecture**:
*   **Smart Payload:** The Gemini model (e.g., 2.5 family) acts strictly as a grammar engine via Pydantic Structured Outputs to generate contextual text blocks based *only* on the verified Ground Truth.
*   **Dumb Template:** The generated text blocks are injected into `.docx` files using `docxtpl` (Jinja2 syntax) to perfectly preserve legal formatting and styling, separating content generation from visual presentation.

### Solved Gaps & Implemented Features
*   **Template Management:** Full interface for managing `.docx` templates and their extracted Jinja2 tags in the multi-tenant `templates` Firestore collection has been implemented through the `TemplateManager.tsx` component.
*   **Financial Footers:** Safe extraction and re-injection of official financial footers (like 'Emolumentos') and values are now hardened by separating them into "Literal Tags" that completely bypass the Vertex AI call and are directly injected into the `docxtpl` payload context.
*   **Payload Generation Engine:** The generator utilizes Vertex AI with Pydantic structured output constraints purely as a grammar engine, ensuring perfect compliance with the Jinja2 tags of the targeted template.
*   **Frontend Integration:** "Gerador de Minutas" (`MinuteGenerator.tsx`) component implemented to select a template, gather dynamic manual inputs or import verified `human_final_data` from Module 1, and directly download the resulting base64 `.docx` payload returned from the backend.

## 3. Infrastructure & Testing Guardrails

### Firebase Rules & Multi-Tenancy
*   **Multi-Tenant Isolation:** All core collections (Users, Minutas, Audit Logs) and Storage paths are partitioned by a `cartorio_id`.
*   **Rule Enforcement (Version 2):** Missing custom claims short-circuit evaluation. Rules safely verify claims using the `in` operator (e.g., `'role' in request.auth.token`). The backend kill switch (`isActiveUser()`) bypasses the 1-hour token TTL.
*   **Deployment:** Rules must be explicitly deployed alongside functions (`firebase deploy --only functions,firestore:rules,storage`).

### Testing & Quality Assurance
*   **Fuzzer Tests (`fuzzer.py`):** Deterministic stress-testing of the Comparator and Normalizer logic using synthetic data (`Faker (pt_BR)`), tracking False Positives and False Negatives without Vertex AI costs. Mutations generating identically normalized strings are correctly classified as `FORMATTING` rather than `TYPO`.
*   **LLM Evals (`test_llm_evals.py`):** Dedicated evaluation pipeline executing against the live Vertex AI API using real uncleaned OCR extractions from PDFs, strictly comparing outputs against a Golden Dataset JSON to catch regressions.
*   **Cloud Run & CI/CD Constraints:**
    *   Functions authenticate using Application Default Credentials (ADC); explicit `GEMINI_API_KEY`s are prohibited.
    *   Backend testing must explicitly mock `firebase_admin.initialize_app` and `google.genai.Client` to prevent CI crashes.
    *   Frontend CI/CD injects `VITE_FIREBASE_*` variables from GitHub Secrets securely during `npm run build`.
