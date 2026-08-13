import React, { useRef } from 'react';

interface ManualDraftInputProps {
  inputType: 'upload' | 'typing';
  setInputType: (type: 'upload' | 'typing') => void;
  typedText: string;
  setTypedText: (text: string) => void;
  draftFile: File | null;
  setDraftFile: (file: File | null) => void;
  isValidating: boolean;
}

const ManualDraftInput: React.FC<ManualDraftInputProps> = ({
  inputType,
  setInputType,
  typedText,
  setTypedText,
  draftFile,
  setDraftFile,
  isValidating
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex justify-between items-center mb-4">
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
          className="w-full flex-1 border border-gray-300 rounded-md shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm"
          placeholder="Digite ou cole o texto do documento aqui..."
          disabled={isValidating}
        />
      )}
    </div>
  );
};

export default ManualDraftInput;
