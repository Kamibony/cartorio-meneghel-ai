
import { render, screen, fireEvent } from '@testing-library/react';
import SmartWizardContainer from '../SmartWizardContainer';

// Mock the components used in the steps
jest.mock('../steps/Step0_IntentDefinition', () => {
  return function DummyStep0({ onOrchestrated }: any) {
    return (
      <div data-testid="step0">
        <button onClick={() => onOrchestrated({
           selected_clause_ids: ['clause1'],
           required_variables: [
             { name: 'NOME_COMPLETO', type: 'string' }
           ]
        })}>
          Submit Intent
        </button>
      </div>
    );
  };
});

jest.mock('../steps/Step1_AIProposal', () => {
  return function DummyStep1({ onNext }: any) {
    return (
      <div data-testid="step1">
        <button onClick={onNext}>Next to Review</button>
      </div>
    );
  };
});

jest.mock('../steps/Step2_ReviewAndGenerate', () => {
  return function DummyStep2({ finalPayload, onOverride, requiredVariables }: any) {
    return (
      <div data-testid="step2">
         {requiredVariables.map((v: any) => (
           <div key={v.name} data-testid={`payload-${v.name}`}>
              {finalPayload[v.name] || ''}
              <button onClick={() => onOverride(v.name, 'TEST_VALUE')}>Set Value</button>
           </div>
         ))}
      </div>
    );
  };
});

jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ cartorioId: 'test-cartorio' })
}));

describe('SmartWizardContainer', () => {
  it('navigates through intent, proposal and populates final payload dynamically', () => {
    const groundTruth = { entities: [] };

    render(<SmartWizardContainer groundTruth={groundTruth} onGenerated={jest.fn()} />);

    // Step 0: Intent definition
    expect(screen.getByTestId('step0')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Submit Intent'));

    // Step 1: AI Proposal
    expect(screen.getByTestId('step1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next to Review'));

    // Step 2: Review and Generate
    expect(screen.getByTestId('step2')).toBeInTheDocument();

    // Simulate setting a value dynamically
    fireEvent.click(screen.getByText('Set Value'));
    expect(screen.getByTestId('payload-NOME_COMPLETO')).toHaveTextContent('TEST_VALUE');
  });
});
