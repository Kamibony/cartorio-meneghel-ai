import React, { useState } from 'react';
import { orchestrateDocument } from '../../../api/client';

interface Props {
  groundTruth: any;
  onOrchestrated: (response: any, intentStr: string) => void;
}

const Step0_IntentDefinition: React.FC<Props> = ({ groundTruth, onOrchestrated }) => {
  const [intent, setIntent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!intent.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const entities = groundTruth?.entities || groundTruth?._contexto_extraido?.entities || [];
      const response = await orchestrateDocument(intent, entities);
      onOrchestrated(response, intent);
    } catch (err: any) {
      console.error('Orchestrator Error:', err);
      setError(err.message || 'Erro ao processar intenção.');
    } finally {
      setIsLoading(false);
    }
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
          disabled={isLoading}
        />
      </div>

      {error && (
        <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="mt-auto pt-4 flex justify-end space-x-2">
        <button
          onClick={handleSubmit}
          disabled={!intent.trim() || isLoading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 disabled:bg-blue-300 transition-colors flex items-center"
        >
          {isLoading ? 'Processando...' : 'Avançar'}
        </button>
      </div>
    </div>
  );
};

export default Step0_IntentDefinition;
