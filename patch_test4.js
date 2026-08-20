const fs = require('fs');
const path = 'frontend/src/components/SmartWizard/__tests__/SmartWizardContainer.test.tsx';

let content = `import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SmartWizardContainer from '../SmartWizardContainer';

// Mock the components used in the steps
jest.mock('../steps/Step0_IntentDefinition', () => {
  return function DummyStep0({ onOrchestrated }: any) {
    return (
      <div data-testid="step0">
        <button onClick={() => onOrchestrated({ clauses: [], required_variables: [] }, "Test Intent")}>
          Submit Intent
        </button>
      </div>
    );
  };
});

jest.mock('../steps/Step1_ClauseSelection', () => {
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
});

jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ cartorioId: 'test-cartorio' })
}));

describe('SmartWizardContainer', () => {
  it('navigates through intent to review phase', async () => {
    const groundTruth = { entities: [] };

    render(<SmartWizardContainer groundTruth={groundTruth} onGenerated={jest.fn()} />);

    // Step 0: Intent definition
    expect(screen.getByTestId('step0')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Submit Intent'));

    // Step 1: Clause Selection
    await waitFor(() => {
      expect(screen.getByTestId('step1-clause')).toBeInTheDocument();
    });

    // Advance from 1 to 2
    fireEvent.click(screen.getByTestId('next-btn'));

    // Step 2 should be rendered
    await waitFor(() => {
      expect(screen.getByTestId('step2')).toBeInTheDocument();
    });
  });
});`;

fs.writeFileSync(path, content, 'utf8');
