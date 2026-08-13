import React, { useState } from 'react';
import DocumentViewer from '../DocumentViewer';
import ExtractionReviewPanel from '../ExtractionReviewPanel';
import TemplateGeneratorInput from '../TemplateGeneratorInput';
import ValidationResultsPanel from '../ValidationResultsPanel';
import type { DiffBlock } from '../InteractiveDiffWidget';

interface GeneratorModuleProps {
    initialDraftId?: string | null;
    initialGroundTruth?: any;
}

const GeneratorModule: React.FC<GeneratorModuleProps> = ({ initialDraftId, initialGroundTruth }) => {
    const [draftId, setDraftId] = useState<string | null>(initialDraftId || null);
    const [groundTruth, setGroundTruth] = useState<any>(initialGroundTruth || null);

    // Extraction Review States
    const [resolvedGroundTruth, setResolvedGroundTruth] = useState<any>(initialGroundTruth ? JSON.parse(JSON.stringify(initialGroundTruth)) : null);
    const [hasAcknowledgedGroundTruth, setHasAcknowledgedGroundTruth] = useState<boolean>(false);

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

    const hasUnresolvedConflicts = () => {
        if (!resolvedGroundTruth || !resolvedGroundTruth.entities) return false;
        for (const entity of resolvedGroundTruth.entities) {
            if (entity._conflicts && Object.keys(entity._conflicts).length > 0) return true;
            if (entity._potential_duplicates && entity._potential_duplicates.length > 0) return true;
        }
        return false;
    };

    const handleDataExtracted = (data: any) => {
        setGroundTruth(data);
        setHasAcknowledgedGroundTruth(false);
        // Clear old generation results
        setDraftText('');
        setValidationErrors(null);
        setResolvedErrors(new Set());
        setInteractiveDiffBlocks(null);
        setCorrectedText(null);
    };

    const handleDocumentGenerated = (text: string) => {
        setDraftText(text);
        // Reset validation view
        setValidationErrors(null);
        setResolvedErrors(new Set());
        setInteractiveDiffBlocks(null);
        setCorrectedText(null);
        setViewMode('validation');
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            <section className="h-full overflow-hidden">
                <DocumentViewer onDataExtracted={handleDataExtracted} draftId={draftId} />
            </section>

            <section className="h-full overflow-hidden flex flex-col gap-4">
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
                            onGenerated={handleDocumentGenerated}
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
