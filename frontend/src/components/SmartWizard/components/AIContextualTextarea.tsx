import React, { useState } from 'react';
import apiClient from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';
import { ENV } from '../../../config/env';

interface Props {
  tag: string;
  value: string;
  onChange: (value: string) => void;
  groundTruth: any;
  placeholder?: string;
}

const AIContextualTextarea: React.FC<Props> = ({ tag, value, onChange, groundTruth, placeholder }) => {
  const { cartorioId } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAutoSuggest = async () => {
    if (!cartorioId) return;
    setIsLoading(true);
    setError(null);

    try {
      // The direct backend Cloud Run API URL pattern
      const endpoint = `${ENV.generateApiUrl}/suggest_field_text`;

      const payload = {
        cartorio_id: cartorioId,
        tag: tag,
        context_data: groundTruth || {}
      };

      const result: any = await apiClient.post(endpoint, payload);

      if (result.status === 'success' && result.suggestion) {
        onChange(result.suggestion);
      } else {
        throw new Error("Resposta inválida ou vazia do servidor.");
      }
    } catch (err: any) {
      console.error("Auto-suggest error", err);
      setError(err.message || "Erro ao gerar sugestão.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col w-full">
      <div className="flex justify-between items-center mb-1">
        <label className="block text-xs font-medium text-gray-700 capitalize">
          {tag.replace(/_/g, ' ')}
        </label>
        <button
          type="button"
          onClick={handleAutoSuggest}
          disabled={isLoading}
          className="text-xs px-2 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors flex items-center space-x-1"
          title="Sugerir texto com IA baseando-se no contexto do documento"
        >
          <span>✨</span>
          <span>{isLoading ? 'Gerando...' : 'Auto-suggest'}</span>
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-xs px-2 py-1.5 border resize-y min-h-[60px]"
        placeholder={placeholder || `Descreva os dados para: ${tag}`}
      />
      {error && <div className="text-red-500 text-[10px] mt-1">{error}</div>}
    </div>
  );
};

export default AIContextualTextarea;
