
import { render, screen, fireEvent } from '@testing-library/react';
import SmartWizardContainer from '../SmartWizardContainer';

// Mock the components used in the steps
jest.mock('../steps/Step0_IntentDefinition', () => {
  return function DummyStep0({ onOrchestrated }: any) {
    return (
      <div data-testid="step0">
        <button onClick={() => onOrchestrated(null, "Test Intent")}>
          Submit Intent
        </button>
      </div>
    );
  };
});

jest.mock('../steps/Step1_ReviewDocument', () => {
  return function DummyStep1({ onGenerate, generatedText }: any) {
    return (
      <div data-testid="step1">
         <div data-testid="generated-text">{generatedText || ''}</div>
         <button onClick={onGenerate}>Generate Document</button>
      </div>
    );
  };
});

jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ cartorioId: 'test-cartorio' })
}));

describe('SmartWizardContainer', () => {
  it('navigates through intent to review phase', () => {
    const groundTruth = { entities: [] };

    render(<SmartWizardContainer groundTruth={groundTruth} onGenerated={jest.fn()} />);

    // Step 0: Intent definition
    expect(screen.getByTestId('step0')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Submit Intent'));

    // Step 1: Review Document
    expect(screen.getByTestId('step1')).toBeInTheDocument();
  });
});
