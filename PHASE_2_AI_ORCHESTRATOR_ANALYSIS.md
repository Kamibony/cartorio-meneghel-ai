# Phase 2: AI Orchestrator - Architecture & Feasibility Analysis

## 1. Semantic Search & Vectorization

The first pillar of the Intent-to-Document Routing system is accurately retrieving relevant clauses based on the user's natural language input (e.g., "Power of attorney to sell a car").

### Implementation Strategy
*   **Embedding Model:** We will utilize Google's Vertex AI `text-embedding-004` via the `google-genai` SDK. This model outputs 768-dimensional vectors, which perfectly matches our existing Firestore configuration in `firestore.indexes.json`.
*   **Vector Search Execution:** When a user submits their intent (Step 0), the orchestrator endpoint will first call the Vertex API to embed the intent string into a 768-dimension vector. It will then perform a K-Nearest Neighbors (KNN) vector search directly against the Firestore `clauses` collection using the `embedding` field.
*   **Pre-Filtering:** To improve precision, the vector search should include pre-filters (e.g., `cartorio_id` matching the user's tenant or 'SYSTEM' globals).

### Risks & Mitigations
*   **Recall vs. Precision (Noise):** A pure KNN search might return tangentially related clauses (e.g., pulling real estate clauses for a vehicle sale).
    *   *Mitigation:* Retrieve a wider candidate pool (Top N=15 or 20) during the vector search phase, shifting the responsibility of precise filtering and logical ordering to the subsequent LLM Orchestration phase.
*   **Latency & Cold Starts:** Embedding generation adds a network hop.
    *   *Mitigation:* The orchestrator endpoint should be deployed as an `@https_fn.on_request` function with elevated minimum instances (if cost permits) to avoid cold starts, and appropriately sized memory (e.g., `512MB` or `1GB`) as it relies on external API calls, similar to our extraction endpoints.

## 2. LLM Orchestration & Prompting

Once candidate clauses are retrieved, an LLM must act as the orchestrator to synthesize the final document logic.

### Implementation Strategy
*   **Backend Invocation:** The orchestration endpoint passes the natural language intent and the Top N candidate clauses (including their IDs, titles, and tags, but preferably *not* the full text to save tokens) to the Gemini API (e.g., `gemini-1.5-pro` or `gemini-1.5-flash`).
*   **System Prompt Structure:** The prompt must strictly enforce the following:
    1.  **Role:** "You are an expert legal orchestrator."
    2.  **Task:** "Review the user's intent and select the exact subset of necessary clauses from the provided candidate list. Discard irrelevant clauses."
    3.  **Ordering:** "Determine the logical sequence of these clauses to form a coherent document."
    4.  **Formatting:** "Output strictly as a JSON array of selected clause IDs."
*   **Post-Processing:** Once the IDs are returned, the backend fetches the full definitions of the selected clauses, aggregates all required variables, and constructs the response payload for the frontend.

### Risks & Mitigations
*   **Context Window Constraints:** Passing 20 full legal clauses into the prompt could exceed token limits or distract the model.
    *   *Mitigation:* We should provide Gemini with a summarized representation of the clauses (e.g., ID, Title, `scope_tags`, and perhaps a short description) rather than the raw legal text containing Jinja2 variables.
*   **Hallucination in Selection:** The LLM might invent a clause ID that wasn't provided in the candidate list.
    *   *Mitigation:* The backend must enforce a strict intersection validation: filter the LLM's returned IDs against the initially provided candidate list IDs. Any hallucinated IDs are dropped.

## 3. UX Streamlining (Dynamic Wizard Evolution)

The current `SmartWizardContainer` heavily relies on manual template selection and manual entity-to-role mapping. Phase 2 must transition to an AI-driven, dynamic flow.

### Proposed Wizard Restructuring
1.  **Step 0: The Intent Gateway (New)**
    *   Users face a simple interface to describe their intent in natural language.
    *   *Ripcord Fallback Mechanism:* A prominent UI toggle or fallback link must be present, allowing users to bypass the AI orchestrator and fall back to the legacy manual template selection if the AI fails or if the user prefers the traditional flow.
2.  **Step 1: AI Review & Variable Deduplication (Modified)**
    *   Instead of picking a template, the user is presented with the AI's *proposed* clauses and their logical order. The user can remove or reorder them if necessary.
    *   Behind the scenes, the frontend aggregates the `required_variables` from all selected clauses. The backend must enforce strict naming schemas (e.g., `NOME_OUTORGANTE`) during the ingestion phase to allow the frontend to safely deduplicate variables across different clauses.
3.  **Step 2: Dynamic Mapping & Extraction Injection (Streamlined)**
    *   The legacy manual mapping steps (Step 2 and 3) are merged. The UI now dynamically renders input fields based entirely on the aggregated `VariableDefinition` array (e.g., `EntitySelectorCard` for entity types, `AIContextualTextarea` for free-form text).
    *   The Phase 1 extraction data (`verified_data`) automatically cascades into these dynamic fields.
4.  **Step 3: Master Envelope Generation**
    *   The document generation bypasses monolithic templates. Instead, the frontend uses the **Master Envelope** approach. Standard headers and footers are injected, and the dynamically selected, dynamically ordered clauses are concatenated strictly into the `{{BODY_CLAUSES}}` tag to avoid formatting hallucinations.

### Conclusion and Next Steps
Before implementing the full logic, we must adhere to the **Tracer Bullet First** protocol. We should establish the `orchestrate_document` endpoint returning a hardcoded JSON response of clause IDs, wire it to the frontend's Step 0, and verify the UI state transitions and Ripcord fallback before integrating the Vertex AI embeddings or the Gemini API.