import { useState } from 'react';
import './index.css';
import DocumentViewer from './components/DocumentViewer';
import DataChecker from './components/DataChecker';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';

function Dashboard() {
  const [groundTruth, setGroundTruth] = useState<any>(null);
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-500 text-lg">Carregando...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Painel Cartório AI</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">Motor de Verificação de Dados Sem Alucinações</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600">
            {currentUser.email}
          </div>
          <div className="flex items-center space-x-2 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-green-700 text-sm font-semibold">Sistema Operacional</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-88px)] overflow-hidden">
        <section className="h-full overflow-hidden">
          <DocumentViewer onDataExtracted={setGroundTruth} />
        </section>

        <section className="h-full overflow-hidden">
          <DataChecker groundTruth={groundTruth} />
        </section>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  );
}

export default App;
