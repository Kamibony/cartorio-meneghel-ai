# RFC: Arquiteto de Minutas (Module 3) - Strict Isolation Architecture

## 1. Introduction and Core Directive

This RFC details the implementation strategy for the **Arquiteto de Minutas (Module 3)**. The primary objective is to build a robust, dynamic AI-driven document assembly system.

The most critical architectural constraint for this upgrade is **Strict Isolation**: Module 3 must be 100% decoupled from Module 1 (Extraction, HitL, Validation). Module 3 will treat all data produced by Module 1 as strictly immutable, read-only context. No state changes in Module 3 should ever mutate the source of truth (`ground_truth`) maintained by Module 1, nor should it share internal state management hooks or backend pipeline files.

## 2. Backend Isolation Strategy

To ensure zero impact on `extractor.py`, `validator.py`, and the Module 1 pipeline, Module 3 will be physically and logically separated in the backend.

### A. Dedicated Service Modules
We will introduce new Python modules under `functions/services/` and `functions/core/` specifically for Module 3:
- **`arquiteto_service.py`**: A new orchestrator module to handle all high-level logic for intent parsing, semantic search (RAG), and clause selection.
- **`dynamic_generator.py`**: A dedicated engine for dynamic document assembly, completely separate from the legacy `format_draft` or `DocumentResolver`. It will utilize `LLMGenerationService` and `RAGService` securely.

### B. Read-Only Data Contract
Module 3 endpoints (e.g., `generate_dynamic_document`, `preview_dynamic_document`) will accept the `draft_id` and the `ground_truth` data from the frontend as inputs.
- The backend logic for Module 3 will strictly treat this `ground_truth` payload as a read-only dictionary (`Dict[str, Any]`).
- It will *never* attempt to re-validate, normalize, or overwrite values in the `ground_truth`. If data is missing for the generated template, Module 3 will handle it via its own fallback mechanism (e.g., leaving a placeholder) rather than trying to invoke Module 1's `extractor` to find it.

### C. Separate API Endpoints
All long-running tasks for Module 3 will be standard `@https_fn.on_request` endpoints, distinct from Module 1.
- `orchestrate_document`
- `suggest_field_text`
- `generate_dynamic_document`
These will be hosted on direct Cloud Run URLs to bypass Firebase Hosting timeouts, completely independent of the endpoints defined for extraction.

## 3. Frontend State Isolation Strategy

The frontend state for Module 1 (`DocumentViewer`, HitL reconciliation) must not bleed into the state management of Module 3.

### A. Unidirectional Data Flow via Props
The entry point for Module 3, `SmartWizardContainer.tsx` (rendered conditionally inside `GeneratorModule.tsx`), will receive `groundTruth` from `App.tsx` strictly as a read-only prop.
- The `groundTruth` object will not be mutated.

### B. Dedicated State Management (Wizard Context)
Module 3 will utilize a completely separate state management paradigm, likely a dedicated `useReducer` hook inside `SmartWizardContainer` or a React Context (`SmartWizardContext`).
- **State Shape**:
  ```typescript
  interface ArquitetoState {
    intent: string;
    selectedClauses: Clause[];
    wizardFields: VariableDefinition[];
    wizardValues: Record<string, any>; // User inputs specific to the wizard, isolated from groundTruth
    generatedPreview: string | null;
  }
  ```
- **Separation of Concerns**: When a user fills out a dynamic field in the Smart Wizard (e.g., a custom clause text), that value is stored in `wizardValues`. It is *never* merged back into the global `groundTruth`.

### C. Component Decoupling
Module 3 will use its own components for UI (e.g., `WizardStepper`, `EntitySelectorCard`, `AIContextualTextarea`). It will not reuse or modify Module 1's `DataChecker` or `InteractiveDiffWidget` for its internal operations, preventing accidental coupling of UX patterns.

## 4. Step-by-Step Implementation Roadmap

### Pillar 1: Robust Backend (Vector DB & Templating)
1. **Schema Definition**: Define the Firestore schema for the `clauses` collection (including the `embedding` field for vector search) and update deployment scripts to handle composite vector indexes out-of-band.
2. **RAG Service Implementation**: Build `rag_service.py` with the `find_nearest` logic using Vertex AI text embeddings to query Firestore `clauses`. Ensure fallback mock vectors for CI/CD environments.
3. **Arquiteto Service Implementation**: Create `arquiteto_service.py` to handle the Intent-to-Document routing, combining Gemini orchestration with the RAG service.
4. **Endpoint Creation**: Implement `@https_fn.on_request` endpoints for orchestration and generation, strictly enforcing the read-only use of Module 1 data.

### Pillar 2: Advanced AI Logic (Drafting & Smart Combination)
1. **Clause Ingestion Pipeline**: Implement the backend logic (`ingest_raw_clauses`) to parse raw legal text into atomic clauses with standard Jinja2 tags and vectorize them.
2. **Contextual Suggester**: Build the `suggest_field_text` endpoint to allow LLM-driven completions for free-form text areas, based purely on the provided context.
3. **Dynamic Assembly Engine**: Upgrade `LLMGenerationService` to assemble selected clauses dynamically based on user intent, entirely bypassing the legacy deterministic `DocumentResolver`.

### Pillar 3: Enhanced UX/UI (Wizard & Visual Mapping)
1. **Wizard State Management**: Implement the isolated `useReducer` state inside `SmartWizardContainer`.
2. **Intent & Clause UI**: Build Step 0 (Intent Definition) and Step 1 (Clause Selection/Review) interfaces, allowing users to see and modify the AI's orchestrated clause selection.
3. **Smart Variable Mapping UI**: Develop `EntitySelectorCard` and `SmartDropdown` components that read the immutable `groundTruth` to populate options for the required variables determined by the selected clauses.
4. **Integration**: Connect the `SmartWizardContainer` to the final `ValidationResultsPanel` via the `onGenerated` callback, ensuring the final output can flow securely into the final HitL review step without breaking the unidirectional flow.