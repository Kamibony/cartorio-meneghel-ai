import React, { useState, useRef } from 'react';
import { useDocumentUpload } from '../hooks/useDocumentUpload';
import { ENV } from '../config/env';

// Type definitions for the expected API response
interface ValidationError {
  field: string;
  category: 'VALUE_MISMATCH' | 'MISSING_FIELD' | 'UNMATCHED_ENTITY';
  message: string;
  expected?: string;
  found?: string;
}

interface ValidationResponse {
  status?: string;
  errors?: ValidationError[];
  error?: string;
}

interface DataCheckerProps {
  groundTruth: any;
}

const DataChecker: React.FC<DataCheckerProps> = ({ groundTruth }) => {
  const [inputType, setInputType] = useState<'upload' | 'typing'>('upload');
  const [typedText, setTypedText] = useState<string>('');
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [cachedDraftText, setCachedDraftText] = useState<{fileName: string, text: string} | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[] | null>(null);
  const [resolvedErrors, setResolvedErrors] = useState<Set<string>>(new Set());
  const [serverError, setServerError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadAndExtract, isUploading, isExtracting } = useDocumentUpload();

  const handleValidate = async () => {
    setIsValidating(true);
    setValidationErrors(null);
    setResolvedErrors(new Set());
    setServerError(null);

    let textToValidate = typedText;

    try {
      if (inputType === 'upload' && draftFile) {
        if (cachedDraftText && cachedDraftText.fileName === draftFile.name) {
          textToValidate = cachedDraftText.text;
        } else {
          // Extract text from the uploaded draft document
          const extractedData = await uploadAndExtract(draftFile, 'DRAFT');
          if (extractedData && extractedData.text) {
            textToValidate = extractedData.text;
            setCachedDraftText({fileName: draftFile.name, text: extractedData.text});
          } else {
            throw new Error('Falha ao extrair texto da minuta.');
          }
        }
      }

      if (!textToValidate.trim()) {
         throw new Error('O texto para validação não pode estar vazio.');
      }

      const apiUrl = ENV.apiUrl;
      const endpoint = `${apiUrl}/validate_document_text`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ground_truth: groundTruth,
          typed_text: textToValidate,
        }),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Erro no servidor: Resposta não está em formato JSON. Por favor, tente novamente.');
      }

      const data: ValidationResponse = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
           setServerError('Serviço temporariamente indisponível devido ao alto volume (Rate Limit). Por favor, tente novamente em alguns segundos.');
        } else {
           setServerError(data.error || 'Ocorreu um erro desconhecido durante a validação');
        }
      } else {
        setValidationErrors(data.errors || []);
      }
    } catch (error: any) {
      setServerError(error.message || 'Falha ao conectar com o serviço de validação.');
      console.error('Validation error:', error);
    } finally {
      setIsValidating(false);
    }
  };

  const isButtonDisabled = isValidating || isUploading || isExtracting || !groundTruth;
  const isProcessing = isValidating || isUploading || isExtracting;

  const handleMarkAsResolved = async (error: ValidationError) => {
    try {
      const apiUrl = ENV.apiUrl;
      const endpoint = `${apiUrl}/log_hitl_resolution`;

      const documentId = groundTruth?.document_id || 'unknown';

      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_id: documentId,
          field: error.field,
          expected: error.expected || '',
          found: error.found || '',
          resolution_type: 'resolved_by_user',
        }),
      });

      // Update local state to mark this field as resolved
      setResolvedErrors(prev => {
        const next = new Set(prev);
        next.add(error.field);
        return next;
      });
    } catch (err) {
      console.error('Failed to log HitL resolution:', err);
      // Even if logging fails, we might still want to dismiss the card locally for UX,
      // but let's at least show the user an error happened.
      alert('Aviso: Falha ao registrar a resolução no servidor, mas ela foi ocultada localmente.');
      setResolvedErrors(prev => {
        const next = new Set(prev);
        next.add(error.field);
        return next;
      });
    }
  };

  return (
    <div className="h-full bg-white border border-gray-300 rounded-lg shadow-sm flex flex-col">
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex justify-between items-center">
        <h2 className="text-sm font-semibold text-gray-700">Área de Validação (Minuta)</h2>
        <div className="flex bg-white rounded-md border border-gray-300 p-0.5">
          <button
            onClick={() => setInputType('upload')}
            className={`px-3 py-1 text-xs font-medium rounded-sm ${inputType === 'upload' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Upload de Minuta
          </button>
          <button
            onClick={() => setInputType('typing')}
            className={`px-3 py-1 text-xs font-medium rounded-sm ${inputType === 'typing' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Digitar Texto
          </button>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col relative">
         {isProcessing && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <svg className="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-700 font-medium">
              {isUploading ? 'Enviando minuta...' : isExtracting ? 'Lendo minuta com IA...' : 'Validando dados...'}
            </p>
          </div>
        )}

        {inputType === 'upload' ? (
          <div
            className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-md p-6 bg-gray-50 hover:bg-gray-100 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                setDraftFile(e.dataTransfer.files[0]);
              }
            }}
          >
             <input
              id="file-upload"
              type="file"
              accept=".doc,.docx,.pdf,application/msword,application/pdf"
              ref={fileInputRef}
              onChange={(e) => e.target.files && setDraftFile(e.target.files[0])}
              className="hidden"
            />
            <div className="text-center">
               <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
               </svg>
               <div className="mt-4 flex text-sm text-gray-600 justify-center">
                 <label htmlFor="file-upload" className="relative cursor-pointer font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>Selecione um arquivo</span>
                 </label>
                 <p className="pl-1">ou arraste e solte</p>
               </div>
               <p className="text-xs text-gray-500 mt-2">Word (DOC/DOCX) ou PDF</p>
            </div>
            {draftFile && (
              <div className="mt-4 p-2 bg-blue-50 rounded border border-blue-200 text-sm text-blue-700 text-center w-full truncate">
                Arquivo selecionado: {draftFile.name}
              </div>
            )}
          </div>
        ) : (
          <textarea
            id="typed-text"
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            className="flex-1 w-full border border-gray-300 rounded-md shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm"
            placeholder="Digite ou cole o texto do documento aqui..."
            disabled={isValidating}
          />
        )}

        <div className="mt-4 flex justify-between items-center">
          {!groundTruth && (
            <span className="text-sm text-yellow-600 bg-yellow-50 px-2 py-1 rounded border border-yellow-200">
              Por favor, adicione documentos fonte primeiro.
            </span>
          )}
          <button
            type="button"
            onClick={handleValidate}
            disabled={isButtonDisabled}
            className={`ml-auto inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
              isButtonDisabled
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
            }`}
          >
            {isProcessing ? 'Processando...' : 'Validar Minuta'}
          </button>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-4 overflow-y-auto flex-1">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Resultados da Validação</h3>

          {serverError && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700 font-bold">Server Error</p>
                  <p className="text-sm text-red-600 mt-1">{serverError}</p>
                </div>
              </div>
            </div>
          )}

          {validationErrors === null && !serverError ? (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-center text-gray-500 text-sm">
              Aguardando validação...
            </div>
          ) : validationErrors && validationErrors.length === 0 ? (
            <div className="bg-green-50 border-l-4 border-green-500 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-green-700 font-bold">Sucesso!</p>
                  <p className="text-sm text-green-600 mt-1">Nenhuma divergência encontrada entre a minuta e os documentos fonte.</p>
                </div>
              </div>
            </div>
          ) : (
            validationErrors && validationErrors.length > 0 && (
              <div className="flex flex-col space-y-6">
                <div>
                  <div className="bg-red-50 border-l-4 border-red-500 p-3 mb-4">
                    <p className="text-sm text-red-700 font-bold">Ação Necessária: Divergências Encontradas</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {validationErrors.map((error, idx) => {
                      const isMissing = error.category === 'MISSING_FIELD';
                      const isUnmatched = error.category === 'UNMATCHED_ENTITY';

                      let cardColor = "border-red-200 bg-white";
                      let badgeColor = "bg-red-100 text-red-800";

                      if (isMissing) {
                        cardColor = "border-orange-200 bg-white";
                        badgeColor = "bg-orange-100 text-orange-800";
                      } else if (isUnmatched) {
                        cardColor = "border-purple-200 bg-white";
                        badgeColor = "bg-purple-100 text-purple-800";
                      }

                      const isResolved = resolvedErrors.has(error.field);

                      if (isResolved) return null;

                      return (
                        <div key={idx} className={`border rounded-lg shadow-sm p-4 ${cardColor}`}>
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeColor} mb-2`}>
                                {error.category.replace('_', ' ')}
                              </span>
                              <h4 className="text-sm font-bold text-gray-900 uppercase">
                                {error.field.replace(/^entities\[(\d+)\]\./, (_, p1) => `ENTIDADE ${parseInt(p1) + 1} - `).replace(/^document_metadata\./, 'METADADOS - ')}
                              </h4>
                            </div>
                          </div>

                          <p className="text-sm text-gray-600 mb-4">{error.message}</p>

                          <div className="bg-gray-50 rounded p-3 text-sm grid grid-cols-2 gap-4">
                            <div>
                              <span className="block text-xs font-medium text-gray-500 mb-1">O que está na minuta:</span>
                              {error.found ? (
                                <span className="text-red-700 font-mono break-all bg-red-50 px-1 rounded">{error.found}</span>
                              ) : (
                                <span className="text-gray-400 italic">Não encontrado</span>
                              )}
                            </div>
                            <div>
                              <span className="block text-xs font-medium text-gray-500 mb-1">O que deveria ser (Documento Fonte):</span>
                              {error.expected ? (
                                <span className="text-green-700 font-mono break-all bg-green-50 px-1 rounded">{error.expected}</span>
                              ) : (
                                <span className="text-gray-400 italic">-</span>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 flex justify-end space-x-3 border-t border-gray-100 pt-3">
                            {error.expected && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (error.expected) {
                                    navigator.clipboard.writeText(error.expected);
                                    alert('Valor copiado para a área de transferência!');
                                  }
                                }}
                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                              >
                                <svg className="-ml-0.5 mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Copiar Valor Correto
                              </button>
                            )}
                            <button
                                type="button"
                                onClick={() => handleMarkAsResolved(error)}
                                className="inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                              >
                                <svg className="-ml-0.5 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Marcar como Resolvido
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default DataChecker;
