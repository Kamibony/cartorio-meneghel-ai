import React from 'react';
import SmartWizardContainer from './SmartWizard/SmartWizardContainer';

interface TemplateGeneratorInputProps {
  groundTruth: any;
  onGenerated: (text: string) => void;
  onValidationComplete?: () => void;
}

const TemplateGeneratorInput: React.FC<TemplateGeneratorInputProps> = ({ groundTruth, onGenerated }) => {
  return (
    <SmartWizardContainer
      groundTruth={groundTruth}
      onGenerated={onGenerated}
    />
  );
};

export default TemplateGeneratorInput;
