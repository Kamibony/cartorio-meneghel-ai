import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../utils/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Minuta } from '../types/firestore';

const EscreventeInbox: React.FC = () => {
  const { cartorioId, userRole } = useAuth();
  const [tasks, setTasks] = useState<{ [id: string]: Minuta }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [requestingSupportId, setRequestingSupportId] = useState<string | null>(null);

  useEffect(() => {
    if (!cartorioId) return;

    setIsLoading(true);
    const minutasRef = collection(db, 'minutas');
    const q = query(
      minutasRef,
      where('cartorio_id', '==', cartorioId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newTasks: { [id: string]: Minuta } = {};
      snapshot.forEach((doc) => {
        newTasks[doc.id] = { id: doc.id, ...doc.data() } as Minuta;
      });
      setTasks(newTasks);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching tasks: ", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [cartorioId]);

  if (isLoading) {
    return <div className="p-6 text-gray-500">Carregando fila de tarefas...</div>;
  }

  const handleTaskClick = (taskId: string, status: string) => {
    // Navigate to validation view or minute generator based on status
    if (status === 'completed') {
      window.history.pushState({}, '', `?view=minute_generator&docId=${taskId}`);
    } else {
      window.history.pushState({}, '', `?view=dashboard&docId=${taskId}`);
    }
    // Dispatch a popstate event so App.tsx can react
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleRequestSupport = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation(); // Prevent row click

    if (!window.confirm("Deseja conceder acesso temporário (24h) ao suporte (Super Admin) para este documento? Esta ação será registrada.")) {
        return;
    }

    setRequestingSupportId(taskId);
    try {
        const functions = getFunctions();
        const grantSupportAccess = httpsCallable(functions, 'grantSupportAccess');
        await grantSupportAccess({ document_id: taskId, duration_hours: 24 });
        alert("Acesso de suporte concedido com sucesso por 24 horas.");
    } catch (error: any) {
        console.error("Erro ao solicitar suporte:", error);
        alert(`Erro: ${error.message || 'Falha ao solicitar suporte'}`);
    } finally {
        setRequestingSupportId(null);
    }
  };

  const processingTasks = Object.values(tasks).filter(t => t.status === 'processing');
  const hitlRequiredTasks = Object.values(tasks).filter(t => t.status === 'hitl_required');
  const completedTasks = Object.values(tasks).filter(t => t.status === 'completed');

  const renderTaskList = (taskList: Minuta[], title: string, emptyMessage: string, badgeColor: string) => (
    <div className="mb-8">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        {title}
        <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeColor}`}>
          {taskList.length}
        </span>
      </h3>
      {taskList.length === 0 ? (
        <p className="text-gray-500 text-sm italic">{emptyMessage}</p>
      ) : (
        <ul className="space-y-3">
          {taskList.map(task => (
            <li
              key={task.id}
              onClick={() => handleTaskClick(task.id!, task.status)}
              className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex justify-between items-center"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{task.document_type || 'Documento Desconhecido'}</p>
                <p className="text-xs text-gray-500 mt-1">ID: {task.id}</p>
              </div>
              <div className="text-right flex flex-col items-end">
                <span className="text-xs text-gray-400 mb-2">
                  {task.createdAt ? new Date(task.createdAt.toMillis()).toLocaleString() : ''}
                </span>
                {userRole === 'cartorio_admin' && (
                    <button
                        onClick={(e) => handleRequestSupport(e, task.id!)}
                        disabled={requestingSupportId === task.id}
                        className={`text-xs px-2 py-1 rounded border ${requestingSupportId === task.id ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}
                    >
                        {requestingSupportId === task.id ? 'Solicitando...' : 'Solicitar Suporte'}
                    </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto h-full overflow-y-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800">Fila de Tarefas (Inbox)</h2>
        <p className="text-sm text-gray-600 mt-1">Gerencie os documentos pendentes de validação e minutas prontas para geração.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          {renderTaskList(
            hitlRequiredTasks,
            'Ação Necessária',
            'Nenhuma validação pendente.',
            'bg-yellow-100 text-yellow-800'
          )}
        </div>
        <div>
           {renderTaskList(
            processingTasks,
            'Em Processamento',
            'Nenhum documento sendo processado.',
            'bg-blue-100 text-blue-800'
          )}
        </div>
        <div>
          {renderTaskList(
            completedTasks,
            'Concluídos',
            'Nenhuma minuta concluída.',
            'bg-green-100 text-green-800'
          )}
        </div>
      </div>
    </div>
  );
};

export default EscreventeInbox;
