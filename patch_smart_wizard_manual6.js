const fs = require('fs');
const path = 'frontend/src/components/SmartWizard/SmartWizardContainer.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /\{state\.currentStep === 1 && \([\s\S]*?<Step1_ReviewDocument[\s\S]*?onPrev=\{\(\) => dispatch\(\{ type: 'PREV_STEP' \}\)\} \/>\s*\)\}/,
  `{state.currentStep === 1 && (
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
        )}`
);
fs.writeFileSync(path, content, 'utf8');
