import React, { useState, useRef, useEffect } from 'react';
import { useDocumentUpload } from '../hooks/useDocumentUpload';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface DocumentViewerProps {
  onDataExtracted: (data: any) => void;
}

interface UploadedFile {
  file: File;
  status: 'pending' | 'uploading' | 'extracting' | 'completed' | 'error';
  documentType: string;
  data?: any;
  error?: string;
  id: string;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ onDataExtracted }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const { uploadAndExtract } = useDocumentUpload();
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [objectUrls, setObjectUrls] = useState<Record<string, string>>({});

  // Use a ref to keep track of the latest URLs for the unmount cleanup
  const objectUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    objectUrlsRef.current = objectUrls;
  }, [objectUrls]);

  // Cleanup object URLs when component unmounts
  useEffect(() => {
    return () => {
      Object.values(objectUrlsRef.current).forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  useEffect(() => {
    const hasErrors = files.some(f => f.status === 'error');
    if (hasErrors) {
      onDataExtracted(null);
      setGlobalError("Atenção: A extração falhou para um ou mais documentos. Por favor, resolva os erros antes de prosseguir com a validação.");
      return;
    }
    setGlobalError(null);

    const unifiedData: any = {};
    const mergedEntities: any[] = [];

    const isNameCompatible = (n1: string, n2: string) => {
        if (!n1 || !n2) return false;
        const norm1 = String(n1).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
        const norm2 = String(n2).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();

        const stopwords = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
        const t1 = norm1.split(' ').filter(w => !stopwords.has(w));
        const t2 = norm2.split(' ').filter(w => !stopwords.has(w));

        if (t1.length > 0 && t2.length > 0) {
            const isSubset1 = t1.every(w => t2.includes(w));
            const isSubset2 = t2.every(w => t1.includes(w));
            if (isSubset1 || isSubset2) return true;
        }
        return false;
    };

    files.forEach(f => {
      if (f.status === 'completed' && f.data) {
        if (f.data.entities && Array.isArray(f.data.entities)) {
          f.data.entities.forEach((entity: any) => {
            const newEntity = { ...entity, _source_document_type: f.documentType };
            const incomingCpf = String(newEntity.cpf || newEntity.cpf_requerente || '').replace(/[^\d]/g, '');
            const incomingName = newEntity.nome || newEntity.nome_requerente || '';
            const incomingIsCertidao = String(f.documentType || '').toLowerCase().includes('certidao') || String(f.documentType || '').toLowerCase().includes('certidão');

            let matchedIdx = -1;
            for (let i = 0; i < mergedEntities.length; i++) {
                const existing = mergedEntities[i];
                const existingCpf = String(existing.cpf || existing.cpf_requerente || '').replace(/[^\d]/g, '');
                const existingName = existing.nome || existing.nome_requerente || '';

                if (incomingCpf && existingCpf && incomingCpf === existingCpf) {
                    matchedIdx = i;
                    break;
                }

                if ((!incomingCpf || !existingCpf) && incomingName && existingName) {
                    if (isNameCompatible(incomingName, existingName)) {
                        const mae1 = newEntity.filiacao_mae || '';
                        const mae2 = existing.filiacao_mae || '';
                        if (mae1 && mae2) {
                             if (isNameCompatible(mae1, mae2)) {
                                 matchedIdx = i;
                                 break;
                             }
                        } else {
                            matchedIdx = i;
                            break;
                        }
                    }
                }
            }

            if (matchedIdx === -1) {
                // If it has at least a CPF or a Name, add it
                if (incomingCpf || incomingName) {
                    mergedEntities.push({ ...newEntity });
                }
            } else {
                const existing = mergedEntities[matchedIdx];
                const existingIsCertidao = String(existing._source_document_type || '').toLowerCase().includes('certidao') || String(existing._source_document_type || '').toLowerCase().includes('certidão');

                const forceOverwrite = incomingIsCertidao && !existingIsCertidao;
                const protectExisting = existingIsCertidao && !incomingIsCertidao;

                for (const key of Object.keys(newEntity)) {
                    const v = newEntity[key];
                    if (v !== null && v !== undefined && v !== '') {
                        const skipKeys = ['_source_document_type', 'sources', 'has_marriage_certificate', '_conflicts', '_resolved_conflicts'];
                        if (!skipKeys.includes(key)) {
                            const existingVal = existing[key];
                            if (existingVal !== null && existingVal !== undefined && existingVal !== '') {
                                const normV = String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                                const normE = String(existingVal).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

                                if (normV !== normE && (key !== 'nome' || (key === 'nome' && !normV.includes(normE) && !normE.includes(normV)))) {
                                    if (!existing._conflicts) existing._conflicts = {};
                                    if (!existing._conflicts[key]) {
                                        existing._conflicts[key] = {
                                            options: [
                                                { value: existingVal, source: existing._source_document_type },
                                                { value: v, source: f.documentType }
                                            ]
                                        };
                                    } else {
                                        // add if not present
                                        const found = existing._conflicts[key].options.some((opt: any) => opt.value === v);
                                        if (!found) {
                                            existing._conflicts[key].options.push({ value: v, source: f.documentType });
                                        }
                                    }
                                }
                            }
                        }

                        if (forceOverwrite) {
                            existing[key] = v;
                        } else if (protectExisting) {
                            if (existing[key] === null || existing[key] === undefined || existing[key] === '') {
                                existing[key] = v;
                            }
                        } else {
                            if (key === 'nome' && existing.nome) {
                                if (String(v).length > String(existing.nome).length) {
                                    existing[key] = v;
                                }
                            } else {
                                existing[key] = v;
                            }
                        }
                    }
                }

                if (incomingIsCertidao) {
                    existing._source_document_type = 'Certidão (Merged)';
                }
                if (newEntity.has_marriage_certificate) {
                     existing.has_marriage_certificate = true;
                }
            }
          });
        }

        for (const key in f.data) {
          if (key !== 'entities') {
            unifiedData[key] = f.data[key];
          }
        }
      }
    });

    for (const existing of mergedEntities) {
        if (existing.has_marriage_certificate) {
            // Apply domain logic override if it doesn't have an explicit user resolution
            if (!existing._resolved_conflicts || !existing._resolved_conflicts.includes('estado_civil')) {
                if (existing.estado_civil && existing.estado_civil !== 'Casado(a)') {
                     if (!existing._conflicts) existing._conflicts = {};
                     if (!existing._conflicts['estado_civil']) {
                         existing._conflicts['estado_civil'] = {
                             options: [
                                 { value: existing.estado_civil, source: existing._source_document_type },
                                 { value: 'Casado(a)', source: 'Certidão de Casamento' }
                             ]
                         };
                     }
                }
                existing.estado_civil = 'Casado(a)';
            }
        }
    }

    if (mergedEntities.length > 0) {
        unifiedData.entities = mergedEntities;
    }

    onDataExtracted(Object.keys(unifiedData).length > 0 ? unifiedData : null);
  }, [files, onDataExtracted]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map(file => {
        // Guess document type based on filename, default to CNH
        const lowerName = file.name.toLowerCase();
        let docType = 'CNH';
        if (lowerName.includes('rg')) docType = 'RG';
        else if (lowerName.includes('certidao') || lowerName.includes('certidão')) docType = 'CERTIDAO';
        else if (lowerName.includes('iptu')) docType = 'IPTU';

        return {
          file,
          status: 'pending' as const,
          documentType: docType,
          id: Math.random().toString(36).substring(7)
        };
      });

      // Generate object URLs for the new files
      const newUrls: Record<string, string> = {};
      newFiles.forEach((f) => {
        newUrls[f.id] = URL.createObjectURL(f.file);
      });

      setObjectUrls((prev) => ({ ...prev, ...newUrls }));
      setFiles(prev => {
        const updated = [...prev, ...newFiles];
        // Select the first file if none is selected
        if (!selectedFileId && updated.length > 0) {
          setSelectedFileId(updated[0].id);
        }
        return updated;
      });
      setGlobalError(null);
    }
    // reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => {
      const newFiles = prev.filter(f => f.id !== id);

      // If the removed file was selected, select another one or null
      if (selectedFileId === id) {
        setSelectedFileId(newFiles.length > 0 ? newFiles[0].id : null);
      }
      return newFiles;
    });

    setObjectUrls(prev => {
      const newUrls = { ...prev };
      if (newUrls[id]) {
        URL.revokeObjectURL(newUrls[id]);
        delete newUrls[id];
      }
      return newUrls;
    });
  };

  const updateFileType = (id: string, newType: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, documentType: newType } : f));
  };

  const processFile = async (id: string) => {
    const fileToProcess = files.find(f => f.id === id);
    if (!fileToProcess) return;

    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'uploading' as const } : f));

    // Simulating transition to extracting state after a short delay since our hook combines them
    setTimeout(() => {
        setFiles(prev => prev.map(f => f.id === id && f.status === 'uploading' ? { ...f, status: 'extracting' as const } : f));
    }, 1000);

    try {
      const extractedData = await uploadAndExtract(fileToProcess.file, fileToProcess.documentType);

      setFiles(prev => {
        const newFiles = prev.map(f =>
          f.id === id ? { ...f, status: 'completed' as const, data: extractedData } : f
        );
        return newFiles;
      });

    } catch (err: any) {
      setFiles(prev => {
        const newFiles = prev.map(f =>
          f.id === id ? { ...f, status: 'error' as const, error: err.message || 'Erro desconhecido' } : f
        );
        return newFiles;
      });
    }
  };

  const isAnyProcessing = files.some(f => f.status === 'uploading' || f.status === 'extracting');

  return (
    <div className="h-full bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden flex flex-col">
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Documentos Fonte (Verdade Terrestre)</h2>
        {isAnyProcessing ? (
          <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded flex items-center">
            <svg className="animate-spin h-3 w-3 mr-1 text-yellow-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processando...
          </span>
        ) : (
          <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">Pronto</span>
        )}
      </div>
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Adicionar Documentos
          </button>
        </div>

        {files.length > 0 && (
          <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
            {files.map(fileObj => (
              <div key={fileObj.id} className="flex items-center justify-between bg-white p-2 border border-gray-200 rounded text-sm">
                <div className="flex items-center gap-2 max-w-[250px]">
                  <span className="truncate max-w-[150px]" title={fileObj.file.name}>{fileObj.file.name}</span>
                  {fileObj.status === 'pending' && (
                    <select
                      value={fileObj.documentType}
                      onChange={(e) => updateFileType(fileObj.id, e.target.value)}
                      className="text-xs border-gray-300 rounded p-1"
                    >
                      <option value="CNH">CNH</option>
                      <option value="RG">RG</option>
                      <option value="CERTIDAO">Certidão</option>
                      <option value="IPTU">IPTU</option>
                    </select>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {fileObj.status === 'pending' && (
                     <button onClick={() => processFile(fileObj.id)} className="text-blue-600 hover:text-blue-800 font-medium">Extrair</button>
                  )}
                  {fileObj.status === 'uploading' && <span className="text-yellow-600">Enviando...</span>}
                  {fileObj.status === 'extracting' && <span className="text-yellow-600">Extraindo...</span>}
                  {fileObj.status === 'completed' && <span className="text-green-600 font-medium">Concluído</span>}
                  {fileObj.status === 'error' && <span className="text-red-600" title={fileObj.error}>Erro</span>}
                  <button onClick={() => removeFile(fileObj.id)} className="text-gray-400 hover:text-red-500 ml-2" title="Remover">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {globalError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <p className="text-sm text-red-600">{globalError}</p>
        </div>
      )}

      {files.length > 0 && (
        <div className="bg-gray-100 border-b border-gray-200 px-4 py-2 flex gap-2 overflow-x-auto">
          {files.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFileId(f.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                selectedFileId === f.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {f.documentType} - <span className="text-xs opacity-80">{f.file.name.substring(0, 10)}...</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 bg-gray-50 flex flex-col items-center justify-center overflow-hidden relative p-4">
        {selectedFileId && objectUrls[selectedFileId] ? (
          (() => {
            const selectedFile = files.find(f => f.id === selectedFileId);
            const isPdf = selectedFile?.file.type === 'application/pdf';
            const url = objectUrls[selectedFileId];

            if (isPdf) {
              return (
                <div className="w-full h-full border border-gray-300 rounded shadow-sm bg-white overflow-hidden">
                  <object data={url} type="application/pdf" className="w-full h-full">
                    <p>Seu navegador não suporta a visualização de PDFs. <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Baixar PDF</a></p>
                  </object>
                </div>
              );
            }

            return (
              <div className="w-full h-full border border-gray-300 rounded shadow-sm bg-white overflow-hidden relative">
                <TransformWrapper
                  initialScale={1}
                  minScale={0.5}
                  maxScale={5}
                  centerOnInit={true}
                  wheel={{ step: 0.1 }}
                >
                  {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-white/80 backdrop-blur-sm p-1.5 rounded-lg shadow-md border border-gray-200">
                        <button onClick={() => zoomIn()} className="p-1.5 hover:bg-gray-100 rounded text-gray-700" title="Zoom In">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                        </button>
                        <button onClick={() => zoomOut()} className="p-1.5 hover:bg-gray-100 rounded text-gray-700" title="Zoom Out">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" /></svg>
                        </button>
                        <button onClick={() => resetTransform()} className="p-1.5 hover:bg-gray-100 rounded text-gray-700" title="Reset Zoom">
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        </button>
                      </div>
                      <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                        <img
                          src={url}
                          alt="Document Preview"
                          className="max-w-full max-h-full object-contain"
                          draggable={false}
                        />
                      </TransformComponent>
                    </>
                  )}
                </TransformWrapper>
              </div>
            );
          })()
        ) : (
          <div className="text-gray-400 text-sm flex flex-col items-center">
            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            Nenhum documento selecionado para visualização
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;
