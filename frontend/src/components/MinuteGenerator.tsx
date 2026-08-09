import React, { useState, useEffect } from 'react';
import { useCartorio } from '../hooks/useCartorio';
import { auth, db } from '../utils/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { ENV } from '../config/env';

interface Template {
  id: string;
  name: string;
  required_tags: string[];
}

const MinuteGenerator: React.FC = () => {
  const { cartorioId } = useCartorio();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState(''); // ID to import data from

  useEffect(() => {
    const fetchTemplates = async () => {
      if (!cartorioId) return;
      try {
        const q = query(
          collection(db, 'cartorios', cartorioId, 'templates'),
          where('is_active', '==', true)
        );
        const snapshot = await getDocs(q);
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Template));
        setTemplates(fetched);
      } catch (err) {
        console.error("Failed to fetch templates:", err);
      }
    };
    fetchTemplates();
  }, [cartorioId]);

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedTemplateId(id);

    // Initialize form data with required tags
    const template = templates.find(t => t.id === id);
    if (template) {
      const initialData: Record<string, string> = {};
      template.required_tags.forEach(tag => {
        initialData[tag] = '';
      });
      setFormData(initialData);
    } else {
      setFormData({});
    }
  };

  const handleInputChange = (tag: string, value: string) => {
    setFormData(prev => ({ ...prev, [tag]: value }));
  };

  const handleImportData = async () => {
     if (!draftId.trim() || !cartorioId) return;
     try {
         // In a real scenario, this might need to map specific fields,
         // but for now we'll fetch the minuta and try to match keys if they exist in human_final_data.
         // Or simply serialize the whole human_final_data and push to a 'dados_brutos' tag if one exists.
         // Let's implement a simple direct map for demonstration.
         const q = query(collection(db, 'minutas'), where('__name__', '==', draftId)); // Need to query global minutas or specific? minutas are at root.
         const snapshot = await getDocs(q);
         if (snapshot.empty) {
             setError("Minuta não encontrada.");
             return;
         }
         const minutaData = snapshot.docs[0].data();
         if (minutaData.cartorio_id !== cartorioId) {
             setError("Minuta não pertence a este cartório.");
             return;
         }

         const sourceData = minutaData.human_final_data || minutaData.ai_extracted_data || {};

         // Perform exact mapping if keys match, otherwise serialize into a structured string context
         const newFormData = { ...formData };

         // Map arrays (like multiple entities) into clear structural strings for the LLM
         // If a tag strictly exists in sourceData, inject it directly.
         Object.keys(newFormData).forEach(tag => {
             if (tag in sourceData) {
                 newFormData[tag] = typeof sourceData[tag] === 'string'
                    ? sourceData[tag]
                    : JSON.stringify(sourceData[tag], null, 2);
             } else if (tag === 'dados_brutos' || tag === 'contexto') {
                 // Fallback catch-all tag if the template expects full JSON context
                 newFormData[tag] = JSON.stringify(sourceData, null, 2);
             }
         });

         // Set any missing fields to a serialized view of the full data so the LLM can resolve them
         Object.keys(newFormData).forEach(tag => {
             if (!newFormData[tag]) {
                 newFormData[tag] = `[JSON Contexto Disponível: ${JSON.stringify(sourceData, null, 2)}]`;
             }
         });

         setFormData(newFormData);
         setError(null);
         // Provide visual feedback without an alert
         const importBtn = document.getElementById('import-btn');
         if (importBtn) {
             const originalText = importBtn.innerText;
             importBtn.innerText = "Sucesso!";
             importBtn.classList.add('bg-green-600', 'hover:bg-green-700');
             setTimeout(() => {
                 importBtn.innerText = originalText;
                 importBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
             }, 2000);
         }

     } catch (err) {
         console.error("Erro ao importar", err);
         setError("Erro ao importar dados. Verifique o ID da minuta e as permissões.");
     }
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
             verified_data: formData
          }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || "Erro ao gerar minuta.");
      }

      const result = await response.json();
      if (result.result?.status === 'success' && result.result?.file_base64) {
          // Trigger download
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-4xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-6">Gerador de Minutas</h2>

      <div className="mb-6">
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
        <div className="space-y-6">
           <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 flex items-end gap-4">
               <div className="flex-1">
                   <label className="block text-sm font-medium text-blue-900 mb-1">Importar Dados Validados (ID da Minuta)</label>
                   <input
                     type="text"
                     value={draftId}
                     onChange={(e) => setDraftId(e.target.value)}
                     className="w-full border-blue-200 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm px-3 py-2 border"
                     placeholder="Ex: abc123def456"
                   />
               </div>
               <button
                  id="import-btn"
                  onClick={handleImportData}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors"
               >
                   Importar
               </button>
           </div>

           <div className="border-t border-gray-200 pt-6">
             <h3 className="text-lg font-medium text-gray-800 mb-4">Preencha os Campos do Template</h3>
             <div className="grid grid-cols-1 gap-4">
                {selectedTemplate.required_tags.map(tag => (
                   <div key={tag}>
                       <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{tag.replace(/_/g, ' ')}</label>
                       {tag.toLowerCase().startsWith('valor_') || tag.toLowerCase().includes('emolumentos') ? (
                           <input
                              type="text"
                              value={formData[tag] || ''}
                              onChange={(e) => handleInputChange(tag, e.target.value)}
                              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm px-3 py-2 border border-green-300 bg-green-50"
                              placeholder={`Valor exato para ${tag} (Não será alterado pela IA)`}
                           />
                       ) : (
                           <textarea
                              value={formData[tag] || ''}
                              onChange={(e) => handleInputChange(tag, e.target.value)}
                              rows={3}
                              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm px-3 py-2 border"
                              placeholder={`Descreva os dados para: ${tag}`}
                           />
                       )}
                   </div>
                ))}
             </div>
           </div>

           {error && <div className="text-red-600 text-sm mt-2">{error}</div>}

           <div className="pt-4 flex justify-end">
               <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-green-400 shadow-md transition-colors"
               >
                   {isGenerating ? 'Gerando Minuta...' : 'Gerar Minuta (.docx)'}
               </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default MinuteGenerator;
