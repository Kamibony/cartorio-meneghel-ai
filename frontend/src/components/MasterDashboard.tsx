import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';

const MasterDashboard = () => {
    const [cartorios, setCartorios] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newCartorioId, setNewCartorioId] = useState('');
    const [newCartorioStatus, setNewCartorioStatus] = useState('active');
    const [adminEmail, setAdminEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const fetchCartorios = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'cartorios'));
            const querySnapshot = await getDocs(q);
            const cartoriosData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setCartorios(cartoriosData);
        } catch (error) {
            console.error("Error fetching cartorios:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCartorios();
    }, []);

    const handleCreateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setIsSubmitting(true);
        try {
            if (!newCartorioId) {
                throw new Error("O ID do Cartório é obrigatório.");
            }

            // Create Tenant
            const cartorioRef = doc(db, 'cartorios', newCartorioId);
            await setDoc(cartorioRef, {
                status: newCartorioStatus,
                createdAt: new Date()
            });

            // Provision Admin if email is provided
            if (adminEmail) {
                // We use the backend API to invite an employee.
                // Assuming you have Firebase Auth context to get the token, but we can't easily fetch it here
                // without useAuth(). For this simple component, we will rely on standard fetch or maybe we need to import auth.
                // Let's rely on the user having to be logged in to be here.
                const { getAuth } = await import('firebase/auth');
                const auth = getAuth();
                const token = await auth.currentUser?.getIdToken();

                const apiUrl = import.meta.env.VITE_API_URL || '/api';
                const response = await fetch(`${apiUrl}/inviteEmployee`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        email: adminEmail,
                        role: 'cartorio_admin',
                        cartorio_id: newCartorioId
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`Erro ao provisionar admin: ${errorData.error || response.statusText}`);
                }
            }

            setIsModalOpen(false);
            setNewCartorioId('');
            setAdminEmail('');
            setSuccessMessage("Tenant criado com sucesso. Um email de boas-vindas/redefinição de senha foi enviado ao Admin.");
            await fetchCartorios();
        } catch (err: any) {
            console.error("Error creating tenant:", err);
            setError(err.message || "Erro desconhecido ao criar cartório.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200 h-full relative">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Master Dashboard (Super Admin)</h2>
                <button
                    onClick={() => { setIsModalOpen(true); setError(null); setSuccessMessage(null); }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium"
                >
                    Criar Cartório
                </button>
            </div>

            <div className="mb-6">
                <p className="text-sm text-gray-600 mb-2">
                    Painel exclusivo para controle central e gestão de tenants (Cartórios).
                </p>
            </div>

            {successMessage && (
                <div className="mb-4 p-4 text-sm text-green-700 bg-green-100 rounded-lg" role="alert">
                    {successMessage}
                </div>
            )}

            <h3 className="text-lg font-semibold mb-3 text-gray-700">Tenants Ativos</h3>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
                        <h3 className="text-lg font-bold mb-4">Criar Novo Cartório</h3>
                        {error && <div className="mb-4 text-red-600 text-sm">{error}</div>}
                        <form onSubmit={handleCreateTenant}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">ID do Cartório</label>
                                <input
                                    type="text"
                                    value={newCartorioId}
                                    onChange={(e) => setNewCartorioId(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                    placeholder="ex: cartorio_sp_01"
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                <select
                                    value={newCartorioStatus}
                                    onChange={(e) => setNewCartorioStatus(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                >
                                    <option value="active">Ativo</option>
                                    <option value="inactive">Inativo</option>
                                </select>
                            </div>
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email do Admin (Opcional)</label>
                                <input
                                    type="email"
                                    value={adminEmail}
                                    onChange={(e) => setAdminEmail(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-3 py-2"
                                    placeholder="admin@cartorio.com"
                                />
                            </div>
                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                                    disabled={isSubmitting}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? 'Criando...' : 'Criar Cartório'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {loading ? (
                <p className="text-sm text-gray-500">Carregando cartórios...</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID do Cartório</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {cartorios.length > 0 ? (
                                cartorios.map(cartorio => (
                                    <tr key={cartorio.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cartorio.id}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cartorio.status || 'Ativo'}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={2} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">Nenhum cartório encontrado.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default MasterDashboard;
