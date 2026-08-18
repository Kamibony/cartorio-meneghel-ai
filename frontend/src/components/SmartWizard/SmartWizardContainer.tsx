import React, { useReducer, useEffect, useMemo } from 'react';
import Step0_IntentDefinition from './steps/Step0_IntentDefinition';
import Step1_ReviewDocument from './steps/Step1_ReviewDocument';
import { auth } from '../../utils/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { ENV } from '../../config/env';
import apiClient from '../../api/client';

interface SmartWizardContainerProps {
  groundTruth: any;
  draftId?: string;
  onGenerated: (plainText: string) => void;
}

interface WizardState {
  currentStep: number;
  intent: string;
  isGenerating: boolean;
  generatedText: string | null;
  generatedFileUrl: string | null;
  error: string | null;
}

type WizardAction =
  | { type: 'SET_INTENT'; payload: string }
  | { type: 'START_GENERATION' }
  | { type: 'PREVIEW_SUCCESS'; payload: string }
  | { type: 'GENERATION_SUCCESS'; payload: { text: string; fileUrl: string } }
  | { type: 'GENERATION_ERROR'; payload: string }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'RESET' };

const initialState: WizardState = {
  currentStep: 0,
  intent: '',
  isGenerating: false,
  generatedText: null,
  generatedFileUrl: null,
  error: null,
};

function initWizardState(initial: WizardState): WizardState {
  try {
    const cached = sessionStorage.getItem('wizard_state');
    if (cached) {
      return { ...initial, ...JSON.parse(cached) };
    }
  } catch (e) {
    console.error("Failed to load wizard state from session", e);
  }
  return initial;
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_INTENT':
      return { ...state, intent: action.payload };
    case 'START_GENERATION':
      return { ...state, isGenerating: true, error: null, generatedText: null, generatedFileUrl: null };
    case 'PREVIEW_SUCCESS':
      return { ...state, isGenerating: false, generatedText: action.payload };
    case 'GENERATION_SUCCESS':
      return { ...state, isGenerating: false, generatedText: action.payload.text, generatedFileUrl: action.payload.fileUrl };
    case 'GENERATION_ERROR':
      return { ...state, isGenerating: false, error: action.payload };
    case 'NEXT_STEP':
      return { ...state, currentStep: Math.min(state.currentStep + 1, 1) };
    case 'PREV_STEP':
      return { ...state, currentStep: Math.max(state.currentStep - 1, 0) };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

const SmartWizardContainer: React.FC<SmartWizardContainerProps> = ({ groundTruth, draftId, onGenerated }) => {
  const normalizedGroundTruth = useMemo(() => {
    if (!groundTruth) return null;
    const cloned = JSON.parse(JSON.stringify(groundTruth));
    const processEntities = (entities: any[]) => {
      if (!Array.isArray(entities)) return;
      entities.forEach((entity, index) => {
        if (!entity.id) {
          const entityName = entity.nome || entity.razao_social || entity.name || entity.entity_name;
          entity.id = entityName || `ent_idx_${index}`;
        }
      });
    };

    if (cloned.entities) processEntities(cloned.entities);
    if (cloned._contexto_extraido?.entities) processEntities(cloned._contexto_extraido.entities);

    return cloned;
  }, [groundTruth]);

  const [state, dispatch] = useReducer(wizardReducer, initialState, initWizardState);
  const { cartorioId } = useAuth();

  useEffect(() => {
    sessionStorage.setItem('wizard_state', JSON.stringify(state));
  }, [state]);

  const handlePreview = async (intentStr: string) => {
    if (!cartorioId) return;

    dispatch({ type: 'SET_INTENT', payload: intentStr });
    dispatch({ type: 'NEXT_STEP' });
    dispatch({ type: 'START_GENERATION' });

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Não autenticado.");

      const payload = {
        cartorio_id: cartorioId,
        template_id: "DYNAMIC_CLAUSES",
        intent: intentStr,
        ground_truth: normalizedGroundTruth,
        draft_id: draftId || normalizedGroundTruth?.document_id || null,
        imported_at: normalizedGroundTruth?.updatedAt ? {
             _seconds: normalizedGroundTruth.updatedAt.seconds,
             _nanoseconds: normalizedGroundTruth.updatedAt.nanoseconds
         } : null
      };

      const endpoint = `${ENV.generateApiUrl}/preview_dynamic_document`;
      const result: any = await apiClient.post(endpoint, payload);

      if (result.status === 'success' && result.preview_text !== undefined) {
          dispatch({ type: 'PREVIEW_SUCCESS', payload: result.preview_text });
      } else if (result.status === 'success' && result.plain_text !== undefined) {
          // Fallback if the backend returns plain_text instead of preview_text
          dispatch({ type: 'PREVIEW_SUCCESS', payload: result.plain_text });
      } else {
          throw new Error("Resposta inválida do servidor.");
      }
    } catch (err: any) {
      console.error("Preview error", err);
      dispatch({ type: 'GENERATION_ERROR', payload: err.message || "Ocorreu um erro ao gerar a pré-visualização." });
    }
  };

  const handleGenerate = async () => {
    if (!cartorioId) return;
    dispatch({ type: 'START_GENERATION' });
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Não autenticado.");

      const payload = {
        cartorio_id: cartorioId,
        template_id: "DYNAMIC_CLAUSES",
        intent: state.intent,
        ground_truth: normalizedGroundTruth,
        draft_id: draftId || normalizedGroundTruth?.document_id || null,
        imported_at: normalizedGroundTruth?.updatedAt ? {
             _seconds: normalizedGroundTruth.updatedAt.seconds,
             _nanoseconds: normalizedGroundTruth.updatedAt.nanoseconds
         } : null
      };

      const endpoint = `${ENV.generateApiUrl}/generate_document_api`;
      const result: any = await apiClient.post(endpoint, payload);

      if (result.status === 'success' && result.file_base64) {
          // Note: generate_document_api might return preview_text or plain_text
          const plainText = result.plain_text !== undefined ? result.plain_text : result.preview_text;

          if (plainText === undefined) {
              throw new Error("O servidor não retornou o texto extraído da minuta.");
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
          dispatch({ type: 'GENERATION_SUCCESS', payload: { text: plainText, fileUrl: url } });
          onGenerated(plainText);
      } else {
          throw new Error("Resposta inválida do servidor.");
      }
    } catch (err: any) {
      console.error("Generate error", err);
      dispatch({ type: 'GENERATION_ERROR', payload: err.message || "Ocorreu um erro ao gerar a minuta." });
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden p-4">
      <div className="mb-4 flex space-x-2 text-xs font-semibold text-gray-500 overflow-x-auto whitespace-nowrap pb-1">
          <span className={state.currentStep >= 0 ? 'text-blue-600' : ''}>0. Intenção</span>
          <span>&gt;</span>
          <span className={state.currentStep >= 1 ? 'text-blue-600' : ''}>1. Revisão</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {state.currentStep === 0 && (
          <Step0_IntentDefinition
             groundTruth={normalizedGroundTruth}
             onOrchestrated={(response, intentStr) => {
                 handlePreview(intentStr);
             }}
          />
        )}
        {state.currentStep === 1 && (
          <Step1_ReviewDocument
            onGenerate={handleGenerate}
            isGenerating={state.isGenerating}
            error={state.error}
            generatedText={state.generatedText}
            generatedFileUrl={state.generatedFileUrl}
            onForwardToValidation={() => { if(state.generatedText) onGenerated(state.generatedText) }}
            onPrev={() => dispatch({ type: 'PREV_STEP' })}
          />
        )}
      </div>
    </div>
  );
};

export default SmartWizardContainer;