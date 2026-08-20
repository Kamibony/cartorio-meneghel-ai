const fs = require('fs');
const path = 'frontend/src/components/SmartWizard/SmartWizardContainer.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace imports
content = content.replace(
  "import Step1_ReviewDocument from './steps/Step1_ReviewDocument';",
  "import Step1_ClauseSelection from './steps/Step1_ClauseSelection';\nimport Step2_ReviewDocument from './steps/Step2_ReviewDocument';"
);

// Interface WizardState
content = content.replace(
  /interface WizardState \{[\s\S]*?\}/,
  `interface WizardState {
  currentStep: number;
  intent: string;
  selectedClauses: any[];
  wizardFields: any[];
  wizardValues: Record<string, any>;
  isGenerating: boolean;
  generatedText: string | null;
  generatedFileUrl: string | null;
  error: string | null;
}`
);

// Type WizardAction
content = content.replace(
  /type WizardAction =[\s\S]*?\| \{ type: 'RESET' \};/,
  `type WizardAction =
  | { type: 'SET_INTENT'; payload: string }
  | { type: 'SET_ORCHESTRATION_DATA'; payload: { clauses: any[], fields: any[] } }
  | { type: 'SET_WIZARD_VALUES'; payload: Record<string, any> }
  | { type: 'START_GENERATION' }
  | { type: 'PREVIEW_SUCCESS'; payload: string }
  | { type: 'GENERATION_SUCCESS'; payload: { text: string; fileUrl: string } }
  | { type: 'GENERATION_ERROR'; payload: string }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'RESET' };`
);

// initialState
content = content.replace(
  /const initialState: WizardState = \{[\s\S]*?\};/,
  `const initialState: WizardState = {
  currentStep: 0,
  intent: '',
  selectedClauses: [],
  wizardFields: [],
  wizardValues: {},
  isGenerating: false,
  generatedText: null,
  generatedFileUrl: null,
  error: null,
};`
);

// Reducer
content = content.replace(
  /case 'SET_INTENT':\s*return \{ \.\.\.state, intent: action\.payload \};/,
  `case 'SET_INTENT':
      return { ...state, intent: action.payload };
    case 'SET_ORCHESTRATION_DATA':
      return { ...state, selectedClauses: action.payload.clauses, wizardFields: action.payload.fields };
    case 'SET_WIZARD_VALUES':
      return { ...state, wizardValues: action.payload };`
);

content = content.replace(
  /case 'NEXT_STEP':\s*return \{ \.\.\.state, currentStep: Math\.min\(state\.currentStep \+ 1, 1\) \};/,
  `case 'NEXT_STEP':\n      return { ...state, currentStep: Math.min(state.currentStep + 1, 2) };`
);

// handlePreview
const handlePreviewRegex = /const handlePreview = async \(intentStr: string\) => \{[\s\S]*?console\.error\("Preview error", err\);\s*dispatch\(\{ type: 'GENERATION_ERROR', payload: err\.message \|\| "Ocorreu um erro ao gerar a pré-visualização\." \}\);\s*\}\s*\};/;

const newHandlePreview = `const handlePreview = async () => {
    if (!cartorioId) return;

    dispatch({ type: 'START_GENERATION' });

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Não autenticado.");

      const payload = {
        cartorio_id: cartorioId,
        template_id: "DYNAMIC_CLAUSES",
        intent: state.intent,
        selected_clause_ids: state.selectedClauses.map((c: any) => c.id),
        role_mapping: state.wizardValues,
        ground_truth: normalizedGroundTruth,
        draft_id: draftId || normalizedGroundTruth?.document_id || null,
        imported_at: normalizedGroundTruth?.updatedAt ? {
             _seconds: normalizedGroundTruth.updatedAt.seconds,
             _nanoseconds: normalizedGroundTruth.updatedAt.nanoseconds
         } : null
      };

      const endpoint = \`\${ENV.generateApiUrl}/preview_dynamic_document\`;
      const result: any = await apiClient.post(endpoint, payload);

      if (result.status === 'success' && result.preview_text !== undefined) {
          dispatch({ type: 'PREVIEW_SUCCESS', payload: result.preview_text });
          dispatch({ type: 'NEXT_STEP' });
      } else if (result.status === 'success' && result.plain_text !== undefined) {
          dispatch({ type: 'PREVIEW_SUCCESS', payload: result.plain_text });
          dispatch({ type: 'NEXT_STEP' });
      } else {
          throw new Error("Resposta inválida do servidor.");
      }
    } catch (err: any) {
      console.error("Preview error", err);
      dispatch({ type: 'GENERATION_ERROR', payload: err.message || "Ocorreu um erro ao gerar a pré-visualização." });
    }
  };`;

