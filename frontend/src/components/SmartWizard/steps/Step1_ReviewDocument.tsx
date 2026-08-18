import React from 'react';

interface Props {
  onGenerate: () => void;
  isGenerating: boolean;
  error: string | null;
  generatedText: string | null;
  generatedFileUrl: string | null;
  onForwardToValidation: () => void;
  onPrev: () => void;
}

const Step1_ReviewDocument: React.FC<Props> = ({
    onGenerate,
    isGenerating,
    error,
    generatedText,
    generatedFileUrl,
    onForwardToValidation,
    onPrev
}) => {

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Documento Gerado</h2>

      {error && <div className="text-red-600 text-xs mt-2 mb-2">{error}</div>}

      {isGenerating && !generatedText && (
          <div className="flex-1 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-sm text-gray-600">Sintetizando documento legal...</p>
          </div>
      )}

      {generatedText && (
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
                  {isGenerating ? 'Gerando .docx...' : 'Gerar Documento Final'}
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
      )}

      {!generatedText && !isGenerating && (
         <div className="mt-auto pt-4 flex justify-between border-t border-gray-200">
             <button
              onClick={onPrev}
              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-bold rounded hover:bg-gray-300 transition-colors"
            >
              Voltar
            </button>
        </div>
      )}
    </div>
  );
};

export default Step1_ReviewDocument;
