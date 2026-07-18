import './index.css';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full">
        <header className="mb-8 border-b pb-4">
          <h1 className="text-3xl font-bold text-gray-800">Cartório AI Dashboard</h1>
          <p className="text-gray-500 mt-2">Zero-Hallucination Data Verification Engine</p>
        </header>

        <main className="space-y-6">
          <section className="bg-blue-50 border border-blue-200 rounded p-4">
            <h2 className="text-xl font-semibold text-blue-800 mb-2">System Status</h2>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-green-700 font-medium">All systems operational</span>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">Pending Validations</h2>
            <div className="bg-gray-50 border rounded text-center p-8 text-gray-500">
              No documents pending validation at this time.
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;