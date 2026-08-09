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
import EscreventeInbox from './components/EscreventeInbox';
import MasterDashboard from './components/MasterDashboard';

function Dashboard() {
  const { currentUser, userRole, isLoading } = useAuth();
  const [groundTruth, setGroundTruth] = useState<any>(null);
  const [initialDraftState, setInitialDraftState] = useState<any>(null);
  const [currentView, setCurrentView] = useState<'inbox' | 'dashboard' | 'team_management' | 'template_manager' | 'minute_generator' | 'master_dashboard'>(userRole === 'super_admin' ? 'master_dashboard' : 'inbox');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(false);

  // Parse docId from URL and hydrate state
  useEffect(() => {
    const hydrateState = async () => {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view') as any;
      if (viewParam && ['inbox', 'dashboard', 'team_management', 'template_manager', 'minute_generator', 'master_dashboard'].includes(viewParam)) {
          setCurrentView(viewParam);
      } else if (userRole === 'super_admin' && (!viewParam || ['inbox', 'dashboard', 'minute_generator'].includes(viewParam))) {
          setCurrentView('master_dashboard');
      }
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

    const handlePopState = () => {
        hydrateState();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
        window.removeEventListener('popstate', handlePopState);
    };
  }, [currentUser, userRole]);

  // Force current view update when role changes after hydration
  useEffect(() => {
    if (userRole === 'super_admin' && ['inbox', 'dashboard', 'minute_generator'].includes(currentView)) {
      setCurrentView('master_dashboard');
      window.history.replaceState({}, '', '?view=master_dashboard');
    }
  }, [userRole, currentView]);

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

  // Prevent unauthorized views from rendering for super_admin
  let activeView = currentView;
  if (userRole === 'super_admin' && ['inbox', 'dashboard', 'minute_generator'].includes(activeView)) {
      activeView = 'master_dashboard';
  }

  const handleNavClick = (view: typeof currentView) => {
      setCurrentView(view);
      window.history.pushState({}, '', `?view=${view}`);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm flex items-center justify-between z-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Painel Cartório AI</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">Motor de Verificação de Dados Sem Alucinações</p>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-sm text-gray-600">
            {currentUser.email}
          </div>
          <div className="flex items-center space-x-2 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-green-700 text-sm font-semibold">Sistema Operacional</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col p-4 shadow-sm z-0">
          <nav className="flex-1 space-y-1">
            {userRole === 'super_admin' && (
              <>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4 px-3">
                  Super Admin
                </div>
                <button
                  onClick={() => handleNavClick('master_dashboard')}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md mb-4 ${activeView === 'master_dashboard' ? 'bg-purple-50 text-purple-700' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}`}
                >
                  Master Dashboard
                </button>
              </>
            )}

            {userRole !== 'super_admin' && (
              <>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4 px-3">
                  Workspace
                </div>
                <button
                  onClick={() => handleNavClick('inbox')}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${currentView === 'inbox' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}`}
                >
                  Fila de Tarefas (Inbox)
                </button>
                <button
                  onClick={() => handleNavClick('dashboard')}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${currentView === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}`}
                >
                  Validação
                </button>
                <button
                  onClick={() => handleNavClick('minute_generator')}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${currentView === 'minute_generator' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}`}
                >
                  Gerador de Minutas
                </button>
              </>
            )}

            {(userRole === 'cartorio_admin' || userRole === 'super_admin') && (
              <>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-8 px-3">
                  Admin
                </div>
                <button
                  onClick={() => handleNavClick('template_manager')}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${currentView === 'template_manager' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}`}
                >
                  Templates
                </button>
                <button
                  onClick={() => handleNavClick('team_management')}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${currentView === 'team_management' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}`}
                >
                  Gestão de Equipe
                </button>
              </>
            )}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-hidden relative">
          {activeView === 'inbox' ? (
            <EscreventeInbox />
          ) : activeView === 'dashboard' ? (
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
                   setCurrentView(userRole === 'super_admin' ? 'master_dashboard' : 'inbox');
                }} />
              </section>
            </div>
          ) : activeView === 'team_management' ? (
            <div className="h-full overflow-auto">
              <TeamManagement />
            </div>
          ) : activeView === 'template_manager' ? (
            <div className="h-full overflow-auto">
              <TemplateManager />
            </div>
          ) : activeView === 'minute_generator' ? (
            <div className="h-full overflow-auto">
              <MinuteGenerator />
            </div>
          ) : activeView === 'master_dashboard' ? (
            <div className="h-full overflow-auto">
              <MasterDashboard />
            </div>
          ) : null}
        </main>
      </div>
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
