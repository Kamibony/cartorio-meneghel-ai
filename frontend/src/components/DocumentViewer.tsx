import React, { useState, useRef, useEffect } from 'react';
import { useDocumentUpload } from '../hooks/useDocumentUpload';
import { useAuditLog } from '../hooks/useAuditLog';

interface DocumentViewerProps {
  onDataExtracted: (data: any) => void;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ onDataExtracted }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { uploadAndExtract, isUploading, isExtracting, error } = useDocumentUpload();
  const { logAuditEvent, isLogging, logError, logSuccess } = useAuditLog();
  const [unreadableMarked, setUnreadableMarked] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setUnreadableMarked(false); // Reset mark when a new file is selected
    }
  };

  const handleMarkAsUnreadable = () => {
    if (selectedFile && !unreadableMarked) {
      logAuditEvent(selectedFile.name, true);
    }
  };

  useEffect(() => {
    if (logSuccess) {
      setUnreadableMarked(true);
    }
  }, [logSuccess]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    const extractedData = await uploadAndExtract(selectedFile);
    if (extractedData) {
      onDataExtracted(extractedData);
    }
  };

  return (
    <div className="h-full bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden flex flex-col">
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Scanned Document (Source of Truth)</h2>
        {isExtracting ? (
          <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded flex items-center">
            <svg className="animate-spin h-3 w-3 mr-1 text-yellow-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Lendo documento...
          </span>
        ) : (
          <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">Live UI</span>
        )}
      </div>
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-4">
        <input
          type="file"
          accept="image/*,application/pdf"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isExtracting}
          className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Select File
        </button>
        <span className="text-sm text-gray-600 truncate max-w-xs">
          {selectedFile ? selectedFile.name : 'No file selected'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {selectedFile && (
            <button
              onClick={handleMarkAsUnreadable}
              disabled={isLogging || unreadableMarked || isUploading || isExtracting}
              className="px-4 py-2 bg-red-100 border border-transparent rounded-md shadow-sm text-sm font-medium text-red-700 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isLogging ? 'Marcando...' : (unreadableMarked ? 'Marcado como Ilegível' : 'Marcar como Ilegível')}
            </button>
          )}
          <button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading || isExtracting}
            className="px-4 py-2 bg-blue-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isUploading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Uploading...
              </>
            ) : 'Upload & Extract'}
          </button>
        </div>
      </div>
      {(error || logError) && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <p className="text-sm text-red-600">{error || logError}</p>
        </div>
      )}
      {unreadableMarked && !logError && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
          <p className="text-sm text-yellow-700">Documento marcado como ilegível e reportado com sucesso.</p>
        </div>
      )}
      <div className="flex-1 p-6 bg-gray-50 flex items-center justify-center overflow-auto relative">
        {(isUploading || isExtracting) && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <svg className="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-700 font-medium">{isExtracting ? 'Extraindo dados com IA...' : 'Fazendo upload...'}</p>
            {isExtracting && <p className="text-sm text-gray-500 mt-2">Isso pode levar alguns segundos dependendo do documento.</p>}
          </div>
        )}
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
