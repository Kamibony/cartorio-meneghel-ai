import React, { useState, useCallback } from 'react';
import DocumentViewer from '../DocumentViewer';
import ExtractionReviewPanel from '../ExtractionReviewPanel';
import TemplateGeneratorInput from '../TemplateGeneratorInput';
import ValidationResultsPanel from '../ValidationResultsPanel';
import type { DiffBlock } from '../InteractiveDiffWidget';

interface GeneratorModuleProps {
    initialDraftId?: string | null;
    initialGroundTruth?: any;
    useSmartWizard?: boolean;
}

const GeneratorModule: React.FC<GeneratorModuleProps> = ({ initialDraftId, initialGroundTruth, useSmartWizard }) => {
    const [draftId, setDraftId] = useState<string | null>(() => {
        if (initialDraftId) return initialDraftId;
        const cached = sessionStorage.getItem('generator_draftId');
        return cached ? cached : null;
    });
    const [groundTruth, setGroundTruth] = useState<any>(() => {
        if (initialGroundTruth) return initialGroundTruth;
        const cached = sessionStorage.getItem('generator_groundTruth');
        return cached ? JSON.parse(cached) : null;
    });

    // Extraction Review States
    const [resolvedGroundTruth, setResolvedGroundTruth] = useState<any>(() => {
        if (initialGroundTruth) return JSON.parse(JSON.stringify(initialGroundTruth));
        const cached = sessionStorage.getItem('generator_resolvedGroundTruth');
        return cached ? JSON.parse(cached) : null;
    });
    const [hasAcknowledgedGroundTruth, setHasAcknowledgedGroundTruth] = useState<boolean>(() => {
        const cached = sessionStorage.getItem('generator_hasAcknowledgedGroundTruth');
        return cached ? JSON.parse(cached) : false;
    });

    // Generator & Validation States
    const [draftText, setDraftText] = useState<string>(''); // Received from TemplateGeneratorInput

    // Validation Results Panel States
    const [isValidating, setIsValidating] = useState<boolean>(false);
    const [validationErrors, setValidationErrors] = useState<any[] | null>(null);
    const [resolvedErrors, setResolvedErrors] = useState<Set<string>>(new Set());
    const [interactiveDiffBlocks, setInteractiveDiffBlocks] = useState<DiffBlock[] | null>(null);
    const [correctedText, setCorrectedText] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'validation' | 'visual_review' | 'corrected'>('validation');

    React.useEffect(() => {
        setResolvedGroundTruth(groundTruth ? JSON.parse(JSON.stringify(groundTruth)) : null);
    }, [groundTruth]);
    // Persist state to sessionStorage
    React.useEffect(() => {
        if (draftId) sessionStorage.setItem('generator_draftId', draftId);
        else sessionStorage.removeItem('generator_draftId');
    }, [draftId]);

    React.useEffect(() => {
        if (groundTruth) sessionStorage.setItem('generator_groundTruth', JSON.stringify(groundTruth));
        else sessionStorage.removeItem('generator_groundTruth');
    }, [groundTruth]);

    React.useEffect(() => {
        if (resolvedGroundTruth) sessionStorage.setItem('generator_resolvedGroundTruth', JSON.stringify(resolvedGroundTruth));
        else sessionStorage.removeItem('generator_resolvedGroundTruth');
    }, [resolvedGroundTruth]);

    React.useEffect(() => {
        sessionStorage.setItem('generator_hasAcknowledgedGroundTruth', JSON.stringify(hasAcknowledgedGroundTruth));
    }, [hasAcknowledgedGroundTruth]);


    const hasUnresolvedConflicts = () => {
        if (!resolvedGroundTruth || !resolvedGroundTruth.entities) return false;
        for (const entity of resolvedGroundTruth.entities) {
            if (entity._conflicts && Object.keys(entity._conflicts).length > 0) return true;
            if (entity._potential_duplicates && entity._potential_duplicates.length > 0) return true;
        }
        return false;
    };

    const handleDataExtracted = useCallback((data: any) => {
        setGroundTruth(data);
        setHasAcknowledgedGroundTruth(false);
        // Clear old generation results
        setDraftText('');
        setValidationErrors(null);
        setResolvedErrors(new Set());
        setInteractiveDiffBlocks(null);
        setCorrectedText(null);
    }, []);

    const handleDocumentGenerated = useCallback((text: string) => {
        setDraftText(text);
        // Reset validation view
        setValidationErrors(null);
        setResolvedErrors(new Set());
        setInteractiveDiffBlocks(null);
        setCorrectedText(null);
        setViewMode('validation');
    }, []);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            <section className="h-full overflow-hidden">
                <DocumentViewer onDataExtracted={handleDataExtracted} draftId={draftId} />
            </section>

            <section className="h-full overflow-hidden flex flex-col gap-4">
                {!groundTruth && (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50 border border-gray-200 rounded-lg p-6 text-center shadow-sm">
                        <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        <p className="font-medium text-gray-500 text-lg mb-2">Aguardando Extração</p>
                        <p className="text-sm">Envie um documento no painel ao lado para extrair os dados e iniciar a geração da minuta.</p>
                    </div>
                )}

                <ExtractionReviewPanel
                    resolvedGroundTruth={resolvedGroundTruth}
                    setResolvedGroundTruth={setResolvedGroundTruth}
                    hasAcknowledgedGroundTruth={hasAcknowledgedGroundTruth}
                    setHasAcknowledgedGroundTruth={setHasAcknowledgedGroundTruth}
                    hasUnresolvedConflicts={hasUnresolvedConflicts}
                />

                {groundTruth && (!hasUnresolvedConflicts() && hasAcknowledgedGroundTruth) && (
                    <>
                        <TemplateGeneratorInput
                            groundTruth={resolvedGroundTruth}
                            draftId={draftId}
                            onGenerated={handleDocumentGenerated}
                            useSmartWizard={useSmartWizard}
                        />

                        {draftText && (
                            <ValidationResultsPanel
                                groundTruth={groundTruth}
                                resolvedGroundTruth={resolvedGroundTruth}
                                hasUnresolvedConflicts={hasUnresolvedConflicts}
                                typedText={draftText}
                                draftFile={null} // Not using file upload here
                                inputType={'typing'} // Force validation on the generated text
                                cachedDraftText={null}
                                setCachedDraftText={() => {}}
                                isValidating={isValidating}
                                setIsValidating={setIsValidating}
                                validationErrors={validationErrors}
                                setValidationErrors={setValidationErrors}
                                resolvedErrors={resolvedErrors}
                                setResolvedErrors={setResolvedErrors}
                                interactiveDiffBlocks={interactiveDiffBlocks}
                                setInteractiveDiffBlocks={setInteractiveDiffBlocks}
                                correctedText={correctedText}
                                setCorrectedText={setCorrectedText}
                                viewMode={viewMode}
                                setViewMode={setViewMode}
                                draftId={draftId}
                                onValidationComplete={() => {
                                    setGroundTruth(null);
                                    setDraftId(null);
                                }}
                            />
                        )}
                    </>
                )}
            </section>
        </div>
    );
};

export default GeneratorModule;
