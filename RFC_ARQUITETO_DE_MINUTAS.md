# RFC: Arquiteto de Minutas (Dynamic Clause Engine) - Module 3

## 1. Introduction and Vision

The "Arquiteto de Minutas" (Module 3) represents a strategic shift from monolithic, static templates (e.g., 100 distinct Word documents for 100 specific situations) to an **Intent-to-Document Routing** system. This system will dynamically assemble documents using modular, immutable "Lego blocks" (Clauses).

Instead of relying on LLMs to generate legal text from scratch—which introduces significant hallucination risks—the AI will serve as an orchestrator. Users will describe their intent in natural language (e.g., "Power of attorney to sell a car and manage a bank account"), and the system will utilize Semantic Search (Embeddings/RAG) to select pre-approved clauses and dynamically construct both the final document and the Wizard UI needed to collect the required variables.

## 2. Data Architecture (Firestore)

To support this modular approach, we will introduce a new `clauses` collection in Firestore. Each clause represents a discrete, self-contained piece of legal text.

### `clauses` Collection Schema

```typescript
interface Clause {
  id: string; // Auto-generated Document ID
  title: string; // Human-readable title (e.g., "Poderes para Venda de Veículo")
  text: string; // The immutable legal text with Jinja2 tags (e.g., "O outorgado tem poderes para vender o veículo de placa {{PLACA}}...")
  required_variables: VariableDefinition[]; // Schema of variables needed for this clause
  scope_tags: string[]; // E.g., ['procuracao', 'veiculo', 'venda'] for basic filtering
  embedding: number[]; // Vector representation of the clause's semantic meaning/intent
  is_active: boolean; // Soft delete flag
  cartorio_id: string; // To support tenant-specific clauses, or 'SYSTEM' for globals
  created_at: Timestamp;
  updated_at: Timestamp;
  version: number;
}

interface VariableDefinition {
  name: string; // e.g., "PLACA", "CHASSI", "NOME_COMPRADOR"
  type: 'string' | 'number' | 'date' | 'entity' | 'asset'; // For UI rendering hints
  description: string; // Context for the AI or the user (e.g., "Placa do veículo a ser vendido")
  role?: string; // Optional: ties the variable to a specific role (e.g., "Outorgante")
}
```

*Note: For the `embedding` array, Firestore Vector Search is the recommended approach to keep infrastructure consolidated, provided the vector dimension limits align with our chosen embedding model (e.g., Google Vertex AI).*

## 3. Admin Ingestion Tool (The Cold Start)

To populate the `clauses` database efficiently, we need an ingestion pipeline that can process raw legal texts from public sources (e.g., Gov.br) or legacy templates.

### Workflow
1. **Admin UI Input**: A new section in the Admin Panel where a `super_admin` can paste raw legal text or upload a document.
2. **Backend Ingestion Endpoint**: A new standard HTTP endpoint (`@https_fn.on_request` named `ingest_raw_clauses`).
3. **Gemini Parsing (AI Processing)**:
   - The endpoint sends the raw text to the Gemini API with a strict system prompt.
   - **Prompt Goal**: "Analyze the following legal document. Break it down into logical, independent clauses. For each clause, extract the text, replace specific entity names/details with standardized variables (e.g., `{{NOME}}`, `{{PLACA}}`), and define those variables."
   - The LLM returns a structured JSON array matching the `Clause` schema (sans embeddings).
4. **Vectorization**:
   - For each parsed clause, the backend calls an Embedding API (e.g., Vertex AI Text Embeddings) to generate the vector representation of the clause's text and title.
5. **Review and Save**:
   - The parsed clauses are returned to the Admin UI for human review. The admin can tweak the text, merge variables, or adjust tags.
   - Upon approval, the UI calls a save endpoint that writes the final documents (including embeddings) to the `clauses` Firestore collection.

## 4. Backend Orchestrator (Semantic Routing)

This is the core engine that translates user intent into a set of clause IDs.

