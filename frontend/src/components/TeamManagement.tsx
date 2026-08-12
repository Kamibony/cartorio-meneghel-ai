import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../utils/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { User, UserRole } from '../types/firestore';
import { ENV } from '../config/env';

interface TeamManagementProps {
  injectedCartorioId?: string;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ injectedCartorioId }) => {
  const { cartorioId: authCartorioId, userRole } = useAuth();
  const cartorioId = injectedCartorioId || authCartorioId;
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('escrevente');
  const [isInviting, setIsInviting] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);

  const loadUsers = async () => {
    if (!cartorioId && userRole !== 'super_admin') return;
    setIsLoading(true);
    try {
      let q;
      if (userRole === 'super_admin') {
        q = query(collection(db, 'users'));
      } else {
        q = query(collection(db, 'users'), where('cartorio_id', '==', cartorioId));
      }
      const querySnapshot = await getDocs(q);
      const fetchedUsers: User[] = [];
      querySnapshot.forEach((doc) => {
        fetchedUsers.push(doc.data() as User);
      });
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Failed to load users:", error);
      setMessage({ text: "Erro ao carregar equipe.", type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [cartorioId]);

  const handleRevoke = async (uid: string) => {
    if (!window.confirm("Tem certeza que deseja revogar o acesso deste usuário?")) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      const apiUrl = ENV.apiUrl;
      const response = await fetch(`${apiUrl}/revokeEmployeeAccess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ uid })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao revogar acesso');
      }

      setMessage({ text: 'Acesso revogado com sucesso.', type: 'success' });
      loadUsers();
    } catch (error: any) {
      setMessage({ text: error.message, type: 'error' });
    }
  };

  const handleReactivate = async (uid: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const apiUrl = ENV.apiUrl;
      const response = await fetch(`${apiUrl}/reactivateEmployeeAccess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ uid })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao reativar acesso');
      }

      setMessage({ text: 'Acesso reativado com sucesso.', type: 'success' });
      loadUsers();
    } catch (error: any) {
      setMessage({ text: error.message, type: 'error' });
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setIsInviting(true);
    setMessage(null);

    try {
      const token = await auth.currentUser?.getIdToken();

      const apiUrl = ENV.apiUrl;

      const payload: any = { email: inviteEmail, role: inviteRole };
      if (injectedCartorioId) {
          payload.cartorio_id = injectedCartorioId;
      }

      const response = await fetch(`${apiUrl}/inviteEmployee`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao convidar usuário');
      }

      setMessage({ text: 'Usuário convidado com sucesso!', type: 'success' });
      setInviteEmail('');
      loadUsers(); // Refresh the list
    } catch (error: any) {
      setMessage({ text: error.message, type: 'error' });
    } finally {
      setIsInviting(false);
    }
  };

  if (userRole !== 'cartorio_admin' && userRole !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-red-200">
          <svg className="mx-auto h-12 w-12 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Acesso Negado</h2>
          <p className="text-gray-600">Você não tem permissão para acessar a Gestão de Equipe.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-4xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-6">Gestão de Equipe</h2>

      {message && (
        <div className={`p-4 mb-6 rounded-md ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message.text}
        </div>
      )}

      <div className="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Convidar Membro</h3>
        <form onSubmit={handleInvite} className="flex gap-4 items-end">
          <div className="flex-1">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              id="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">Papel</label>
            <select
              id="role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="escrevente">Escrevente</option>
              <option value="cartorio_admin">Administrador</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isInviting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-blue-400"
          >
            {isInviting ? 'Convidando...' : 'Convidar'}
          </button>
        </form>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-800 mb-4">Membros da Equipe</h3>
        {isLoading ? (
          <div className="text-center py-4 text-gray-500">Carregando equipe...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Papel</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.uid}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.role === 'super_admin' ? 'bg-blue-100 text-blue-800' :
                        user.role === 'cartorio_admin' ? 'bg-purple-100 text-purple-800' :
                        user.role === 'escrevente' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {user.role === 'super_admin' ? 'Super Admin' :
                         user.role === 'cartorio_admin' ? 'Admin' :
                         user.role === 'escrevente' ? 'Escrevente' : 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.status === 'active' ? (
                          <span className="text-green-600 font-medium">Ativo</span>
                      ) : (
                          <span className="text-red-500">Revogado</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {user.status === 'active' && (userRole === 'super_admin' || user.role !== 'cartorio_admin') && (
                            <button
                                onClick={() => handleRevoke(user.uid)}
                                className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-md transition-colors"
                            >
                                Revogar
                            </button>
                        )}
                        {user.status === 'revoked' && (userRole === 'super_admin' || user.role !== 'cartorio_admin') && (
                            <button
                                onClick={() => handleReactivate(user.uid)}
                                className="text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1 rounded-md transition-colors"
                            >
                                Reativar
                            </button>
                        )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                      Nenhum membro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamManagement;
