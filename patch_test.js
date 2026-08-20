const fs = require('fs');
const path = 'frontend/src/components/SmartWizard/__tests__/SmartWizardContainer.test.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /jest\.mock\('\.\.\/steps\/Step1_ReviewDocument', \(\) => \{[\s\S]*?\}\);/,
  `jest.mock('../steps/Step1_ClauseSelection', () => {
  return function DummyStep1({ onNext }: any) {
    return (
      <div data-testid="step1-clause">
        <button onClick={onNext} data-testid="next-btn">Next</button>
      </div>
    );
  };
});

jest.mock('../steps/Step2_ReviewDocument', () => {
  return function DummyStep2({ onGenerate, generatedText }: any) {
    return (
      <div data-testid="step2">
        {generatedText && <span data-testid="generated-text">{generatedText}</span>}
        <button onClick={onGenerate} data-testid="generate-btn">Generate</button>
      </div>
    );
  };
});`
);

content = content.replace(
  /expect\(screen\.getByTestId\('step1'\)\)\.toBeInTheDocument\(\);/,
  `expect(screen.getByTestId('step1-clause')).toBeInTheDocument();\n    });\n\n    // Advance from 1 to 2\n    fireEvent.click(screen.getByTestId('next-btn'));\n\n    // Step 2 should be rendered\n    await waitFor(() => {\n      expect(screen.getByTestId('step2')).toBeInTheDocument();`
);

content = content.replace(
  /<button onClick=\{\(\) => onOrchestrated\(null, "Test Intent"\)\}>/,
  `<button onClick={() => onOrchestrated({ clauses: [], required_variables: [] }, "Test Intent")}>`
);

fs.writeFileSync(path, content, 'utf8');
