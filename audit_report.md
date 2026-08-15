# Deep-Dive Architectural Audit: Arquiteto de Minutas (Module 3)

## 1. Executive Summary
The current implementation successfully leverages the "Master Envelope" Jinja2 payload injection strategy to merge AI-extracted data (`verified_data`) with static template documents. However, this represents only Phase 1 & 2 of the envisioned architecture. The core innovation of Module 3—**Intent-to-Document Routing and Dynamic Clause Assembly**—has been largely overlooked in this "Big Bang" implementation. The system currently functions as a robust static template generator rather than a dynamic clause engine.

## 2. Missing Components & Half-Wired Paths

### A. Step 0 (Intent Definition) is Absent
- **RFC Vision:** The user starts by describing their intent in natural language, which is vectorized to search for appropriate clauses.
- **Current State:** `SmartWizardContainer.tsx` starts directly at Step 1 (`Step1_TemplateSelection`), requiring the user to manually pick a monolithic `template_id` from a static dropdown. There is no intent input field or orchestration invocation.

### B. Dynamic Clause Engine & Endpoints Missing
- **RFC Vision:** Documents are dynamically assembled from granular `clauses` stored in Firestore using Semantic Search (KNN) and Gemini orchestration (`orchestrate_document`). Clauses are ingested via `ingest_raw_clauses`.
- **Current State:**
  - The `clauses` Firestore collection, vector search indexes, and security rules are completely missing from `firestore.rules` and `models.py`.
  - The endpoints `ingest_raw_clauses` and `orchestrate_document` do not exist in `functions/main.py`.
  - `generate_document_api` still relies on downloading a single, monolithic `.docx` file (`template_bytes`) from GCS based on `template_id` and injecting data, rather than concatenating text from multiple selected clauses.

### C. Dynamic UI Adaptation (Type-Driven UI)
- **RFC Vision:** The wizard UI dynamically renders different inputs (e.g., `EntitySelectorCard` vs `SmartDropdown`) based on the aggregated `VariableDefinition` types (`entity`, `asset`, `string`) from the chosen clauses.
- **Current State:** The wizard relies heavily on the `roles_schema` deduced globally from the monolithic template during `register_template`. It lacks the granular `VariableDefinition` array handling required for modular clauses.

## 3. Fragilities, Hidden Bugs & Unhandled States

### A. The "Master Envelope" vs. Clause Concatenation
The current `generate_document_api` uses `python-docx` and `docxtpl` to render a single, pre-formatted `.docx` template. If we transition to concatenating multiple raw text clauses on the fly, `docxtpl` cannot be used in the same way, as there is no single `.docx` file to inject into. Concatenating raw text and trying to convert it to DOCX programmatically often leads to massive styling regressions (broken numbering, lost fonts).

### B. Variable Deduplication & Namespace Collisions
If Clause A and Clause B both require `{{NOME}}` (but A means "Seller" and B means "Buyer"), the current `SmartWizardContainer` payload generation logic will overwrite one with the other during the `COMPUTE_FINAL_PAYLOAD` state transition. The current `roles_schema` iteration attempts to mitigate this by appending strings with newlines, but this is a brittle hack that breaks strict legal formatting.

### C. State Machine Stale Data on Transition
If a user starts a generation flow, gets to Step 3, and then clicks "Back" to Step 1 to change the template, the `sessionStorage` caching mechanism deeply merges the state but does not aggressively purge orphaned nested data. The `SELECT_TEMPLATE` reducer clears high-level maps (`roleSelections`, `manualOverrides`), but complex fallback chains between roles and manual overrides might leave lingering ghosts.

## 4. Regression Risks (Module 1 & 2 Interactivity)
- **Shared Data Extraction:** Modifying the `verified_data` structure or the extraction context to support granular clauses risks breaking Module 1 (Validation) and Module 2, which expect a flat entity map.
- **Endpoint Overloading:** Adapting `generate_document_api` to support both legacy single templates (Module 2) and dynamic clause arrays (Module 3) creates a complex endpoint that risks breaking backward compatibility.

## 5. Recommendations & Next Steps

1. **Decouple the Generation Endpoints:** Do not overload `generate_document_api`. Create a distinct `assemble_and_generate_document_api` specifically designed to handle the JSON array of clause IDs returned by the new orchestrator, leaving the legacy endpoint untouched for Module 2.
2. **Standardize Clause Namespaces:** Implement strict namespacing rules during the `ingest_raw_clauses` phase (e.g., `{{OUTORGANTE_NOME}}`, `{{OUTORGADO_NOME}}`) to prevent deduplication collisions during payload aggregation.
3. **DOCX Assembly Strategy:** Instead of raw text concatenation, define clauses as micro-`.docx` files and use a library like `docxcompose` in the backend to merge them while preserving styles, before running the `docxtpl` pass on the combined document.
4. **Implement Step 0 in a Branch:** Build the `orchestrate_document` endpoint and the Intent UI in an isolated feature branch to test the latency of the embedding -> KNN search -> LLM Orchestration flow before modifying the core `SmartWizardContainer`.
