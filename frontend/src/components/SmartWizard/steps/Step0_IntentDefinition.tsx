import React, { useState } from 'react';

interface Props {
  groundTruth: any;
  onOrchestrated: (response: any, intentStr: string) => void;
}

const Step0_IntentDefinition: React.FC<Props> = ({ onOrchestrated }) => {
  const [intent, setIntent] = useState('');

  const handleSubmit = async () => {
    if (!intent.trim()) return;
    // Emitting null for response as we've deprecated orchestrateDocument
    onOrchestrated(null, intent);
  };

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Defina sua Intenção</h2>

      <p className="text-xs text-gray-500 mb-2">
        Descreva o que você deseja fazer em linguagem natural.
      </p>

      <div className="mb-4">
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Ex: Quero fazer uma procuração para vender um carro..."
          className="w-full h-32 p-3 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
      </div>

      <div className="mt-auto pt-4 flex justify-end space-x-2">
        <button
          onClick={handleSubmit}
          disabled={!intent.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 disabled:bg-blue-300 transition-colors flex items-center"
        >
          Avançar
        </button>
      </div>
    </div>
  );
};

export default Step0_IntentDefinition;