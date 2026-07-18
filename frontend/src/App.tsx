import './index.css';
import DocumentViewer from './components/DocumentViewer';
import DataChecker from './components/DataChecker';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Cartório AI Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">Zero-Hallucination Data Verification Engine</p>
        </div>
        <div className="flex items-center space-x-2 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-green-700 text-sm font-semibold">System Operational</span>
        </div>
      </header>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-88px)]">
        <section className="h-full">
          <DocumentViewer />
        </section>

        <section className="h-full">
          <DataChecker />
        </section>
      </main>
    </div>
  );
}

export default App;
