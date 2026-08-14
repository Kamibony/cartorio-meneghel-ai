# RFC: Smart Wizard UX for Template Generation

## 1. Introduction

This document outlines the architectural strategy for overhauling the `TemplateGeneratorInput` component. The objective is to transition from a primitive "dumb text-field filling" UX—where users manually populate dozens of individual template tags—to a guided, intuitive "Smart Wizard Entity-Mapping" UX. This new flow leverages the rich, structured JSON (`verified_data`) extracted during Phase 1 to automatically populate templates based on high-level entity roles.

## 2. Entity-to-Role Mapping

### Problem Statement
Currently, templates require flat tags like `NOME_OUTORGANTE`, `DOCUMENTO_OUTORGANTE`, and `ENDERECO_OUTORGANTE`. The UI naively asks the user to fill each one individually, ignoring the fact that these are all attributes of a single "Person" entity.

### Proposed Architecture
1. **Template Schema Evolution**: We will enrich the `templates` Firestore schema. Instead of just a flat array of `required_tags`, templates will optionally define **Roles** (e.g., "Outorgante", "Outorgado", "Testemunha").
   - A Role will have an expected entity type (e.g., `Person`, `Company`).
   - A Role will define a mapping of its standard attributes to the template's required tags (e.g., `role: Outorgante, mapping: { name: 'NOME_OUTORGANTE', cpf: 'DOCUMENTO_OUTORGANTE' }`).
2. **UI Transition**: The UI will parse the `verified_data` (specifically the `entities` array, if available, or structure standard lists of people/companies).
3. **The Role Selector**: Instead of displaying text inputs, the UI will display a dropdown or card selector for each defined Role: "Select the Outorgante".
   - The dropdown options will be dynamically populated by filtering `verified_data` for matching entity types (e.g., all objects that look like a Person).
   - Each option will display a summary (e.g., "João Lucas (CPF: 123...)").

## 3. State Management & Auto-filling

### Problem Statement
When a user selects an entity for a role, the system must deterministically map that entity's attributes to the required template tags without mutating the original `verified_data` and while allowing final manual review.

### Proposed Architecture
We will use a robust state management pattern within the Wizard's top-level container, utilizing `useReducer` for predictable state transitions or a well-structured `useState` hook.

1. **Wizard State Shape**:
   ```typescript
   interface WizardState {
     selectedTemplate: Template | null;
     roleSelections: Record<string, Entity>; // e.g., { "outorgante_1": EntityObject }
     manualOverrides: Record<string, string>; // e.g., { "NOME_OUTORGANTE": "João Lucas Editado" }
     finalPayload: Record<string, any>; // The combined data sent to the backend
   }
   ```
2. **The Auto-Fill Engine**:
   - A `useEffect` (or reducer side-effect) will listen to changes in `roleSelections`.
   - When "João Lucas" is selected for "Outorgante", the engine iterates over the Role's mapping definition.
   - It extracts `João.nome`, `João.cpf`, etc., and stages them.
3. **Resolution Logic (The Cascade)**:
   - To compute the `finalPayload`, the state selector merges data in this priority:
     1. `manualOverrides` (Highest priority - user explicitly edited a specific tag)
     2. `roleSelections` mapped attributes
     3. `verified_data` top-level keys (Fallback for legacy tags)
   - This computed payload is what gets fed into the final generation review screen.

## 4. Smart Dropdowns for Non-Entity Data

### Problem Statement
Contracts require data beyond standard people/companies, such as property descriptions, vehicle details, or registry numbers (Matrículas), which are often present as arrays or nested objects in the extracted JSON.

### Proposed Architecture
1. **Contextual Type Detection**: The Wizard engine will use heuristics or explicit schema definitions to identify the "type" of a tag (e.g., tags ending in `_IMOVEL` or `_MATRICULA`).
2. **Smart Selectors**: For these tags, the UI will render a "Smart Dropdown".
   - It will scan `verified_data` for arrays of properties, vehicles, etc.
   - Options will be presented as formatted strings: "Imóvel: Apartamento 101, Rua X...".
3. **The "Manual Edit" Fallback**:
   - Every Smart Dropdown will include a prominent `<button>Enter Manually</button>` option.
   - Selecting this toggles the UI from a `Select` to a `Textarea` (or complex form), updating the `manualOverrides` state.
   - This ensures that if the LLM extraction missed a property, the user is never blocked.

## 5. AI Contextual Helpers

### Problem Statement
Free-text fields (like `PODERES_ESPECIFICOS` or `CLAUSULAS_ADICIONAIS`) are tedious to write from scratch, even when the context exists in the uploaded source document.

### Proposed Architecture
1. **The "✨ Auto-Suggest" Button**: Next to free-text inputs, we will inject a lightweight AI trigger button.
2. **Backend Integration**:
   - We will implement a new lightweight endpoint (e.g., `@https_fn.on_request` named `suggest_field_text`) or adapt the existing completion logic.
   - Payload: `{ context: verified_data, field_name: "PODERES_ESPECIFICOS", prompt_hint: "Summarize the powers granted in the source document." }`
3. **Frontend UX**:
   - Clicking the button sets a local `isSuggesting` loading state for that specific field.
   - The backend streams or returns the suggested text.
   - The text is injected into the textarea, where the user can accept, edit, or reject it, modifying the `manualOverrides` state.

## 6. Component Structure

The proposed React component tree enforces a strict Container/Presenter separation:

```text
GeneratorModule.tsx (Existing Container)
 └── SmartWizardContainer.tsx (New Orchestrator: manages WizardState, step navigation)
      ├── WizardStepper.tsx (UI for "Step 1, Step 2...")
      ├── steps/
      │    ├── Step1_TemplateSelection.tsx
      │    ├── Step2_RoleMapping.tsx
      │    │    └── EntitySelectorCard.tsx (Dropdown/Card for picking entities)
      │    ├── Step3_VariableMapping.tsx (For properties, values, non-entity data)
      │    │    └── SmartDropdown.tsx (Handles the Select <-> Manual Entry toggle)
      │    └── Step4_ReviewAndGenerate.tsx (Final preview of the computed payload)
      │
      └── shared/
           └── AIContextualTextarea.tsx (Textarea wrapped with the ✨ Auto-Suggest logic)
```

### Summary of Component Responsibilities:
- **`SmartWizardContainer`**: Holds the `useReducer` state, handles the "Next/Back" logic, and triggers the final `generate_document_api` call.
- **`Step2_RoleMapping`**: Reads the template's required roles and renders an `EntitySelectorCard` for each.
- **`Step3_VariableMapping`**: Handles remaining flat tags and non-entity data using `SmartDropdown`s.
- **`Step4_ReviewAndGenerate`**: Displays the resolved `finalPayload` in a read-only or final-edit form before firing the generation request.
