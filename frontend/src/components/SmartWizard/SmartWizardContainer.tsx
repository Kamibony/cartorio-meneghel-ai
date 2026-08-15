import React, { useReducer, useEffect } from 'react';
import Step1_TemplateSelection from './steps/Step1_TemplateSelection';
import Step2_RoleMapping from './steps/Step2_RoleMapping';
import Step3_SmartDropdowns from './steps/Step3_SmartDropdowns';
import Step4_ReviewAndGenerate from './steps/Step4_ReviewAndGenerate';
import { ENV } from '../../config/env';
import apiClient from '../../api/client';
import { auth } from '../../utils/firebase';
import { useAuth } from '../../contexts/AuthContext';

interface Template {
  id: string;
  name: string;
  required_tags: string[];
  roles_schema?: any[];
}

export interface WizardState {
  currentStep: number;
  selectedTemplate: Template | null;
  roleSelections: Record<string, any>; // maps role name to selected entity
  arraySelections: Record<string, any[]>; // maps array name to selected items
  manualOverrides: Record<string, string>; // maps tag name to value
  finalPayload: Record<string, any>;
  isGenerating: boolean;
  error: string | null;
  generatedText: string | null;
  generatedFileUrl: string | null;
}

type WizardAction =
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'SET_STEP'; payload: number }
  | { type: 'SELECT_TEMPLATE'; payload: Template | null }
  | { type: 'SELECT_ROLE'; payload: { roleName: string; entity: any } }
  | { type: 'UPDATE_ARRAY_SELECTIONS'; payload: Record<string, any[]> }
  | { type: 'SET_MANUAL_OVERRIDE'; payload: { tag: string; value: string } }
  | { type: 'COMPUTE_FINAL_PAYLOAD'; payload: { groundTruth: any } }
  | { type: 'START_GENERATION' }
  | { type: 'GENERATION_SUCCESS'; payload: { text: string; fileUrl: string } }
  | { type: 'GENERATION_ERROR'; payload: string }
  | { type: 'RESET' };

const initialState: WizardState = {
  currentStep: 1,
  selectedTemplate: null,
  roleSelections: {},
  arraySelections: {},
  manualOverrides: {},
  finalPayload: {},
  isGenerating: false,
  error: null,
  generatedText: null,
  generatedFileUrl: null,
};

