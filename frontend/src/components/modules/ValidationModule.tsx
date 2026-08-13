import React, { useState, useRef, useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { useAuth } from '../../contexts/AuthContext';
import DocumentViewer from '../DocumentViewer';
import ExtractionReviewPanel from '../ExtractionReviewPanel';
import ManualDraftInput from '../ManualDraftInput';
import ValidationResultsPanel from '../ValidationResultsPanel';
import type { DiffBlock } from '../InteractiveDiffWidget';

interface ValidationModuleProps {
  initialDraftId?: string | null;
  initialGroundTruth?: any;
  initialDraftState?: any;
  onClose?: () => void;
}

const ValidationModule: React.FC<ValidationModuleProps> = ({
  initialDraftId,
  initialGroundTruth,
  initialDraftState,
  onClose
}) => {
  const [draftId] = useState<string | null>(initialDraftId || null);
  const [groundTruth, setGroundTruth] = useState<any>(initialGroundTruth || null);

  // States originally in DataChecker
  const [resolvedGroundTruth, setResolvedGroundTruth] = useState<any>(initialGroundTruth ? JSON.parse(JSON.stringify(initialGroundTruth)) : null);
  const [hasAcknowledgedGroundTruth, setHasAcknowledgedGroundTruth] = useState<boolean>(false);

  const [inputType, setInputType] = useState<'upload' | 'typing'>('upload');
  const [typedText, setTypedText] = useState<string>('');
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [cachedDraftText, setCachedDraftText] = useState<{fileName: string, text: string} | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  const [validationErrors, setValidationErrors] = useState<any[] | null>(null); // Use any for simplicity or import the type
  const [resolvedErrors, setResolvedErrors] = useState<Set<string>>(new Set());
  const [interactiveDiffBlocks, setInteractiveDiffBlocks] = useState<DiffBlock[] | null>(null);
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'validation' | 'visual_review' | 'corrected'>('validation');

  const { cartorioId } = useAuth();
  const saveTimeoutRef = useRef<number | null>(null);

  React.useEffect(() => {
      const documentId = draftId || groundTruth?.document_id;
      if (documentId && resolvedGroundTruth && cartorioId) {
          const cacheObj = {
              resolvedGroundTruth,
              hasAcknowledgedGroundTruth,
              resolvedErrors: Array.from(resolvedErrors),
              typedText,
              validationErrors,
              interactiveDiffBlocks,
              correctedText,
              viewMode
          };

          // Synchronously save to localStorage for instant backup
          localStorage.setItem(`draft_state_${documentId}`, JSON.stringify(cacheObj));

          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

          saveTimeoutRef.current = window.setTimeout(async () => {
              try {
                  const minutaRef = doc(db, 'minutas', documentId);
                  await updateDoc(minutaRef, { draft_state: cacheObj });
                  // Clear local storage upon successful sync to prevent stale data conflicts
                  // on future visits or across multiple devices.
                  localStorage.removeItem(`draft_state_${documentId}`);
              } catch (e) {
                  console.error("Failed to save draft state to Firestore", e);
              }
          }, 30000); // Debounce 30 seconds to reduce Firestore writes
      }

      return () => {
          if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      }
  }, [resolvedGroundTruth, hasAcknowledgedGroundTruth, resolvedErrors, typedText, validationErrors, interactiveDiffBlocks, correctedText, viewMode, draftId, groundTruth?.document_id, cartorioId]);

  // Flush to Firestore on page unload
  React.useEffect(() => {
      const handleBeforeUnload = () => {
          const documentId = draftId || groundTruth?.document_id;
          if (documentId && resolvedGroundTruth) {
              const cacheObj = {
                  resolvedGroundTruth,
                  hasAcknowledgedGroundTruth,
                  resolvedErrors: Array.from(resolvedErrors),
                  typedText,
                  validationErrors,
                  interactiveDiffBlocks,
                  correctedText,
                  viewMode
              };

              // We use localStorage as the primary rapid backup.
              localStorage.setItem(`draft_state_${documentId}`, JSON.stringify(cacheObj));
          }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
      };
  }, [resolvedGroundTruth, hasAcknowledgedGroundTruth, resolvedErrors, typedText, validationErrors, interactiveDiffBlocks, correctedText, viewMode, draftId, groundTruth?.document_id]);

  // Hydrate from initialDraftState if present
  React.useEffect(() => {
    if (initialDraftState) {
      if (initialDraftState.resolvedGroundTruth) setResolvedGroundTruth(initialDraftState.resolvedGroundTruth);
      if (initialDraftState.hasAcknowledgedGroundTruth !== undefined) setHasAcknowledgedGroundTruth(initialDraftState.hasAcknowledgedGroundTruth);
      if (initialDraftState.resolvedErrors) setResolvedErrors(new Set(initialDraftState.resolvedErrors));
      if (initialDraftState.typedText) setTypedText(initialDraftState.typedText);
      if (initialDraftState.validationErrors) setValidationErrors(initialDraftState.validationErrors);
      if (initialDraftState.interactiveDiffBlocks) setInteractiveDiffBlocks(initialDraftState.interactiveDiffBlocks);
      if (initialDraftState.correctedText) setCorrectedText(initialDraftState.correctedText);
      if (initialDraftState.viewMode) setViewMode(initialDraftState.viewMode);
    } else {
      setResolvedGroundTruth(groundTruth ? JSON.parse(JSON.stringify(groundTruth)) : null);
    }
  }, [groundTruth, initialDraftState]);


  const hasUnresolvedConflicts = () => {
    if (!resolvedGroundTruth || !resolvedGroundTruth.entities) return false;
    for (const entity of resolvedGroundTruth.entities) {
        if (entity._conflicts && Object.keys(entity._conflicts).length > 0) return true;
        if (entity._potential_duplicates && entity._potential_duplicates.length > 0) return true;
    }
    return false;
  };

  const handleValidationComplete = () => {
    if (onClose) onClose();
  };

  const handleDataExtracted = useCallback((data: any) => {
      setGroundTruth(data);
      // Reset dependent states
      setResolvedGroundTruth(data ? JSON.parse(JSON.stringify(data)) : null);
      setHasAcknowledgedGroundTruth(false);
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
            <p className="text-sm">Envie um documento no painel ao lado para extrair os dados e iniciar a validação.</p>
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
               <ManualDraftInput
                 inputType={inputType}
                 setInputType={setInputType}
                 typedText={typedText}
                 setTypedText={setTypedText}
                 draftFile={draftFile}
                 setDraftFile={setDraftFile}
                 isValidating={isValidating}
               />
               <ValidationResultsPanel
                 groundTruth={groundTruth}
                 resolvedGroundTruth={resolvedGroundTruth}
                 hasUnresolvedConflicts={hasUnresolvedConflicts}
                 typedText={typedText}
                 draftFile={draftFile}
                 inputType={inputType}
                 cachedDraftText={cachedDraftText}
                 setCachedDraftText={setCachedDraftText}
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
                 onValidationComplete={handleValidationComplete}
               />
            </>
        )}
      </section>
    </div>
  );
};

export default ValidationModule;
