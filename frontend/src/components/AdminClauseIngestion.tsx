import React, { useState } from 'react';
import { ingestRawClauses } from '../api/client';

const AdminClauseIngestion: React.FC = () => {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [status, setStatus] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setSelectedFiles(Array.from(e.target.files));
        }
    };

    const handleIngest = async () => {
        if (selectedFiles.length === 0) return;

        setIsLoading(true);
        setStatus('Iniciando...');
        setProgress({ current: 0, total: selectedFiles.length });

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            setStatus(`Processando arquivo ${i + 1} de ${selectedFiles.length}: ${file.name}...`);
            setProgress({ current: i + 1, total: selectedFiles.length });

            try {
                const text = await file.text();
                await ingestRawClauses(text);
                successCount++;
            } catch (error: any) {
                console.error(`Erro ao processar ${file.name}:`, error);
                errorCount++;
            }
        }

        setStatus(`Concluído! ${successCount} arquivo(s) processado(s) com sucesso. ${errorCount > 0 ? `${errorCount} erro(s).` : ''}`);
        setIsLoading(false);
        setProgress(null);
        setSelectedFiles([]);

        // Reset file input
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
    };

    return (
        <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Gestão de Cláusulas (Ingestão em Lote)</h2>
            <div className="mb-4">
                <input
                    id="file-upload"
                    type="file"
                    multiple
                    accept=".txt"
                    onChange={handleFileChange}
                    disabled={isLoading}
                    className="block w-full text-sm text-gray-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-blue-50 file:text-blue-700
                        hover:file:bg-blue-100"
                />
            </div>

            <button
                onClick={handleIngest}
                disabled={isLoading || selectedFiles.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
                {isLoading ? 'Processando Lote...' : `Ingerir ${selectedFiles.length} Arquivo(s)`}
            </button>

            {progress && (
                <div className="mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-1">Progresso: {progress.current} / {progress.total}</p>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                    </div>
                </div>
            )}

            {status && (
                <div className={`mt-4 p-3 rounded border ${status.includes('Concluído!') ? (status.includes('erro(s)') ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-green-50 border-green-200 text-green-800') : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                    <p className="text-sm break-words">{status}</p>
                </div>
            )}
        </div>
    );
};

export default AdminClauseIngestion;
