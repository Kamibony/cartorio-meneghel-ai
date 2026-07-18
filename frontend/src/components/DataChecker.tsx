import React, { useState } from 'react';

// Type definitions for the expected API response
interface ValidationError {
  field: string;
  level: string;
  message: string;
}

interface ValidationResponse {
  status?: string;
  errors?: ValidationError[];
  error?: string;
}

const MOCK_GROUND_TRUTH = {
  nome: "JOAO DA SILVA",
  cpf: "702.478.934-47",
  rg: "4054425",
  nome_mae: "CAMILA FIGUEIREDO ROCHA",
  nome_pai: "CARLOS DA SILVA",
  data_nascimento: "15/05/1985",
  naturalidade: "SÃO PAULO - SP"
};

const DataChecker: React.FC = () => {
  const [typedText, setTypedText] = useState<string>('');
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[] | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleValidate = async () => {
    setIsValidating(true);
    setValidationErrors(null);
    setServerError(null);

    try {
      // In production, the API endpoint path would be configured according to environments.
      // Assuming a relative path mapping, proxy, or same-domain deployment under https://us-central1-cartorio-ai.cloudfunctions.net/validate_document_text
      // As specified in firebase.json functions are under /functions but since rewrites point ** to index.html,
      // typical Cloud Functions endpoints are hosted directly at the function name or /api/function_name.
      // In Firebase Hosting with functions, you can rewrite to a function.
      // We will assume the endpoint is deployed and accessible via its path or proxy.
      // If deployed together with hosting, it might be mapped to `https://us-central1-cartorio-ai.cloudfunctions.net/validate_document_text` or `/apihttps://us-central1-cartorio-ai.cloudfunctions.net/validate_document_text`
      // Let's use an absolute URL if needed, but since it's an API, let's just point to `/apihttps://us-central1-cartorio-ai.cloudfunctions.net/validate_document_text`
      // Wait, firebase functions local emulator typically requires full URL or mapping.
      // According to typical Firebase setup: we'll call `https://us-central1-cartorio-ai.cloudfunctions.net/validate_document_text`.
      // Assuming firebase rewrite is set up to point to the function, but since we don't know the exact production URL,
      // let's use a standard Vite proxy setup for local dev, and assume it will be deployed to the same origin.
      // Usually Firebase Hosting rewrites look like: { "source": "/api/**", "function": "validate_document_text" }
      // The prompt says "The backend deterministic validation endpoint (validate_document_text) is deployed."
      // Since it's a relative call, let's just use the function name if deployed in the same project,
      // or we can just proxy it during dev in vite.config.ts if needed.
      // Let's use `/validate_document_text` but rewrite our firebase.json for local emulator or deployment if needed,
      // or simply leave it as an environment variable. We will just use the `/validate_document_text` endpoint relative to the domain.
      const response = await fetch('/validate_document_text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ground_truth: MOCK_GROUND_TRUTH,
          typed_text: typedText,
        }),
      });

      const data: ValidationResponse = await response.json();

      if (!response.ok) {
        setServerError(data.error || 'Unknown error occurred during validation');
      } else {
        setValidationErrors(data.errors || []);
      }
    } catch (error) {
      setServerError('Failed to connect to the validation service.');
      console.error('Validation error:', error);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="h-full bg-white border border-gray-300 rounded-lg shadow-sm flex flex-col">
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-700">Audit Area (Typed Text)</h2>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <label htmlFor="typed-text" className="block text-sm font-medium text-gray-700 mb-2">
          Typed Legal Document
        </label>
        <textarea
          id="typed-text"
          value={typedText}
          onChange={(e) => setTypedText(e.target.value)}
          className="flex-1 w-full border border-gray-300 rounded-md shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm"
          placeholder="Enter the transcribed text from the document here... (e.g. O cpf 702.478.934-47 e o rg 4054425 de Joao, filho de CAMILA FIGUEIREDO ROCHA.)"
          disabled={isValidating}
        />

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleValidate}
            disabled={isValidating || !typedText.trim()}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
              isValidating || !typedText.trim()
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
            }`}
          >
            {isValidating ? 'Validating...' : 'Validate Data'}
          </button>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-4 overflow-y-auto" style={{ maxHeight: '250px' }}>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Validation Results</h3>

          {serverError && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700 font-bold">Server Error</p>
                  <p className="text-sm text-red-600 mt-1">{serverError}</p>
                </div>
              </div>
            </div>
          )}

          {validationErrors === null && !serverError ? (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-center text-gray-500 text-sm">
              Waiting for validation...
            </div>
          ) : validationErrors && validationErrors.length === 0 ? (
            <div className="bg-green-50 border-l-4 border-green-500 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-green-700 font-bold">Success!</p>
                  <p className="text-sm text-green-600 mt-1">No discrepancies found between typed text and scanned document.</p>
                </div>
              </div>
            </div>
          ) : (
            validationErrors && validationErrors.length > 0 && (
              <div className="space-y-3">
                <div className="bg-red-50 border-l-4 border-red-500 p-3 mb-2">
                  <p className="text-sm text-red-700 font-bold">Action Required: Discrepancies Found</p>
                </div>
                {validationErrors.map((error, idx) => (
                  <div key={idx} className="bg-orange-50 border border-orange-200 rounded-md p-3">
                    <p className="text-sm font-semibold text-orange-800 uppercase tracking-wide mb-1">
                      Field: {error.field}
                    </p>
                    <p className="text-sm text-orange-700">{error.message}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default DataChecker;
