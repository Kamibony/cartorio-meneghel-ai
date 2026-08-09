import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './utils/firebase';
import './index.css';
import DocumentViewer from './components/DocumentViewer';
import DataChecker from './components/DataChecker';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import TeamManagement from './components/TeamManagement';
import TemplateManager from './components/TemplateManager';
import MinuteGenerator from './components/MinuteGenerator';

function Dashboard() {
  const [groundTruth, setGroundTruth] = useState<any>(null);
  const [initialDraftState, setInitialDraftState] = useState<any>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'team_management' | 'template_manager' | 'minute_generator'>('dashboard');
  const { currentUser, userRole, isLoading } = useAuth();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(false);

  // Parse docId from URL and hydrate state
  useEffect(() => {
    const hydrateState = async () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('docId');
      if (id && userRole) {
        setIsHydrating(true);
        try {
          const minutaDoc = await getDoc(doc(db, 'minutas', id));
          if (minutaDoc.exists()) {
            const data = minutaDoc.data();
            if (data.status === 'hitl_required' || data.status === 'processing') {
                setDraftId(id);
                if (data.ai_extracted_data) {
                    setGroundTruth({
                        ...data.ai_extracted_data,
                        document_id: id
                    });
                }
                // Load from localStorage if present (indicating an unsynced draft from this device),
                // otherwise fallback to Firestore. Since we now clear localStorage on successful sync,
                // any data here represents an interrupted session.
                const localStateRaw = localStorage.getItem(`draft_state_${id}`);
                if (localStateRaw) {
                    try {
                        const parsedLocal = JSON.parse(localStateRaw);
                        // Optional: we could compare a timestamp, but since we clear on success,
                        // if this exists, it's unsaved local progress.
                        setInitialDraftState(parsedLocal);
                        // Clean it up so we don't accidentally reload it if we refresh after syncing
                        localStorage.removeItem(`draft_state_${id}`);
                    } catch (e) {
                        console.error("Failed to parse local draft state", e);
                        if (data.draft_state) {
                            setInitialDraftState(data.draft_state);
                        }
                    }
                } else if (data.draft_state) {
                    setInitialDraftState(data.draft_state);
                }
            } else {
                // If not in a valid state, clear the URL
                window.history.pushState({}, '', window.location.pathname);
            }
          }
        } catch (error) {
          console.error("Failed to hydrate state:", error);
        } finally {
          setIsHydrating(false);
        }
      }
    };

    if (currentUser) {
        hydrateState();
    }
  }, [currentUser, userRole]);

  if (isLoading || isHydrating) {
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

        <div className="flex items-center space-x-6">
          <nav className="flex space-x-4">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`text-sm font-medium ${currentView === 'dashboard' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Validação
            </button>
            <button
              onClick={() => setCurrentView('minute_generator')}
              className={`text-sm font-medium ${currentView === 'minute_generator' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Gerador de Minutas
            </button>
            {userRole === 'cartorio_admin' && (
              <>
                <button
                  onClick={() => setCurrentView('template_manager')}
                  className={`text-sm font-medium ${currentView === 'template_manager' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Templates
                </button>
                <button
                  onClick={() => setCurrentView('team_management')}
                  className={`text-sm font-medium ${currentView === 'team_management' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Gestão de Equipe
                </button>
              </>
            )}
          </nav>

          <div className="text-sm text-gray-600">
            {currentUser.email}
          </div>
          <div className="flex items-center space-x-2 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-green-700 text-sm font-semibold">Sistema Operacional</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 h-[calc(100vh-88px)] overflow-hidden">
        {currentView === 'dashboard' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            <section className="h-full overflow-hidden">
              <DocumentViewer onDataExtracted={setGroundTruth} draftId={draftId} />
            </section>

            <section className="h-full overflow-hidden">
              <DataChecker groundTruth={groundTruth} draftId={draftId} initialDraftState={initialDraftState} onValidationComplete={() => {
                 setGroundTruth(null);
                 setDraftId(null);
                 setInitialDraftState(null);
                 window.history.pushState({}, '', window.location.pathname);
              }} />
            </section>
          </div>
        ) : currentView === 'team_management' ? (
          <div className="h-full overflow-auto">
            <TeamManagement />
          </div>
        ) : currentView === 'template_manager' ? (
          <div className="h-full overflow-auto">
            <TemplateManager />
          </div>
        ) : currentView === 'minute_generator' ? (
          <div className="h-full overflow-auto">
            <MinuteGenerator />
          </div>
        ) : null}
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
