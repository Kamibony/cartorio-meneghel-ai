import React, { useReducer, useEffect } from 'react';
import Step0_IntentDefinition from './steps/Step0_IntentDefinition';
import Step1_AIProposal from './steps/Step1_AIProposal';
import Step2_ReviewAndGenerate from './steps/Step2_ReviewAndGenerate';
import { ENV } from '../../config/env';
import apiClient from '../../api/client';
import { auth } from '../../utils/firebase';
import { useAuth } from '../../contexts/AuthContext';

export interface WizardState {
  currentStep: number;
  orchestratorResponse: any | null;
  clauseFormData: Record<string, string>;
  isGenerating: boolean;
  error: string | null;
  generatedText: string | null;
  generatedFileUrl: string | null;
}

type WizardAction =
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'SET_STEP'; payload: number }
  | { type: 'SET_ORCHESTRATOR_RESPONSE'; payload: any }
  | { type: 'UPDATE_CLAUSE_FORM_DATA'; payload: { tag: string; value: string } }
  | { type: 'START_GENERATION' }
  | { type: 'GENERATION_SUCCESS'; payload: { text: string; fileUrl: string } }
  | { type: 'GENERATION_ERROR'; payload: string }
  | { type: 'RESET' };

const initialState: WizardState = {
  currentStep: 0,
  orchestratorResponse: null,
  clauseFormData: {},
  isGenerating: false,
  error: null,
  generatedText: null,
  generatedFileUrl: null,
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'NEXT_STEP':
      return { ...state, currentStep: state.currentStep + 1 };
    case 'PREV_STEP':
      return { ...state, currentStep: state.currentStep - 1 };
    case 'SET_STEP':
      return { ...state, currentStep: action.payload };
    case 'SET_ORCHESTRATOR_RESPONSE':
      return {
        ...state,
        orchestratorResponse: action.payload,
        clauseFormData: {},
        error: null,
        generatedText: null,
        generatedFileUrl: null
      };
    case 'UPDATE_CLAUSE_FORM_DATA':
      return {
        ...state,
        clauseFormData: {
          ...state.clauseFormData,
          [action.payload.tag]: action.payload.value,
        },
      };
    case 'START_GENERATION':
      return { ...state, isGenerating: true, error: null };
    case 'GENERATION_SUCCESS':
      return { ...state, isGenerating: false, generatedText: action.payload.text, generatedFileUrl: action.payload.fileUrl };
    case 'GENERATION_ERROR':
      return { ...state, isGenerating: false, error: action.payload };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

interface SmartWizardContainerProps {
  groundTruth: any;
  onGenerated: (text: string) => void;
}

const initWizardState = (initial: WizardState): WizardState => {
  try {
    const cached = sessionStorage.getItem('wizard_state');
    if (cached) {
      const parsed = JSON.parse(cached);
      return { ...initial, ...parsed, arraySelections: parsed.arraySelections || initial.arraySelections };
    }
  } catch (e) {
    console.error("Failed to parse wizard state from sessionStorage", e);
  }
  return initial;
};

const SmartWizardContainer: React.FC<SmartWizardContainerProps> = ({ groundTruth, onGenerated }) => {
  const [state, dispatch] = useReducer(wizardReducer, initialState, initWizardState);

  useEffect(() => {
    sessionStorage.setItem('wizard_state', JSON.stringify(state));
  }, [state]);
  const { cartorioId } = useAuth();

  const handleGenerate = async () => {
    if (!cartorioId) return;
    dispatch({ type: 'START_GENERATION' });
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Não autenticado.");

      const payload = {
        cartorio_id: cartorioId,
        template_id: "DYNAMIC_CLAUSES", // Dummy template ID for now to bypass static templates requirement in backend
        verified_data: state.clauseFormData,
        draft_id: groundTruth?.document_id || null,
        imported_at: groundTruth?.updatedAt ? {
             _seconds: groundTruth.updatedAt.seconds,
             _nanoseconds: groundTruth.updatedAt.nanoseconds
         } : null
      };

      const endpoint = `${ENV.generateApiUrl}/generate_document_api`;
      const result: any = await apiClient.post(endpoint, payload);

      if (result.status === 'success' && result.file_base64) {
          if (!result.plain_text) {
              throw new Error("O servidor não retornou o texto extraído da minuta (plain_text).");
          }

          const base64Data = result.file_base64;
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

          const url = window.URL.createObjectURL(blob);
          dispatch({ type: 'GENERATION_SUCCESS', payload: { text: result.plain_text, fileUrl: url } });
      } else {
          throw new Error("Resposta inválida do servidor.");
      }
    } catch (err: any) {
      console.error("Generate error", err);
      dispatch({ type: 'GENERATION_ERROR', payload: err.message || "Ocorreu um erro ao gerar a minuta." });
    }
  };

  const nextStep = () => {
      dispatch({ type: 'NEXT_STEP' });
  }

  const prevStep = () => {
      dispatch({ type: 'PREV_STEP' });
  }

  return (
    <div className="flex flex-col h-full bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden p-4">
      <div className="mb-4 flex space-x-2 text-xs font-semibold text-gray-500 overflow-x-auto whitespace-nowrap pb-1">
          <span className={state.currentStep >= 0 ? 'text-blue-600' : ''}>0. Intenção</span>
          <span>&gt;</span>
          <span className={state.currentStep >= 1 ? 'text-blue-600' : ''}>1. Proposta AI</span>
          <span>&gt;</span>
          <span className={state.currentStep >= 2 ? 'text-blue-600' : ''}>2. Revisão</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {state.currentStep === 0 && (
          <Step0_IntentDefinition
             onOrchestrated={(res) => {
                 dispatch({ type: 'SET_ORCHESTRATOR_RESPONSE', payload: res });
                 nextStep();
             }}
          />
        )}
        {state.currentStep === 1 && (
          <Step1_AIProposal
            orchestratorResponse={state.orchestratorResponse}
            onNext={nextStep}
            onPrev={prevStep}
          />
        )}
        {state.currentStep === 2 && (
          <Step2_ReviewAndGenerate
            requiredVariables={state.orchestratorResponse?.required_variables || []}
            groundTruth={groundTruth}
            finalPayload={state.clauseFormData}
            onOverride={(tag, value) => dispatch({ type: 'UPDATE_CLAUSE_FORM_DATA', payload: { tag, value } })}
            onGenerate={handleGenerate}
            isGenerating={state.isGenerating}
            error={state.error}
            generatedText={state.generatedText}
            generatedFileUrl={state.generatedFileUrl}
            onForwardToValidation={() => { if(state.generatedText) onGenerated(state.generatedText) }}
            onPrev={prevStep}
          />
        )}
      </div>
    </div>
  );
};

export default SmartWizardContainer;
