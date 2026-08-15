import React, { useState, useEffect } from 'react';

interface Props {
  template: any;
  groundTruth: any;
  arraySelections: Record<string, any[]>;
  onUpdateArraySelections: (selections: Record<string, any[]>) => void;
  onNext: () => void;
  onPrev: () => void;
}

const Step3_SmartDropdowns: React.FC<Props> = ({
  groundTruth,
  arraySelections,
  onUpdateArraySelections,
  onNext,
  onPrev
}) => {
  // Identify possible array keys from groundTruth to present to user
  const [availableArrays, setAvailableArrays] = useState<{key: string, data: any[]}[]>([]);

  useEffect(() => {
    const extractedData = groundTruth?.human_final_data || groundTruth?.ai_extracted_data || groundTruth || {};
    const arrays: {key: string, data: any[]}[] = [];

    // Filter out standard entity arrays that are usually handled in Step 2,
    // and look for things like 'imoveis', 'bens', 'veiculos', etc.
    const ignoredKeys = ['entities', 'pessoas'];

    for (const [key, value] of Object.entries(extractedData)) {
      if (Array.isArray(value) && value.length > 0 && !ignoredKeys.includes(key.toLowerCase())) {
        arrays.push({ key, data: value });
      }
    }
    setAvailableArrays(arrays);
  }, [groundTruth]);

  // Handle checking/unchecking items in an array
  const handleToggleItem = (arrayKey: string, item: any, isChecked: boolean) => {
    const currentSelections = arraySelections[arrayKey] || [];
    let newSelections;

    if (isChecked) {
      newSelections = [...currentSelections, item];
    } else {
      // Find and remove (comparing by JSON stringification as a simple heuristic)
      const itemStr = JSON.stringify(item);
      newSelections = currentSelections.filter(sel => JSON.stringify(sel) !== itemStr);
    }

    onUpdateArraySelections({
      ...arraySelections,
      [arrayKey]: newSelections
    });
  };

  const isItemSelected = (arrayKey: string, item: any) => {
    const currentSelections = arraySelections[arrayKey] || [];
    const itemStr = JSON.stringify(item);
    return currentSelections.some(sel => JSON.stringify(sel) === itemStr);
  };

  // Simple formatter for generic objects
  const renderItemPreview = (item: any) => {
    if (typeof item !== 'object' || item === null) return String(item);

    // Look for common "name" or "description" fields
    const label = item.matricula || item.descricao || item.nome || item.tipo || item.id;
    if (label) return String(label);

    // Fallback to truncating JSON
    const jsonStr = JSON.stringify(item);
    return jsonStr.length > 50 ? jsonStr.substring(0, 50) + '...' : jsonStr;
  };

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Seleções Inteligentes (Listas)</h2>
      <p className="text-xs text-gray-500 mb-4">
        Selecione os itens extraídos do documento que devem ser incluídos na minuta (ex: Imóveis, Bens).
      </p>

      {availableArrays.length === 0 ? (
        <div className="text-sm text-gray-500 italic mb-4 flex-1">
          Nenhuma lista de itens adicionais (como imóveis ou bens) foi detectada no documento extraído.
        </div>
      ) : (
        <div className="space-y-6 flex-1 overflow-y-auto pr-2">
          {availableArrays.map((arrObj) => (
            <div key={arrObj.key} className="border border-gray-200 rounded p-3 bg-gray-50">
              <h3 className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                {arrObj.key.replace(/_/g, ' ')}
              </h3>
              <div className="space-y-2">
                {arrObj.data.map((item, idx) => (
                  <label key={idx} className="flex items-start space-x-2 cursor-pointer hover:bg-gray-100 p-1.5 rounded transition-colors">
                    <input
                      type="checkbox"
                      checked={isItemSelected(arrObj.key, item)}
                      onChange={(e) => handleToggleItem(arrObj.key, item, e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-800 break-words flex-1">
                      {renderItemPreview(item)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto pt-4 flex justify-between border-t border-gray-200">
        <button
          onClick={onPrev}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-bold rounded hover:bg-gray-300 transition-colors"
        >
          Voltar
        </button>
        <button
          onClick={onNext}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 transition-colors"
        >
          Próximo
        </button>
      </div>
    </div>
  );
};

export default Step3_SmartDropdowns;