### Workflow
1. **User Intent Submission**: The user types their request in the UI ("Quero uma procuração para vender meu carro").
2. **Orchestration Endpoint**: A new endpoint (`@https_fn.on_request` named `orchestrate_document`) receives the intent string.
3. **Intent Vectorization**: The backend generates an embedding for the user's intent string.
4. **Vector Search (Retrieval)**:
   - Perform a K-Nearest Neighbors (KNN) vector search against the `clauses` collection in Firestore, filtering by applicable `cartorio_id` and general scope if necessary.
   - Retrieve the top *N* candidates (e.g., top 10).
5. **AI Orchestrator (Synthesis/Refinement)**:
   - *Bottleneck mitigation*: Raw semantic search might return contradictory or redundant clauses.
   - Pass the user's intent and the *Top N* candidate clauses to the Gemini API.
   - **Prompt Goal**: "Given the user's intent and this list of available clauses, select the exact subset of clauses needed to fulfill the request. Order them logically. Return ONLY the IDs of the selected clauses."
6. **Response**: The endpoint fetches the full definitions of the selected clauses (including all their `required_variables`) and returns this structured payload to the frontend.

## 5. Dynamic Frontend Wizard (The Biggest Challenge)

The current `SmartWizardContainer` (Phase 2) assumes a static `required_tags` array from a pre-selected template. Module 3 requires the UI to adapt dynamically based on the orchestrator's response.

### UI Adaptation Strategy
1. **Step 0: Intent Definition**:
   - A new initial screen where the user enters their natural language prompt.
   - Submitting this calls the `orchestrate_document` endpoint.
2. **State Aggregation**:
   - The Wizard receives the selected clauses.
   - It aggregates all `required_variables` from all selected clauses into a master list, deduplicating variables with the exact same `name`.
3. **Dynamic Variable Mapping (Steps 2 & 3 Evolution)**:
   - The existing `roleSelections` and `manualOverrides` logic remains the core resolution engine.
   - However, the fields rendered in the UI are now driven by the aggregated `VariableDefinition` array.
   - **Type-Driven UI**:
     - If `type === 'entity'`, render the `EntitySelectorCard` (e.g., picking a person for `{{NOME_COMPRADOR}}`).
     - If `type === 'asset'` or context implies a specific item (e.g., variable is `{{PLACA}}`), render a `SmartDropdown` that filters the `verified_data` for vehicles.
     - If standard text, render a standard input or the `AIContextualTextarea`.
4. **Document Assembly**:
   - Instead of a single template document, the frontend (or the final `generate_document_api` call) concatenates the text of the selected clauses in the chosen order.
   - The consolidated string of Jinja2 tags is then hydrated with the resolved variables (from `manualOverrides` > `roleSelections` > `verified_data`) using the existing logic.

## 6. Potential Bottlenecks and Considerations

1. **Context Limits and API Latency**: The orchestration phase involves an embedding call, a vector search, and an LLM call. This could introduce noticeable latency. The UI must have robust loading states (e.g., "Analyzing request...", "Searching clauses...", "Assembling document...").
2. **Variable Deduplication**: If Clause A requires `{{NOME}}` (meaning the buyer) and Clause B requires `{{NOME}}` (meaning the seller), a naive merge will cause conflicts. The Admin Ingestion step must enforce strict, globally unique naming conventions (e.g., `NOME_COMPRADOR`, `NOME_VENDEDOR`) or the schema needs namespace support.
3. **Document Formatting**: Concatenating raw text clauses might result in poorly formatted Word documents (mismatched bullet points, inconsistent numbering). The `generate_document_api` may need to rely heavily on `python-docx` styling rather than raw Jinja2 text injection, or we need a standardized Markdown-to-DOCX conversion step.
4. **Firestore Vector Search Limits**: Ensure that the dimensionality of the chosen embedding model is supported by Firestore's vector search capabilities. If not, a dedicated vector database (like Pinecone) or pgvector on Cloud SQL might be required, though this adds architectural complexity.
