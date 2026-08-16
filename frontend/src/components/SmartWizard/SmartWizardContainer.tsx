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
  roleMapping: Record<string, string[]>;
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
  | { type: 'UPDATE_ROLE_MAPPING'; payload: { role: string; entityIds: string[] } }
  | { type: 'AUTOFILL_CLAUSE_FORM_DATA'; payload: Record<string, string> }
  | { type: 'START_GENERATION' }
  | { type: 'GENERATION_SUCCESS'; payload: { text: string; fileUrl: string } }
  | { type: 'GENERATION_ERROR'; payload: string }
  | { type: 'RESET' };

const initialState: WizardState = {
  currentStep: 0,
  orchestratorResponse: null,
  clauseFormData: {},
  roleMapping: {},
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
        roleMapping: action.payload?.role_mapping || {},
        error: null,
        generatedText: null,
        generatedFileUrl: null
      };
    case 'AUTOFILL_CLAUSE_FORM_DATA':
      return {
        ...state,
        clauseFormData: {
          ...state.clauseFormData,
          ...action.payload,
        },
      };
    case 'UPDATE_CLAUSE_FORM_DATA':
      return {
        ...state,
        clauseFormData: {
          ...state.clauseFormData,
          [action.payload.tag]: action.payload.value,
        },
      };
    case 'UPDATE_ROLE_MAPPING':
      return {
        ...state,
        roleMapping: {
          ...state.roleMapping,
          [action.payload.role]: action.payload.entityIds,
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
      return { ...initial, ...parsed };
    }
  } catch (e) {
    console.error("Failed to parse wizard state from sessionStorage", e);
  }
  return initial;
};

const SmartWizardContainer: React.FC<SmartWizardContainerProps> = ({ groundTruth, onGenerated }) => {
  // Inject stable unique IDs into groundTruth entities if they are missing
  const normalizedGroundTruth = React.useMemo(() => {
    if (!groundTruth) return groundTruth;

    let cloned = JSON.parse(JSON.stringify(groundTruth));
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

  useEffect(() => {
    sessionStorage.setItem('wizard_state', JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (state.orchestratorResponse?.required_variables && normalizedGroundTruth) {
      const newFormData: Record<string, string> = {};
      let hasChanges = false;

      const extractFlatValue = (data: any, searchTag: string): string | null => {
        if (!data) return null;
        if (typeof data[searchTag] === 'string') return data[searchTag];
        if (data._contexto_extraido && typeof data._contexto_extraido[searchTag] === 'string') return data._contexto_extraido[searchTag];

        const lowerTag = searchTag.toLowerCase();
        const searchEntities = (entities: any[]) => {
            if (!Array.isArray(entities)) return null;
            for (const entity of entities) {
                const roleMatch = lowerTag.split('_')[0];
                const roleMatches = (entity.role || '').toLowerCase() === roleMatch ||
                                    (entity.logical_role || '').toLowerCase() === roleMatch;

                let isValidFallback = false;
                if (!entity.role && !roleMatches) {
                    isValidFallback = true;
                    // Semantic constraint: if looking for a bank, don't fallback to a physical person
                    if (roleMatch.includes('banco') && (entity.entity_type === 'PESSOA_FISICA' || entity.cpf)) {
                        isValidFallback = false;
                    }
                    // Add more semantic constraints here as needed
                }

                if (roleMatches || isValidFallback) {
                    if (lowerTag.includes('nome') || lowerTag.includes('razao_social')) {
                        const name = entity.entity_name || entity.nome || entity.razao_social || entity.nome_fantasia || entity.name;
                        if (name && typeof name === 'string' && name.trim() !== '') return name.trim();
                    }

                    if (Array.isArray(entity.attributes)) {
                        for (const attr of entity.attributes) {
                            if (attr.key && lowerTag.includes(attr.key.toLowerCase())) {
                                if (attr.value && typeof attr.value === 'string' && attr.value.trim() !== '') return attr.value.trim();
                            }
                        }
                    }
                }
            }
            return null;
        };

        let res = searchEntities(data.entities);
        if (res) return res;

        if (data._contexto_extraido) {
            res = searchEntities(data._contexto_extraido.entities);
            if (res) return res;
        }

        return null;
      };

      state.orchestratorResponse.required_variables.forEach((variable: any) => {
        const tag = variable.name;
        if (state.clauseFormData[tag] === undefined) {
          const extracted = extractFlatValue(normalizedGroundTruth, tag);
          newFormData[tag] = extracted !== null ? extracted : "";
          hasChanges = true;
        }
      });

      if (hasChanges) {
        dispatch({ type: 'AUTOFILL_CLAUSE_FORM_DATA', payload: newFormData });
      }
    }
  }, [state.orchestratorResponse, normalizedGroundTruth, state.clauseFormData]);
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
        role_mapping: state.roleMapping,
        selected_clause_ids: state.orchestratorResponse?.selected_clause_ids || [],
        draft_id: normalizedGroundTruth?.document_id || null,
        imported_at: normalizedGroundTruth?.updatedAt ? {
             _seconds: normalizedGroundTruth.updatedAt.seconds,
             _nanoseconds: normalizedGroundTruth.updatedAt.nanoseconds
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
          onGenerated(result.plain_text);
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
             groundTruth={normalizedGroundTruth}
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
            roleMapping={state.roleMapping}
            onRoleMappingChange={(role, entityIds) => dispatch({ type: 'UPDATE_ROLE_MAPPING', payload: { role, entityIds } })}
            groundTruth={normalizedGroundTruth}
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
