import React, { useState } from 'react';
import SmartWizardContainer from './SmartWizard/SmartWizardContainer';

interface TemplateGeneratorInputProps {
  groundTruth: any;
  onGenerated: (text: string) => void;
  onValidationComplete?: () => void;
  useSmartWizard?: boolean;
}

const TemplateGeneratorInput: React.FC<TemplateGeneratorInputProps> = ({ groundTruth, onGenerated, useSmartWizard }) => {
  const [legacyText, setLegacyText] = useState('');

  if (useSmartWizard) {
    return (
      <SmartWizardContainer
        groundTruth={groundTruth}
        onGenerated={onGenerated}
      />
    );
  }

  return (
    <div className="flex flex-col h-full p-4 border border-gray-300 rounded-lg">
      <h2 className="text-sm font-semibold mb-4">Gerador de Minutas (Módulo 2)</h2>
      <textarea
        className="flex-1 w-full border border-gray-300 rounded p-2 text-sm"
        placeholder="Digite ou cole sua minuta aqui..."
        value={legacyText}
        onChange={(e) => setLegacyText(e.target.value)}
      />
      <button
        onClick={() => onGenerated(legacyText)}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
      >
        Avançar para Validação
      </button>
    </div>
  );
};

export default TemplateGeneratorInput;