content = content.replace(handlePreviewRegex, newHandlePreview);

// handleGenerate
const handleGenerateRegex = /const handleGenerate = async \(\) => \{[\s\S]*?intent: state\.intent,[\s\S]*?ground_truth: normalizedGroundTruth,/;

const newHandleGenerate = `const handleGenerate = async () => {
    if (!cartorioId) return;
    dispatch({ type: 'START_GENERATION' });
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Não autenticado.");

      const payload = {
        cartorio_id: cartorioId,
        template_id: "DYNAMIC_CLAUSES",
        intent: state.intent,
        selected_clause_ids: state.selectedClauses.map((c: any) => c.id),
        role_mapping: state.wizardValues,
        ground_truth: normalizedGroundTruth,`;

content = content.replace(handleGenerateRegex, newHandleGenerate);

// UI
content = content.replace(
  /<span className=\{state\.currentStep >= 1 \? 'text-blue-600' : ''\}>1\. Revisão<\/span>/,
  `<span className={state.currentStep >= 1 ? 'text-blue-600' : ''}>1. Seleção e Mapeamento</span>
          <span>&gt;</span>
          <span className={state.currentStep >= 2 ? 'text-blue-600' : ''}>2. Revisão</span>`
);

content = content.replace(
  /onOrchestrated=\{\(_response, intentStr\) => \{[\s\S]*?\}\}/,
  `onOrchestrated={(response, intentStr) => {
                 dispatch({ type: 'SET_INTENT', payload: intentStr });
                 dispatch({ type: 'SET_ORCHESTRATION_DATA', payload: { clauses: response.clauses || [], fields: response.required_variables || [] } });
                 dispatch({ type: 'NEXT_STEP' });
             }}`
);

const uiRegex = /\{state\.currentStep === 1 && \([\s\S]*?<Step1_ReviewDocument[\s\S]*?onPrev=\{\(\) => dispatch\(\{ type: 'PREV_STEP' \}\)\} \/>\s*\)\}/;

const newUi = `{state.currentStep === 1 && (
          <Step1_ClauseSelection
             groundTruth={normalizedGroundTruth}
             selectedClauses={state.selectedClauses}
             wizardFields={state.wizardFields}
             wizardValues={state.wizardValues}
             onUpdateValues={(values) => dispatch({ type: 'SET_WIZARD_VALUES', payload: values })}
             onPrev={() => dispatch({ type: 'PREV_STEP' })}
             onNext={() => handlePreview()}
             isGenerating={state.isGenerating}
          />
        )}
        {state.currentStep === 2 && (
          <Step2_ReviewDocument
            onGenerate={handleGenerate}
            isGenerating={state.isGenerating}
            error={state.error}
            generatedText={state.generatedText}
            generatedFileUrl={state.generatedFileUrl}
            onForwardToValidation={() => { if(state.generatedText) onGenerated(state.generatedText) }}
            onPrev={() => dispatch({ type: 'PREV_STEP' })}
          />
        )}`;

content = content.replace(uiRegex, newUi);

fs.writeFileSync(path, content, 'utf8');
