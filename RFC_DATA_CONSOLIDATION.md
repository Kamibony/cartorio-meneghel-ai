# RFC: Data Consolidation and Strict Type Checking Architecture

## 1. Executive Summary

During a pre-demo run with a new dataset, critical edge cases emerged causing data hallucinations, unresolvable conflicts, and data duplication in the final Minuta Corrigida. Specifically:
- **Format Hallucination & Lack of Type Safety:** Vertex AI extracted a malformed CPF which the system accepted, alongside hallucinated parent names.
- **Document Hierarchy Failure:** The system favored older document states (e.g., "Solteiro(a)" from an RG) over newer overriding sources of truth (e.g., Marriage Certificate).
- **Data Duplication:** The validator expected multiple values for the same entity (like two different birth dates) due to failures in ground truth merging.

This RFC proposes a systemic architectural overhaul to introduce strict type safety, intelligent ground truth consolidation (entity merging based on legal document hierarchies), and a proactive Human-in-the-Loop (HitL) block to resolve conflicts *before* draft validation begins.

## 2. Proposed Architecture

### 2.1 Strict Type Checking (The Sanitation Layer)

Currently, extracted data flows as dynamic dictionaries, relying heavily on downstream normalization logic, leading to format hallucinations (e.g., malformed CPF) slipping through.

**Proposal:**
We will introduce a strict parsing and validation layer immediately after the Vertex AI extraction and before any downstream processing.

- **Technology Choice:** Use **Pydantic** in the Python backend (Firebase Functions).
- **Implementation Strategy:**
  - Define robust Pydantic models for every entity type (`PESSOA_FISICA`, `IMOVEL`, etc.).
  - Implement strong validation rules on fields:
    - **Custom Validators (Regex):** Enforce strict regex validations for CPFs, RGs, and Dates. E.g., a CPF must either match `^\d{3}\.\d{3}\.\d{3}\-\d{2}$` or exactly 11 digits. If Vertex AI returns "479.634.42", Pydantic will raise a `ValidationError`.
    - **Coercion & Sanitization:** Use `BeforeValidator` or `field_validator` to actively strip non-numeric characters from identifier strings during parsing, or normalize dates strictly to ISO format (`YYYY-MM-DD`).
  - **Handling Extraction Failures:** Instead of propagating malformed data, when a field fails Pydantic validation, we intercept the error. We can either:
    - Nullify the specific malformed field while keeping the rest of the entity intact.
    - Flag the specific entity with an internal "Extraction Error" that directly feeds into the Pre-Validation HitL queue (see section 2.3).

### 2.2 Ground Truth Consolidation (The "Master Profile" Merger)

The current deduplication process sometimes fails to definitively merge fields, causing data duplication in validation. We need an explicit middleware layer to merge raw entities from multiple documents into a single "Master Profile".

**Proposal:**
Architect a deterministic Ground Truth Consolidator that aggregates entities based on stable identifiers and resolves field-level conflicts using a Document Hierarchy Weighting system.

- **Entity Matching:** Match entities across documents strictly based on stable primary keys (e.g., normalized CPF for `PESSOA_FISICA`, `matricula` for `IMOVEL`). If identifiers are absent, fall back to robust normalized name matching.
- **Field-Level Hierarchy & Conflict Resolution:**
  - Instead of overwriting whole entities, merge them *field by field*.
  - Track `_source_document_type` for every extracted field.
  - Define a global `DOCUMENT_HIERARCHY` mapping (e.g., `Certidão de Casamento: 100`, `Certidão de Nascimento: 90`, `RG: 40`).
  - When merging field `X` from Document A and Document B:
    - If the values match (after normalization), merge them silently.
    - If the values conflict (e.g., `estado_civil` "Solteira" from RG vs "Casada" from Certidão de Casamento), the consolidator automatically selects the value from the document with the highest hierarchy weight.
    - The overriding action is logged in an internal `_resolved_conflicts` object for transparency.

### 2.3 Pre-Validation HitL (Human-in-the-Loop)

Some conflicts cannot be safely resolved automatically (e.g., two RGs presenting different birth dates for the same CPF). We must not pass these unresolved anomalies to the validation engine, as they cause data duplication and confusion.

**Proposal:**
Introduce a Pre-Validation HitL blocking mechanism.

- **Hard Conflicts Flagging:** If the Consolidator encounters conflicting values for immutable fields (e.g., Date of Birth, CPF) across documents, or if two documents with the *same* hierarchy weight provide different data for a mutable field, it cannot auto-resolve.
- **The `_conflicts` Object:** The consolidator appends these hard conflicts to a `_conflicts` object on the Master Profile entity.
- **Pipeline Block:** The API endpoint returning the aggregated Ground Truth payload to the frontend will include these `_conflicts`.
- **UI Intervention:** The frontend `DataChecker` dashboard will detect the presence of `_conflicts`. It will place the document review into a "Conflict Resolution Mode", disabling the standard Minuta validation tab.
- **User Resolution:** The user must explicitly choose the correct value from a UI prompt (e.g., "Select the correct Date of Birth for João"). Once chosen, the frontend moves the resolution to `_resolved_conflicts` and re-submits the payload. Only when `_conflicts` is empty can the pipeline proceed to the draft comparison phase.

## 3. Next Steps
1. Review this architecture with the core engineering team.
2. Draft Pydantic schemas for core entities.
3. Refactor `merge_into_master_profile` to support field-level hierarchical merging.
4. Update frontend state constraints to enforce the HitL block on `_conflicts`.
