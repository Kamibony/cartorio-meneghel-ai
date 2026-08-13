import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../utils/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { ENV } from '../config/env';

interface Template {
  id: string;
  name: string;
  required_tags: string[];
}

interface TemplateGeneratorInputProps {
  groundTruth: any;
  onGenerated: (text: string) => void;
  onValidationComplete?: () => void;
}

const TemplateGeneratorInput: React.FC<TemplateGeneratorInputProps> = ({ groundTruth, onGenerated }) => {
  const { cartorioId } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      if (!cartorioId) return;
      try {
        const q = query(
          collection(db, 'templates'),
          where('cartorio_id', 'in', [cartorioId, 'SYSTEM'])
        );
        const snapshot = await getDocs(q);
        const tpls: Template[] = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data.cartorio_id === cartorioId || data.cartorio_id === 'SYSTEM') {
            tpls.push({
              id: doc.id,
              name: data.name,
              required_tags: data.required_tags || [],
            });
          }
        });
        setTemplates(tpls);
      } catch (err) {
        console.error("Failed to fetch templates:", err);
      }
    };
    fetchTemplates();
  }, [cartorioId]);

  useEffect(() => {
    // Auto-map groundTruth to formData when template changes or groundTruth changes
    if (selectedTemplateId && groundTruth) {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (template) {
        const sourceData = groundTruth.human_final_data || groundTruth.ai_extracted_data || groundTruth;
        const newFormData: Record<string, string> = {};

        template.required_tags.forEach(tag => {
          if (tag in sourceData) {
            newFormData[tag] = typeof sourceData[tag] === 'string'
              ? sourceData[tag]
              : JSON.stringify(sourceData[tag], null, 2);
          } else if (tag === 'dados_brutos' || tag === 'contexto') {
            newFormData[tag] = JSON.stringify(sourceData, null, 2);
          } else {
            newFormData[tag] = `[JSON Contexto Disponível: ${JSON.stringify(sourceData, null, 2)}]`;
          }
        });

        setFormData(newFormData);
      }
    }
  }, [selectedTemplateId, groundTruth, templates]);

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedTemplateId(val);
    if (!val) {
      setFormData({});
    }
  };

  const handleInputChange = (tag: string, value: string) => {
    setFormData(prev => ({ ...prev, [tag]: value }));
  };

  const handleGenerate = async () => {
    if (!selectedTemplateId || !cartorioId) return;
    setIsGenerating(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Não autenticado.");
      const token = await user.getIdToken();

      const response = await fetch(`${ENV.apiUrl}/generate_document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          data: {
            cartorio_id: cartorioId,
            template_id: selectedTemplateId,
            verified_data: formData,
            draft_id: groundTruth?.document_id || null,
            // Since we are taking from in-memory groundTruth (which is basically draft), we could use updatedAt, but
            // for the new workflow where everything is in memory/synced, optimistic concurrency is less of an issue here
            // unless we strictly want to prevent generation if the db changed. We will pass null for imported_at for now,
            // or we could fetch the latest updated_at from the groundTruth object if it's there.
            imported_at: groundTruth?.updatedAt ? {
                 _seconds: groundTruth.updatedAt.seconds,
                 _nanoseconds: groundTruth.updatedAt.nanoseconds
             } : null
          }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || "Erro ao gerar minuta.");
      }

      const result = await response.json();
      if (result.result?.status === 'success' && result.result?.file_base64) {
          if (result.result.plain_text) {
              onGenerated(result.result.plain_text);
          } else {
              throw new Error("O servidor não retornou o texto extraído da minuta (plain_text).");
          }

          // Also trigger download of the .docx
          const base64Data = result.result.file_base64;
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `minuta_${Date.now()}.docx`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
      } else {
          throw new Error("Resposta inválida do servidor.");
      }

    } catch (err: any) {
      console.error("Generate error", err);
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div className="flex flex-col h-full bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Gerar Minuta a partir de Template</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Selecione o Template</label>
        <select
          value={selectedTemplateId}
          onChange={handleTemplateChange}
          className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm px-3 py-2 border"
        >
          <option value="">-- Selecione --</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {selectedTemplate && (
        <div className="flex-1 overflow-y-auto pr-2">
           <h3 className="text-sm font-medium text-gray-800 mb-3">Preencha os Campos do Template</h3>
           <div className="grid grid-cols-1 gap-3">
              {selectedTemplate.required_tags.map(tag => (
                 <div key={tag}>
                     <label className="block text-xs font-medium text-gray-700 mb-1 capitalize">{tag.replace(/_/g, ' ')}</label>
                     {tag.toLowerCase().startsWith('valor_') || tag.toLowerCase().includes('emolumentos') ? (
                         <input
                            type="text"
                            value={formData[tag] || ''}
                            onChange={(e) => handleInputChange(tag, e.target.value)}
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 text-xs px-2 py-1.5 border border-green-300 bg-green-50"
                            placeholder={`Valor exato para ${tag}`}
                         />
                     ) : (
                         <textarea
                            value={formData[tag] || ''}
                            onChange={(e) => handleInputChange(tag, e.target.value)}
                            rows={2}
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-xs px-2 py-1.5 border"
                            placeholder={`Descreva os dados para: ${tag}`}
                         />
                     )}
                 </div>
              ))}
           </div>
        </div>
      )}

      {error && <div className="text-red-600 text-xs mt-2">{error}</div>}

      <div className="pt-4 flex justify-end shrink-0 border-t border-gray-200 mt-4">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedTemplateId}
            className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded hover:bg-green-700 disabled:bg-green-400 shadow-sm transition-colors"
          >
              {isGenerating ? 'Gerando...' : 'Gerar Minuta'}
          </button>
      </div>
    </div>
  );
};

export default TemplateGeneratorInput;
