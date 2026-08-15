
import { render, screen, fireEvent } from '@testing-library/react';
import SmartWizardContainer from '../SmartWizardContainer';

// Mock the components used in the steps
jest.mock('../steps/Step1_TemplateSelection', () => {
  return function DummyStep1({ onNext, onSelectTemplate }: any) {
    return (
      <div data-testid="step1">
        <button onClick={() => {
          onSelectTemplate({
            id: 'template-1',
            required_tags: ['NOME_COMPLETO', 'CPF'],
            roles_schema: [{
              role: 'Outorgante',
              mapping: {
                nome: 'NOME_COMPLETO',
                cpf: 'CPF'
              }
            }]
          });
          onNext();
        }}>
          Select Template & Next
        </button>
      </div>
    );
  };
});

jest.mock('../steps/Step2_RoleMapping', () => {
  return function DummyStep2({ onNext, onSelectRole }: any) {
    return (
      <div data-testid="step2">
        <button onClick={() => {
          onSelectRole('Outorgante', {
            // Include attributes array to test the cascade logic
            attributes: [
              { key: 'nome', value: 'João da Silva' },
              { key: 'cpf', value: '123.456.789-00' }
            ]
          });
        }}>
          Select Role
        </button>
        <button onClick={onNext}>Next</button>
      </div>
    );
  };
});

jest.mock('../steps/Step4_ReviewAndGenerate', () => {
  return function DummyStep4({ finalPayload }: any) {
    return (
      <div data-testid="step4">
        {/* We are verifying Step 4 as step 3 is skipped according to component logic */}
        <div data-testid="payload-nome">{finalPayload['NOME_COMPLETO']}</div>
        <div data-testid="payload-cpf">{finalPayload['CPF']}</div>
      </div>
    );
  };
});

jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ cartorioId: 'test-cartorio' })
}));

describe('SmartWizardContainer', () => {
  it('cascades role selections to the final payload in the review step', () => {
    const groundTruth = { entities: [] };

    render(<SmartWizardContainer groundTruth={groundTruth} onGenerated={jest.fn()} />);

    // Step 1: Select Template and move to Step 2
    fireEvent.click(screen.getByText('Select Template & Next'));

    // Step 2: Select Role and move to Step 4 (Wizard skips step 3)
    expect(screen.getByTestId('step2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Select Role'));
    fireEvent.click(screen.getByText('Next'));

    // Verify that the wizard moves to step 4 because step 3 is skipped
    expect(screen.getByTestId('step4')).toBeInTheDocument();

    // Verify the final payload has the cascaded data populated correctly
    expect(screen.getByTestId('payload-nome')).toHaveTextContent('João da Silva');
    expect(screen.getByTestId('payload-cpf')).toHaveTextContent('123.456.789-00');
  });
});
