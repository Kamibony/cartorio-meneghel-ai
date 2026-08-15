import React, { useState } from 'react';
import { ingestRawClauses } from '../api/client';

const AdminClauseIngestion: React.FC = () => {
    const [rawText, setRawText] = useState('');
    const [status, setStatus] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleIngest = async () => {
        setIsLoading(true);
        setStatus('Processando...');
        try {
            const result = await ingestRawClauses(rawText);
            setStatus(`Sucesso: ${JSON.stringify(result)}`);
        } catch (error: any) {
            setStatus(`Erro: ${error.message || 'Erro desconhecido'}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Gestão de Cláusulas (Ingestão)</h2>
            <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Insira o texto legal aqui..."
                className="w-full h-64 p-3 border border-gray-300 rounded mb-4"
            />
            <button
                onClick={handleIngest}
                disabled={isLoading || !rawText.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
                {isLoading ? 'Processando...' : 'Ingerir Cláusulas'}
            </button>
            {status && (
                <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded">
                    <p className="text-sm text-gray-700 break-words">{status}</p>
                </div>
            )}
        </div>
    );
};

export default AdminClauseIngestion;
