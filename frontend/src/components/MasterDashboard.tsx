import { useState, useEffect } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase';

const MasterDashboard = () => {
    const [cartorios, setCartorios] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCartorios = async () => {
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

        fetchCartorios();
    }, []);

    return (
        <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200 h-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Master Dashboard (Super Admin)</h2>
            <div className="mb-6">
                <p className="text-sm text-gray-600 mb-2">
                    Painel exclusivo para controle central e gestão de tenants (Cartórios).
                </p>
            </div>

            <h3 className="text-lg font-semibold mb-3 text-gray-700">Tenants Ativos</h3>
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
