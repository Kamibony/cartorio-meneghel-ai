import React, { useState, useRef } from 'react';
import { useDocumentUpload } from '../hooks/useDocumentUpload';

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

  const updateUnifiedGroundTruth = (currentFiles: UploadedFile[]) => {
    let unifiedData = {};
    currentFiles.forEach(f => {
      if (f.status === 'completed' && f.data) {
        unifiedData = { ...unifiedData, ...f.data };
      }
    });
    onDataExtracted(Object.keys(unifiedData).length > 0 ? unifiedData : null);
  };

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
      setFiles(prev => [...prev, ...newFiles]);
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
      updateUnifiedGroundTruth(newFiles);
      return newFiles;
    });
  };

  const updateFileType = (id: string, newType: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, documentType: newType } : f));
  };

  const processFile = async (id: string) => {
    const fileToProcess = files.find(f => f.id === id);
    if (!fileToProcess) return;

    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'uploading' } : f));

    // Simulating transition to extracting state after a short delay since our hook combines them
    setTimeout(() => {
        setFiles(prev => prev.map(f => f.id === id && f.status === 'uploading' ? { ...f, status: 'extracting' } : f));
    }, 1000);

    try {
      const extractedData = await uploadAndExtract(fileToProcess.file, fileToProcess.documentType);

      setFiles(prev => {
        const newFiles = prev.map(f =>
          f.id === id ? { ...f, status: 'completed', data: extractedData } : f
        );
        updateUnifiedGroundTruth(newFiles);
        return newFiles;
      });

    } catch (err: any) {
      setFiles(prev => prev.map(f =>
        f.id === id ? { ...f, status: 'error', error: err.message || 'Erro desconhecido' } : f
      ));
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

      <div className="flex-1 p-6 bg-gray-50 flex flex-col items-center justify-start overflow-auto relative">
        {/* Mock ID Card Container */}
        <div className="w-full max-w-md bg-white border border-gray-300 rounded-xl shadow-md p-6 relative">
          <div className="absolute top-0 left-0 w-full h-4 bg-green-700 rounded-t-xl"></div>

          <div className="text-center mb-6 mt-2 border-b-2 border-green-700 pb-2">
            <h3 className="font-bold text-gray-800 uppercase tracking-wide">República Federativa do Brasil</h3>
            <p className="text-xs text-gray-500 uppercase">Carteira de Identidade Nacional</p>
          </div>

          <div className="flex gap-6">
            <div className="w-1/3 flex flex-col items-center">
              <div className="w-full aspect-[3/4] bg-gray-200 rounded mb-2 border border-gray-300 flex items-center justify-center">
                <span className="text-gray-400 text-xs">Foto</span>
              </div>
              <div className="w-full h-12 bg-gray-200 rounded border border-gray-300 flex items-center justify-center">
                <span className="text-gray-400 text-[10px]">Assinatura</span>
              </div>
            </div>

            <div className="w-2/3 space-y-3">
              <div>
                <p className="text-[10px] text-gray-500 font-semibold uppercase">Nome</p>
                <p className="text-sm font-bold text-gray-900 border border-transparent hover:border-blue-300 hover:bg-blue-50 cursor-crosshair rounded px-1 -ml-1">JOAO DA SILVA</p>
              </div>

              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase">CPF</p>
                  <p className="text-sm font-bold text-gray-900 border border-transparent hover:border-blue-300 hover:bg-blue-50 cursor-crosshair rounded px-1 -ml-1">702.478.934-47</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase">RG</p>
                  <p className="text-sm font-bold text-gray-900 border border-transparent hover:border-blue-300 hover:bg-blue-50 cursor-crosshair rounded px-1 -ml-1">4054425</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-gray-500 font-semibold uppercase">Filiação</p>
                <div className="border border-transparent hover:border-blue-300 hover:bg-blue-50 cursor-crosshair rounded px-1 -ml-1">
                  <p className="text-sm font-bold text-gray-900">CARLOS DA SILVA</p>
                  <p className="text-sm font-bold text-gray-900">CAMILA FIGUEIREDO ROCHA</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase">Data de Nascimento</p>
                  <p className="text-sm font-bold text-gray-900 border border-transparent hover:border-blue-300 hover:bg-blue-50 cursor-crosshair rounded px-1 -ml-1">15/05/1985</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase">Naturalidade</p>
                  <p className="text-sm font-bold text-gray-900 border border-transparent hover:border-blue-300 hover:bg-blue-50 cursor-crosshair rounded px-1 -ml-1">SÃO PAULO - SP</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-400 italic">This is a mock representation of a scanned document. In production, this would render an image with bounding box overlays from Document AI.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentViewer;
