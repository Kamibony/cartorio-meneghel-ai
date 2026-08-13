# Architectural Analysis: Decoupling Modules 1 & 2 UI

## 1. Introduction
This document outlines the architectural analysis for decoupling and restructuring the UI of Module 1 (Validação) and Module 2 (Gerador de Minutas). The primary goal is to resolve the disjointed UX in Module 2—where users are currently forced to manually input a "Minuta ID"—by introducing a side-by-side, seamless workflow that reuses the Phase 1 Extraction pipeline.

## 2. Feasibility & Logic
**Is the shared-component, split-screen logic sound?**
Yes, the proposed split-screen architecture is highly feasible and aligns perfectly with React's component reusability principles.

*   **Left Panel (Source Upload/Extraction):** `DocumentViewer.tsx` is already well-isolated. It handles the file upload and extraction API call, passing the results up via the `onDataExtracted` callback. It can be safely reused across both modules.
*   **Right Panel (HITL, Action, Validation):** Currently, `DataChecker.tsx` handles the entire right side for Module 1. The challenge lies in swapping the "Right Action" (Manual Draft Upload) with the "Template Dropdown + Generate Button" for Module 2, while preserving the Top (HITL) and Bottom (Validation) logic.

The core logic of feeding `groundTruth` from the Left Panel into the Right Panel remains identical for both modules, making this a sound architectural move.

## 3. Risk Analysis
**1. Component Coupling (The "God Component" Risk):**
Currently, `DataChecker.tsx` tightly couples the HITL review, the draft input mechanism (manual upload/typing), and the validation API calls. If we simply inject a `mode="validation" | "generator"` prop into `DataChecker`, it risks becoming overly complex, full of conditional renders, and difficult to maintain.

**2. State Management & Prop Drilling:**
If `App.tsx` orchestrates the state for both modules, it will become bloated. Furthermore, navigating between tabs (Module 1 vs Module 2) might result in stale state (e.g., lingering `groundTruth` or `draftId` from the other module) if not carefully cleared upon unmount.

**3. API Flow & Validation Data Format:**
In Module 2, the Generate API returns a Base64-encoded `.docx` file. To reuse the validation logic (Right Bottom), this document's text must be extracted and provided to the validation engine. We need to ensure that the generated `.docx` translates cleanly into the plain text format expected by the validation endpoint, without causing formatting-related false positives.

## 4. Architectural Suggestions
To achieve a seamless end-to-end flow without incurring technical debt, I recommend avoiding a monolithic `DataChecker` and instead using a **Container/Presenter** pattern with compositional slots.

### Recommended Approach: Component Decomposition

**1. Create Dedicated Container Components:**
Instead of `App.tsx` managing the workflow, create two new top-level view components: `ValidationModule.tsx` (Module 1) and `GeneratorModule.tsx` (Module 2). `App.tsx` simply routes to these based on the active tab.

**2. Decompose the Right Panel:**
Refactor the current `DataChecker.tsx` into three distinct, composable components:
*   `ExtractionReviewPanel`: (Right Top) Displays the `groundTruth` and handles HITL editing.
*   **The Action Slot (Strategy Pattern):**
    *   `ManualDraftInput`: The current manual upload/typing area (used in Module 1).
    *   `TemplateGeneratorInput`: The new Template Dropdown and Generate Button (used in Module 2).
*   `ValidationResultsPanel`: (Right Bottom) Takes `groundTruth` and `draftText`, calls the validation API, and displays diffs/errors.

### The Module 2 Flow (`GeneratorModule.tsx`):
```tsx
const GeneratorModule = () => {
  const [groundTruth, setGroundTruth] = useState(null);
  const [draftText, setDraftText] = useState(null);

  return (
    <div className="grid grid-cols-2 gap-8 h-full">
      {/* Left: Re-use Source Upload */}
      <DocumentViewer onDataExtracted={setGroundTruth} />

      <div className="flex flex-col h-full overflow-y-auto">
        {/* Right Top: Re-use HITL */}
        <ExtractionReviewPanel groundTruth={groundTruth} onUpdate={setGroundTruth} />

        {/* Right Action: REPLACE with Generator */}
        <TemplateGeneratorInput
           groundTruth={groundTruth}
           onGenerated={(text) => setDraftText(text)}
        />

        {/* Right Bottom: Re-use Validation */}
        {draftText && (
          <ValidationResultsPanel groundTruth={groundTruth} draftText={draftText} />
        )}
      </div>
    </div>
  );
};
```

### Benefits of this Approach:
1.  **No "Minuta ID" needed:** The `groundTruth` payload is passed directly from the HITL panel to the Template Generator component in memory, bypassing the need for manual ID entry.
2.  **True Reusability:** `DocumentViewer`, `ExtractionReviewPanel`, and `ValidationResultsPanel` remain completely agnostic to whether they are being used in Module 1 or Module 2.
3.  **Clean Separation of Concerns:** State is sandboxed within the specific Module's container, preventing cross-contamination when switching tabs.
