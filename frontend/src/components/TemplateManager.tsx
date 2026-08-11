import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../utils/firebase';
import { collection, query, getDocs, doc, updateDoc, where } from 'firebase/firestore';
import { ENV } from '../config/env';

interface Template {
  id: string;
  name: string;
  document_type: string;
  gcs_path: string;
  required_tags: string[];
  created_by: string;
  created_at: any;
  is_active: boolean;
}

interface TemplateManagerProps {
  injectedCartorioId?: string;
}

const TemplateManager: React.FC<TemplateManagerProps> = ({ injectedCartorioId }) => {
  const { cartorioId: authCartorioId, userRole, isLoading: isAuthLoading } = useAuth();
  const cartorioId = injectedCartorioId || authCartorioId;
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadType, setUploadType] = useState('compra_venda');
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const fetchTemplates = async () => {
    if (isAuthLoading || (!cartorioId && userRole !== 'super_admin')) return;
    setIsLoading(true);
    setError(null);
    try {
      let q;
      if (userRole === 'super_admin' && !injectedCartorioId) {
        q = query(collection(db, 'templates'));
      } else {
        q = query(
          collection(db, 'templates'),
          where('cartorio_id', 'in', [cartorioId, 'SYSTEM'])
        );
      }
      const querySnapshot = await getDocs(q);
      const fetchedTemplates: Template[] = [];
      querySnapshot.forEach((doc) => {
        fetchedTemplates.push({ id: doc.id, ...doc.data() } as Template);
      });
      setTemplates(fetchedTemplates);
    } catch (err: any) {
      console.error("Error fetching templates:", err);
      setError("Falha ao carregar templates.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [cartorioId]);

  const handleUpload = async () => {
    if (!fileInputRef.current?.files?.length) {
      setError("Por favor, selecione um arquivo .docx.");
      return;
    }
    const file = fileInputRef.current.files[0];
    if (!file.name.endsWith('.docx')) {
      setError("O arquivo deve ser um .docx.");
      return;
    }
    if (!uploadName.trim()) {
      setError("Por favor, insira um nome para o template.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadSuccess(null);

    try {
      // 1. Upload to GCS using Signed URL approach or direct Firebase Storage
      // We will use standard Firebase Storage via REST API for simplicity, matching the upload logic if any,
      // or using the upload_document endpoint. We'll use a direct fetch to the storage bucket API or
      // better yet, a standard fetch to our backend to handle the upload.
      // Wait, there is no direct file upload endpoint, but we can use Firebase Storage SDK directly.
      const { getStorage, ref, uploadBytes } = await import('firebase/storage');
      const storage = getStorage();
      const uploadCartorioId = (userRole === 'super_admin' && !injectedCartorioId) ? 'SYSTEM' : cartorioId;

      const storagePath = uploadCartorioId === 'SYSTEM'
          ? `system/templates/${file.name}`
          : `cartorios/${uploadCartorioId}/templates/${file.name}`;

      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, file);

      // 2. Call register_template function
      const user = auth.currentUser;
      if (!user) throw new Error("Usuário não autenticado");
      const token = await user.getIdToken();

      const response = await fetch(`${ENV.apiUrl}/register_template`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          data: {
             cartorio_id: uploadCartorioId,
             gcs_path: storagePath,
             name: uploadName,
             document_type: uploadType,
             created_by: user.uid
          }
        })
      });

      if (!response.ok) {
         const errData = await response.json().catch(() => ({}));
         throw new Error(errData.error?.message || `Erro do servidor: ${response.status}`);
      }

      setUploadSuccess("Template registrado com sucesso!");
      setUploadName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchTemplates();

    } catch (err: any) {
      console.error("Error uploading template:", err);
      setError(`Falha no upload: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleActive = async (templateId: string, currentStatus: boolean) => {
    if (!cartorioId && userRole !== 'super_admin') return;
    try {
      const templateRef = doc(db, 'templates', templateId);
      await updateDoc(templateRef, { is_active: !currentStatus });
      fetchTemplates();
    } catch (err) {
      console.error("Error toggling template status", err);
      setError("Falha ao atualizar status do template.");
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-6">Gerenciamento de Templates</h2>

      {/* Upload Section */}
      <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Novo Template</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Template</label>
             <input
               type="text"
               value={uploadName}
               onChange={(e) => setUploadName(e.target.value)}
               className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm px-3 py-2 border"
               placeholder="Ex: Compra e Venda Padrão"
             />
          </div>
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Documento</label>
             <select
               value={uploadType}
               onChange={(e) => setUploadType(e.target.value)}
               className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm px-3 py-2 border"
             >
               <option value="compra_venda">Compra e Venda</option>
               <option value="procuracao">Procuração</option>
               <option value="doacao">Doação</option>
               <option value="inventario">Inventário</option>
             </select>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <input
            type="file"
            ref={fileInputRef}
            accept=".docx"
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400 whitespace-nowrap font-medium"
          >
            {isUploading ? 'Enviando...' : 'Fazer Upload'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {uploadSuccess && <p className="mt-2 text-sm text-green-600">{uploadSuccess}</p>}
      </div>

      {/* Templates List */}
      <h3 className="text-lg font-semibold text-gray-700 mb-4">Templates Registrados</h3>
      {isLoading ? (
        <p className="text-gray-500">Carregando templates...</p>
      ) : templates.length === 0 ? (
        <p className="text-gray-500">Nenhum template registrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tags Encontradas</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {templates.map((template) => (
                <tr key={template.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{template.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{template.document_type}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div className="flex flex-wrap gap-1">
                      {template.required_tags.map(tag => (
                         <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                           {tag}
                         </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${template.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {template.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleToggleActive(template.id, template.is_active)}
                      className={`text-${template.is_active ? 'red' : 'green'}-600 hover:text-${template.is_active ? 'red' : 'green'}-900`}
                    >
                      {template.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TemplateManager;
