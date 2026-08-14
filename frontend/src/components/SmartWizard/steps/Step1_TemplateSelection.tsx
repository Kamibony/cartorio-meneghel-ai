import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { db } from '../../../utils/firebase';
import { collection, query, getDocs, where } from 'firebase/firestore';

interface Template {
  id: string;
  name: string;
  required_tags: string[];
  roles_schema?: any[];
}

interface Props {
  selectedTemplateId: string;
  onSelectTemplate: (template: Template | null) => void;
  onNext: () => void;
}

const Step1_TemplateSelection: React.FC<Props> = ({ selectedTemplateId, onSelectTemplate, onNext }) => {
  const { cartorioId } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);

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
              roles_schema: data.roles_schema || [],
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

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tpl = templates.find(t => t.id === e.target.value) || null;
    onSelectTemplate(tpl);
  };

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Selecione o Template</h2>

      <div className="mb-4">
        <select
          value={selectedTemplateId}
          onChange={handleChange}
          className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm px-3 py-2 border"
        >
          <option value="">-- Selecione --</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="mt-auto pt-4 flex justify-end">
        <button
          onClick={onNext}
          disabled={!selectedTemplateId}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
        >
          Próximo
        </button>
      </div>
    </div>
  );
};

export default Step1_TemplateSelection;
