import React from 'react';

interface Props {
  orchestratorResponse: any;
  onNext: () => void;
  onPrev: () => void;
}

const Step1_AIProposal: React.FC<Props> = ({ orchestratorResponse, onNext, onPrev }) => {
  const reasoning = orchestratorResponse?.reasoning || "A IA não forneceu uma explicação.";
  const selectedIds = orchestratorResponse?.selected_clause_ids || [];

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Proposta da IA</h2>

      <div className="flex-1 overflow-y-auto pr-2">
        <div className="mb-4">
          <h3 className="text-xs font-medium text-gray-800 mb-2">Raciocínio:</h3>
          <p className="text-xs text-gray-600 bg-blue-50 p-3 rounded border border-blue-100">
            {reasoning}
          </p>
        </div>

        <div>
          <h3 className="text-xs font-medium text-gray-800 mb-2">Cláusulas Selecionadas:</h3>
          {selectedIds.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-gray-600 space-y-1">
              {selectedIds.map((id: string, idx: number) => (
                <li key={idx} className="font-mono">{id}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">Nenhuma cláusula selecionada.</p>
          )}
        </div>
      </div>

      <div className="mt-auto pt-4 flex justify-between">
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
          Avançar para Revisão
        </button>
      </div>
    </div>
  );
};

export default Step1_AIProposal;
