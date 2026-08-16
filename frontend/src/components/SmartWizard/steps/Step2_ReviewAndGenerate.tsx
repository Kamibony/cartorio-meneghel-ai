import React from 'react';
import AIContextualTextarea from '../components/AIContextualTextarea';

interface Props {
  requiredVariables: any[];
  roleMapping: Record<string, string[]>;
  onRoleMappingChange: (role: string, entityIds: string[]) => void;
  groundTruth?: any;
  finalPayload: Record<string, string>;
  onOverride: (tag: string, value: string) => void;
  onPreview: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  error: string | null;
  generatedText: string | null;
  generatedFileUrl: string | null;
  onForwardToValidation: () => void;
  onPrev: () => void;
}

const Step2_ReviewAndGenerate: React.FC<Props> = ({
    requiredVariables, roleMapping, onRoleMappingChange, finalPayload, onOverride, onPreview, onGenerate,
    isGenerating, error, generatedText, generatedFileUrl, onForwardToValidation, onPrev,
    groundTruth
}) => {

  const entities = groundTruth?.entities || groundTruth?._contexto_extraido?.entities || [];

  const handleRoleEntityToggle = (role: string, entityId: string) => {
    const currentList = roleMapping[role] || [];
    if (currentList.includes(entityId)) {
        onRoleMappingChange(role, currentList.filter(id => id !== entityId));
    } else {
        onRoleMappingChange(role, [...currentList, entityId]);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Revisão e Geração</h2>

      {!generatedText && (
          <div className="flex-1 overflow-y-auto pr-2 mb-4">
              <h3 className="text-xs font-medium text-gray-800 mb-3">Mapeamento de Entidades (Papéis):</h3>
              <div className="grid grid-cols-1 gap-3 mb-6">
                {Object.keys(roleMapping).map(role => (
                  <div key={role} className="border border-gray-200 rounded p-2 bg-gray-50">
                     <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">{role}</label>
                     <div className="flex flex-col space-y-2">
                        {entities.map((entity: any) => {
                            const entityName = entity.nome || entity.razao_social || entity.name || entity.entity_name || entity.id;
                            const isSelected = (roleMapping[role] || []).includes(entity.id);
                            return (
                                <label key={entity.id} className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => handleRoleEntityToggle(role, entity.id)}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>{entityName}</span>
                                </label>
                            );
                        })}
                     </div>
                  </div>
                ))}
              </div>

              <h3 className="text-xs font-medium text-gray-800 mb-3">Verifique os demais dados antes de gerar:</h3>
              <div className="grid grid-cols-1 gap-3">
                  {requiredVariables.map((variable: any) => {
                      const tag = variable.name;
                      return (
                      <div key={tag}>
                          <label className="block text-xs font-medium text-gray-700 mb-1 capitalize" title={variable.description}>
                              {tag.replace(/_/g, ' ')}
                              {variable.description && <span className="ml-1 text-gray-400 normal-case">({variable.description})</span>}
                          </label>
                          {tag.toLowerCase().startsWith('valor_') || tag.toLowerCase().includes('emolumentos') || variable.type === 'number' ? (
                              <input
                                  type="text"
                                  value={finalPayload[tag] || ''}
                                  onChange={(e) => onOverride(tag, e.target.value)}
                                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 text-xs px-2 py-1.5 border border-green-300 bg-green-50"
                                  placeholder={`Valor exato para ${tag}`}
                              />
                          ) : (
                              <AIContextualTextarea
                                tag={tag}
                                value={finalPayload[tag] || ''}
                                onChange={(val) => onOverride(tag, val)}
                                groundTruth={groundTruth}
                              />
                          )}
                      </div>
                      );
                  })}
              </div>
          </div>
      )}

      {error && <div className="text-red-600 text-xs mt-2 mb-2">{error}</div>}

      {generatedText ? (
        <div className="flex-1 flex flex-col min-h-[300px]">
          <h3 className="text-sm font-medium text-gray-800 mb-2">Pré-visualização da Minuta Gerada</h3>
          <textarea
            className="flex-1 w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm p-3 border bg-gray-50 resize-none"
            readOnly
            value={generatedText}
          />
          <div className="pt-4 flex justify-between shrink-0 mt-4">
            {!generatedFileUrl ? (
                <button
                  onClick={onGenerate}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded hover:bg-green-700 disabled:bg-green-400 shadow-sm transition-colors"
                >
                  {isGenerating ? 'Gerando...' : 'Gerar Documento Final'}
                </button>
            ) : (
                <>
                <a
                  href={generatedFileUrl}
                  download={`minuta_${Date.now()}.docx`}
                  className="px-4 py-2 bg-gray-600 text-white text-sm font-bold rounded hover:bg-gray-700 shadow-sm transition-colors"
                >
                  Baixar .docx
                </a>
                <button
                  onClick={onForwardToValidation}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 shadow-sm transition-colors"
                >
                  Avançar para Validação
                </button>
                </>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-auto pt-4 flex justify-between border-t border-gray-200">
             <button
              onClick={onPrev}
              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-bold rounded hover:bg-gray-300 transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={onPreview}
              disabled={isGenerating}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 disabled:bg-blue-400 shadow-sm transition-colors"
            >
                {isGenerating ? 'Carregando...' : 'Pré-visualizar Minuta'}
            </button>
        </div>
      )}
    </div>
  );
};

export default Step2_ReviewAndGenerate;