function getValueFromEntity(entity: any, attrName: string): any {
  if (!entity || !attrName) return null;

  // 1. Check root level
  if (entity[attrName] !== undefined) {
    return entity[attrName];
  }

  // 2. Check attributes array
  if (Array.isArray(entity.attributes)) {
    const attr = entity.attributes.find((a: any) =>
      a.key && a.key.toLowerCase().trim() === attrName.toLowerCase().trim()
    );
    if (attr && attr.value !== undefined) {
      return attr.value;
    }
  }

  return null;
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'NEXT_STEP':
      return { ...state, currentStep: state.currentStep + 1 };
    case 'PREV_STEP':
      return { ...state, currentStep: state.currentStep - 1 };
    case 'SET_STEP':
      return { ...state, currentStep: action.payload };
    case 'SELECT_TEMPLATE':
      return { ...state, selectedTemplate: action.payload, roleSelections: {}, arraySelections: {}, manualOverrides: {}, finalPayload: {}, error: null, generatedText: null, generatedFileUrl: null };
    case 'SELECT_ROLE':
      return {
        ...state,
        roleSelections: {
          ...state.roleSelections,
          [action.payload.roleName]: action.payload.entity,
        },
      };
    case 'UPDATE_ARRAY_SELECTIONS':
      return {
        ...state,
        arraySelections: action.payload,
      };
    case 'SET_MANUAL_OVERRIDE':
      return {
        ...state,
        manualOverrides: {
          ...state.manualOverrides,
          [action.payload.tag]: action.payload.value,
        },
      };
    case 'COMPUTE_FINAL_PAYLOAD': {
      if (!state.selectedTemplate) return state;
      const { groundTruth } = action.payload;
      const sourceData = groundTruth?.human_final_data || groundTruth?.ai_extracted_data || groundTruth || {};
      const newPayload: Record<string, string> = {};

      // Cascade 2: Role selections (Role-first loop)
      if (state.selectedTemplate?.roles_schema) {
        for (const roleSchema of state.selectedTemplate.roles_schema) {
          const roleName = roleSchema.role;
          const selectedEntity = state.roleSelections[roleName];
          if (selectedEntity) {
            const mapping = roleSchema.mapping;
            for (const [entityAttr, mappedTag] of Object.entries(mapping)) {
              const val = getValueFromEntity(selectedEntity, entityAttr);
              if (typeof mappedTag === 'string' && val !== null && val !== undefined && val !== '') {
                // Find matching required tag (case-insensitive)
                const matchingTag = state.selectedTemplate.required_tags.find(
                  (t) => t.trim().toLowerCase() === mappedTag.trim().toLowerCase()
                );
                if (matchingTag) {
                  // Accumulate values if multiple roles map to the same tag (e.g., merging multiple entities)
                  const strVal = typeof val === 'string' ? val : JSON.stringify(val);
                  if (matchingTag in newPayload) {
                     // If it's already there, append it (or arrayify it) so we don't lose the first role's data
                     // Since the payload expects strings, let's join with a newline or comma
                     if (newPayload[matchingTag] !== strVal) {
                       newPayload[matchingTag] = newPayload[matchingTag] + '\n' + strVal;
                     }
                  } else {
                     newPayload[matchingTag] = strVal;
                  }
                }
              }
            }
          }
        }
      }

      state.selectedTemplate.required_tags.forEach((tag) => {
        // Cascade 1: Manual overrides (take precedence over everything, even role selections)
        if (tag in state.manualOverrides) {
          newPayload[tag] = state.manualOverrides[tag];
          return;
        }

        // If tag was already populated by role selections, keep it and skip fallback
        if (tag in newPayload) {
          return;
        }

        // Cascade 2.5: Array selections (if any match the tag directly, e.g. "IMOVEIS" -> list of imoveis)
        // Since tags are often uppercase and array keys lowercase, do a loose check
        const matchingArrayKey = Object.keys(state.arraySelections || {}).find(k => k.toLowerCase() === tag.toLowerCase());
        if (matchingArrayKey && state.arraySelections[matchingArrayKey] && state.arraySelections[matchingArrayKey].length > 0) {
            newPayload[tag] = JSON.stringify(state.arraySelections[matchingArrayKey], null, 2);
            return;
        }

        // Cascade 3: Raw verified_data (Fallback)
        if (tag in sourceData) {
          newPayload[tag] = typeof sourceData[tag] === 'string'
            ? sourceData[tag]
            : JSON.stringify(sourceData[tag], null, 2);
        } else {
           // Fallback to empty string for missing tags to allow user to see it needs filling
           newPayload[tag] = '';
        }
      });

      return { ...state, finalPayload: newPayload };
    }
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

  // Re-compute payload when roles or overrides change
  useEffect(() => {
    dispatch({ type: 'COMPUTE_FINAL_PAYLOAD', payload: { groundTruth } });
  }, [state.selectedTemplate, state.roleSelections, state.arraySelections, state.manualOverrides, groundTruth]);

  const handleGenerate = async () => {
    if (!state.selectedTemplate || !cartorioId) return;
    dispatch({ type: 'START_GENERATION' });
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Não autenticado.");

      const payload = {
        cartorio_id: cartorioId,
        template_id: state.selectedTemplate.id,
        verified_data: state.finalPayload,
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
      <div className="mb-4 flex space-x-2 text-xs font-semibold text-gray-500">
          <span className={state.currentStep >= 1 ? 'text-blue-600' : ''}>1. Template</span>
          <span>&gt;</span>
          <span className={state.currentStep >= 2 ? 'text-blue-600' : ''}>2. Papéis (Roles)</span>
          <span>&gt;</span>
          <span className={state.currentStep >= 3 ? 'text-blue-600' : ''}>3. Listas</span>
          <span>&gt;</span>
          <span className={state.currentStep >= 4 ? 'text-blue-600' : ''}>4. Revisão</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {state.currentStep === 1 && (
          <Step1_TemplateSelection
            selectedTemplateId={state.selectedTemplate?.id || ''}
            onSelectTemplate={(t) => dispatch({ type: 'SELECT_TEMPLATE', payload: t })}
            onNext={nextStep}
          />
        )}
        {state.currentStep === 2 && state.selectedTemplate && (
          <Step2_RoleMapping
            template={state.selectedTemplate}
            groundTruth={groundTruth}
            roleSelections={state.roleSelections}
            onSelectRole={(roleName, entity) => dispatch({ type: 'SELECT_ROLE', payload: { roleName, entity } })}
            onNext={nextStep}
            onPrev={prevStep}
          />
        )}
        {state.currentStep === 3 && state.selectedTemplate && (
          <Step3_SmartDropdowns
            template={state.selectedTemplate}
            groundTruth={groundTruth}
            arraySelections={state.arraySelections}
            onUpdateArraySelections={(selections) => dispatch({ type: 'UPDATE_ARRAY_SELECTIONS', payload: selections })}
            onNext={nextStep}
            onPrev={prevStep}
          />
        )}
        {state.currentStep === 4 && state.selectedTemplate && (
          <Step4_ReviewAndGenerate
            template={state.selectedTemplate}
            groundTruth={groundTruth}
            finalPayload={state.finalPayload}
            onOverride={(tag, value) => dispatch({ type: 'SET_MANUAL_OVERRIDE', payload: { tag, value } })}
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
