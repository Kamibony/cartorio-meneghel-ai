import React, { useState, useEffect } from 'react';
import SmartDropdown from '../components/SmartDropdown';
import AIContextualTextarea from '../components/AIContextualTextarea';

interface Props {
  groundTruth: any;
  selectedClauses: any[];
  wizardFields: any[];
  wizardValues: Record<string, any>;
  onUpdateValues: (values: Record<string, any>) => void;
  onPrev: () => void;
  onNext: () => void;
  isGenerating?: boolean;
}

const Step1_ClauseSelection: React.FC<Props> = ({
  groundTruth,
  selectedClauses,
  wizardFields,
  wizardValues,
  onUpdateValues,
  onPrev,
  onNext,
  isGenerating
}) => {
  const [localValues, setLocalValues] = useState<Record<string, any>>(wizardValues);

  useEffect(() => {
    setLocalValues(wizardValues);
  }, [wizardValues]);

  const handleChange = (field: string, value: any) => {
    const newValues = { ...localValues, [field]: value };
    setLocalValues(newValues);
    onUpdateValues(newValues);
  };

  const getEntityOptions = () => {
    const entities = groundTruth?.entities || groundTruth?._contexto_extraido?.entities || [];
    return entities.map((ent: any) => ({
      label: ent.nome || ent.razao_social || ent.name || ent.entity_name || ent.id,
      value: ent.id
    }));
  };

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Seleção de Cláusulas e Variáveis</h2>

      <div className="mb-4">
        <h3 className="text-xs font-semibold text-gray-600 mb-2 border-b pb-1">Cláusulas Selecionadas (Orquestração IA)</h3>
        {selectedClauses.length > 0 ? (
          <ul className="list-disc pl-5 text-xs text-gray-700">
            {selectedClauses.map((clause, idx) => (
              <li key={idx} className="mb-1">{clause.id || clause.text || JSON.stringify(clause)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500 italic">Nenhuma cláusula identificada.</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto mb-4 border rounded p-3 bg-gray-50">
        <h3 className="text-xs font-semibold text-gray-600 mb-2 border-b pb-1">Mapeamento de Variáveis</h3>
        {wizardFields.length > 0 ? (
          wizardFields.map((field, idx) => {
             const fieldName = typeof field === 'string' ? field : field.name;

             if (fieldName.toLowerCase().includes('text') || fieldName.toLowerCase().includes('descrição') || fieldName.toLowerCase().includes('condicoes')) {
                 return (
                     <div key={idx} className="mb-4">
                         <AIContextualTextarea
                           tag={fieldName}
                           value={localValues[fieldName] || ''}
                           onChange={(val) => handleChange(fieldName, val)}
                           groundTruth={groundTruth}
                           placeholder={`Descreva ${fieldName}...`}
                         />
                     </div>
                 )
             }

             return (
               <SmartDropdown
                 key={idx}
                 label={`Selecione a Entidade para: ${fieldName}`}
                 value={localValues[fieldName] || ''}
                 options={getEntityOptions()}
                 onChange={(val) => handleChange(fieldName, val)}
               />
             );
          })
        ) : (
          <p className="text-xs text-gray-500 italic">Nenhuma variável adicional requerida para estas cláusulas.</p>
        )}
      </div>

      <div className="mt-auto pt-4 flex justify-between border-t border-gray-200">
        <button
          onClick={onPrev}
          disabled={isGenerating}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-bold rounded hover:bg-gray-300 disabled:opacity-50 transition-colors"
        >
          Voltar
        </button>
        <button
          onClick={onNext}
          disabled={isGenerating}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
        >
          {isGenerating ? 'Gerando...' : 'Avançar para Revisão'}
        </button>
      </div>
    </div>
  );
};

export default Step1_ClauseSelection;
