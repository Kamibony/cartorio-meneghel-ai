import React, { useState, useRef } from 'react';
import { useDocumentUpload } from '../hooks/useDocumentUpload';
import { ENV } from '../config/env';

// Type definitions for the expected API response
interface ValidationError {
  field: string;
  level: string;
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
  const [serverError, setServerError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadAndExtract, isUploading, isExtracting } = useDocumentUpload();

  const handleValidate = async () => {
    setIsValidating(true);
    setValidationErrors(null);
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

      const data: ValidationResponse = await response.json();

      if (!response.ok) {
        setServerError(data.error || 'Ocorreu um erro desconhecido durante a validação');
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

  const isButtonDisabled = isValidating || isUploading || isExtracting || !groundTruth || (inputType === 'upload' ? !draftFile : !typedText.trim());
  const isProcessing = isValidating || isUploading || isExtracting;

  const currentDraftText = inputType === 'upload' ? (cachedDraftText?.text || '') : typedText;

  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const generateCorrectedDraft = () => {
    if (!validationErrors || validationErrors.length === 0 || !currentDraftText) return currentDraftText;

    let corrected = currentDraftText;
    validationErrors.forEach((error) => {
      if (error.found && error.expected && error.found.trim() !== '') {
        const escapedFound = escapeRegExp(error.found);
        // Use word boundaries for strict matching to prevent substring collision bugs
        const regex = new RegExp(`\\b${escapedFound}\\b`, 'g');

        // If the regex matches, replace it. Otherwise fallback to simple replace to be safe
        // if no word boundaries exist around the substring.
        if (regex.test(corrected)) {
          corrected = corrected.replace(regex, error.expected);
        } else {
           corrected = corrected.split(error.found).join(error.expected);
        }
      }
    });
    return corrected;
  };

  const correctedText = generateCorrectedDraft();

  const handleCopyCorrected = () => {
    navigator.clipboard.writeText(correctedText).then(() => {
      // Optional: show a small toast or indication
      alert('Texto corrigido copiado para a área de transferência!');
    });
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
                  <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                            Campo
                          </th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            O que está na minuta
                          </th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            O que deveria ser
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {validationErrors.map((error, idx) => (
                          <tr key={idx}>
                            <td className="whitespace-normal break-words py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6 uppercase">
                              {error.field.replace(/^entities\[(\d+)\]\./, (_, p1) => `ENTIDADE ${parseInt(p1) + 1} - `).replace(/^document_metadata\./, 'METADADOS - ')}
                            </td>
                            <td className="whitespace-normal break-words px-3 py-4 text-sm">
                              {error.found ? (
                                <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                                  {error.found}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic">Não encontrado</span>
                              )}
                            </td>
                            <td className="whitespace-normal break-words px-3 py-4 text-sm">
                               {error.expected ? (
                                  <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                    {error.expected}
                                  </span>
                               ) : (
                                 <span className="text-gray-400 italic">-</span>
                               )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-700">Minuta Corrigida</h3>
                    <button
                      onClick={handleCopyCorrected}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      Copiar Texto Corrigido
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={correctedText}
                    className="w-full h-48 border border-gray-300 rounded-md shadow-sm p-3 bg-gray-50 focus:outline-none focus:ring-0 font-mono text-sm resize-none"
                  />
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
