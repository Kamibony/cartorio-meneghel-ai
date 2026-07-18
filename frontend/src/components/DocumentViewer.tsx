import React from 'react';

const DocumentViewer: React.FC = () => {
  return (
    <div className="h-full bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden flex flex-col">
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Scanned Document (Source of Truth)</h2>
        <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">Mock UI</span>
      </div>
      <div className="flex-1 p-6 bg-gray-50 flex items-center justify-center overflow-auto">
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
