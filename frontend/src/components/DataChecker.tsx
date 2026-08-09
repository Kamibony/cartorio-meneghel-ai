import React, { useState, useRef } from 'react';
import { useDocumentUpload } from '../hooks/useDocumentUpload';
import { useCartorio } from '../hooks/useCartorio';
import { ENV } from '../config/env';
import { diff_match_patch } from 'diff-match-patch';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import InteractiveDiffWidget from './InteractiveDiffWidget';
import type { DiffBlock, ResolutionStatus } from './InteractiveDiffWidget';


// Type definitions for the expected API response
interface ValidationError {
  field: string;
  category: 'VALUE_MISMATCH' | 'MISSING_FIELD' | 'UNMATCHED_ENTITY';
  message: string;
  expected?: string;
  found?: string;
  found_in_text?: string;
  requires_human_review?: boolean;
  review_reason?: string;
  entity_name?: string;
}

interface ValidationResponse {
  status?: string;
  errors?: ValidationError[];
  error?: string;
}

interface DataCheckerProps {
  groundTruth: any;
  draftId?: string | null;
  initialDraftState?: any;
  onValidationComplete?: () => void;
}

const DataChecker: React.FC<DataCheckerProps> = ({ groundTruth, draftId, initialDraftState, onValidationComplete }) => {
  const [inputType, setInputType] = useState<'upload' | 'typing'>('upload');
  const [typedText, setTypedText] = useState<string>('');
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [cachedDraftText, setCachedDraftText] = useState<{fileName: string, text: string} | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isFormatting, setIsFormatting] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[] | null>(null);
  const [resolvedErrors, setResolvedErrors] = useState<Set<string>>(new Set());
  const [resolvingFields, setResolvingFields] = useState<Set<string>>(new Set());
  const [serverError, setServerError] = useState<string | null>(null);
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const [interactiveDiffBlocks, setInteractiveDiffBlocks] = useState<DiffBlock[] | null>(null);
  const [viewMode, setViewMode] = useState<'validation' | 'visual_review' | 'corrected'>('validation');

  const [resolvedGroundTruth, setResolvedGroundTruth] = useState<any>(null);
  const [hasAcknowledgedGroundTruth, setHasAcknowledgedGroundTruth] = useState<boolean>(false);

  // Sync prop groundTruth to local state so we can mutate it upon resolution
  React.useEffect(() => {
      if (initialDraftState) {
          try {
              if (initialDraftState.resolvedGroundTruth) setResolvedGroundTruth(initialDraftState.resolvedGroundTruth);
              if (initialDraftState.hasAcknowledgedGroundTruth !== undefined) setHasAcknowledgedGroundTruth(initialDraftState.hasAcknowledgedGroundTruth);
              if (initialDraftState.resolvedErrors) setResolvedErrors(new Set(initialDraftState.resolvedErrors));
              if (initialDraftState.typedText) setTypedText(initialDraftState.typedText);
              if (initialDraftState.validationErrors) setValidationErrors(initialDraftState.validationErrors);
              if (initialDraftState.interactiveDiffBlocks) setInteractiveDiffBlocks(initialDraftState.interactiveDiffBlocks);
              if (initialDraftState.correctedText) setCorrectedText(initialDraftState.correctedText);
              if (initialDraftState.viewMode) setViewMode(initialDraftState.viewMode);
              return;
          } catch (e) {
              console.error("Failed to hydrate initialDraftState", e);
          }
      }
      setResolvedGroundTruth(groundTruth ? JSON.parse(JSON.stringify(groundTruth)) : null);
      setHasAcknowledgedGroundTruth(false);
  }, [groundTruth, initialDraftState]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadAndExtract, isUploading, isExtracting } = useDocumentUpload();
  const { cartorioId } = useCartorio();

  // Persist state to Firestore using debouncing
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

          saveTimeoutRef.current = setTimeout(async () => {
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
              // Sending an async fetch in beforeunload is unreliable,
              // but we can try to leave the latest state in local storage
              // so it can be picked up later if the user returns.
              // If we truly needed guaranteed remote save on close,
              // we would use `navigator.sendBeacon`.
              localStorage.setItem(`draft_state_${documentId}`, JSON.stringify(cacheObj));

              // If we want to attempt an emergency updateDoc, we can, but it's async.
              // A safer approach is just to rely on localStorage for the gap
              // between the last 30s sync and the unload.
          }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
      };
  }, [resolvedGroundTruth, hasAcknowledgedGroundTruth, resolvedErrors, typedText, validationErrors, interactiveDiffBlocks, correctedText, viewMode, draftId, groundTruth?.document_id]);

  const hasUnresolvedConflicts = () => {
      if (!resolvedGroundTruth || !resolvedGroundTruth.entities) return false;
      for (const entity of resolvedGroundTruth.entities) {
          if (entity._conflicts && Object.keys(entity._conflicts).length > 0) {
              return true;
          }
          if (entity._potential_duplicates && entity._potential_duplicates.length > 0) {
              return true;
          }
      }
      return false;
  };

  const resolveDuplicate = async (entityIndex: number) => {
      if (!resolvedGroundTruth) return;

      const fieldId = `duplicate_${entityIndex}`;
      setResolvingFields(prev => new Set(prev).add(fieldId));

      const newGt = { ...resolvedGroundTruth };
      const entity = newGt.entities[entityIndex];

      const documentId = resolvedGroundTruth?.document_id || 'unknown';
      try {
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
          const response = await fetch(`${ENV.apiUrl}/log_hitl_resolution`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'X-Cartorio-ID': cartorioId || ''
            },
            body: JSON.stringify({
              document_id: documentId,
              field: 'potential_duplicates',
              expected: '',
              found: 'confirmed_separate',
              resolution_type: 'resolved_by_user_pre_validation'
            })
          });

          if (!response.ok) {
              throw new Error(`Falha ao registrar resolução. Status: ${response.status}`);
          }

          delete entity._potential_duplicates;

          setResolvedGroundTruth(newGt);

      } catch (err: any) {
          console.error("Error logging duplicate resolution:", err);
          alert(`Erro ao resolver duplicata: ${err.message}. Por favor, tente novamente.`);
      } finally {
          setResolvingFields(prev => {
              const next = new Set(prev);
              next.delete(fieldId);
              return next;
          });
      }
  };

  const resolveConflict = async (entityIndex: number, field: string, value: string) => {
      if (!resolvedGroundTruth) return;

      const fieldId = `conflict_${entityIndex}_${field}`;
      setResolvingFields(prev => new Set(prev).add(fieldId));

      const newGt = { ...resolvedGroundTruth };
      const entity = newGt.entities[entityIndex];

      const documentId = resolvedGroundTruth?.document_id || 'unknown';
      try {
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
          const response = await fetch(`${ENV.apiUrl}/log_hitl_resolution`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'X-Cartorio-ID': cartorioId || ''
            },
            body: JSON.stringify({
              document_id: documentId,
              field: field,
              expected: '',
              found: value,
              resolution_type: 'resolved_by_user_pre_validation'
            })
          });

          if (!response.ok) {
              throw new Error(`API error: ${response.status}`);
          }

          // Strict pessimistic update
          entity[field] = value;

          if (!entity._resolved_conflicts) {
              entity._resolved_conflicts = [];
          }
          entity._resolved_conflicts.push(field);

          delete entity._conflicts[field];
          setResolvedGroundTruth(newGt);

      } catch(err) {
          console.error("Failed to log pre-validation HitL:", err);
          alert("Falha ao registrar a resolução de conflito. Por favor, tente novamente.");
      } finally {
          setResolvingFields(prev => {
              const next = new Set(prev);
              next.delete(fieldId);
              return next;
          });
      }
  };

  const handleApplyCorrections = async () => {
    if (!validationErrors) return;

    let textToFix = typedText;
    if (inputType === 'upload' && cachedDraftText) {
      textToFix = cachedDraftText.text;
    }

    setIsFormatting(true);
    setServerError(null);
    try {
      const apiUrl = ENV.apiUrl;
      const endpoint = `${apiUrl}/format-draft`;
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Cartorio-ID': cartorioId || ''
        },
        body: JSON.stringify({
          raw_text: textToFix,
          ground_truth: resolvedGroundTruth,
        }),
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(`Erro no servidor: Resposta não está em formato JSON. Corpo: ${responseText.substring(0, 100)}`);
      }
      if (!response.ok) {
        throw new Error(data.error || 'Ocorreu um erro desconhecido durante a formatação.');
      }

      setCorrectedText(data.formatted_text);

      // Parse blocks
      const dmp = new diff_match_patch();
      const tokenize = (text: string) => text.match(/([\s]+|[\d][\d\.\-\/]*[\d]|[\wÀ-ÿ]+|[^\s\wÀ-ÿ]+)/g) || [];
      const tokens1 = tokenize(textToFix);
      const tokens2 = tokenize(data.formatted_text);

      const tokenArray: string[] = [];
      const tokenHash: Record<string, number> = {};

      const encode = (tokens: string[]) => {
          let chars = "";
          for (let i = 0; i < tokens.length; i++) {
              const t = tokens[i];
              if (!(t in tokenHash)) {
                  tokenArray.push(t);
                  tokenHash[t] = tokenArray.length - 1;
              }
              chars += String.fromCharCode(tokenHash[t] + 0xE000); // Use private use area
          }
          return chars;
      };

      const chars1 = encode(tokens1);
      const chars2 = encode(tokens2);

      const diffs = dmp.diff_main(chars1, chars2, false);
      dmp.diff_cleanupSemantic(diffs);

      // Decode and cluster into blocks
      const newBlocks: DiffBlock[] = [];

      for (let i = 0; i < diffs.length; i++) {
          const [op, chars] = diffs[i];
          let text = "";
          for (let j = 0; j < chars.length; j++) {
              text += tokenArray[chars.charCodeAt(j) - 0xE000];
          }

          if (op === 0) { // Equal
             newBlocks.push({
                 id: `block-${i}`,
                 originalText: text,
                 correctedText: text,
                 status: 'pending',
                 isDiff: false
             });
          } else if (op === -1) { // Delete
              // Check if next is an insert (replacement)
              if (i + 1 < diffs.length && diffs[i+1][0] === 1) {
                  const [, nextChars] = diffs[i+1];
                  let nextText = "";
                  for (let j = 0; j < nextChars.length; j++) {
                      nextText += tokenArray[nextChars.charCodeAt(j) - 0xE000];
                  }
                  newBlocks.push({
                      id: `block-${i}-repl`,
                      originalText: text,
                      correctedText: nextText,
                      status: 'pending',
                      isDiff: true
                  });
                  i++; // skip next
              } else { // Just delete
                  newBlocks.push({
                      id: `block-${i}-del`,
                      originalText: text,
                      correctedText: "",
                      status: 'pending',
                      isDiff: true
                  });
              }
          } else if (op === 1) { // Insert
              newBlocks.push({
                  id: `block-${i}-ins`,
                  originalText: "",
                  correctedText: text,
                  status: 'pending',
                  isDiff: true
              });
          }
      }

      setInteractiveDiffBlocks(newBlocks);
      setViewMode('visual_review');
    } catch (error: any) {
      setServerError(error.message || 'Falha ao conectar com o serviço de formatação.');
      console.error('Format error:', error);
    } finally {
      setIsFormatting(false);
    }
  };

  const handleValidate = async () => {
    if (hasUnresolvedConflicts()) {
        alert("Por favor, resolva todos os conflitos antes de prosseguir com a validação.");
        return;
    }

    setIsValidating(true);
    setValidationErrors(null);
    setResolvedErrors(new Set());
    setServerError(null);
    setCorrectedText(null);
    setViewMode('validation');

    let textToValidate = typedText;

    try {
      if (inputType === 'upload' && draftFile) {
        if (cachedDraftText && cachedDraftText.fileName === draftFile.name) {
          textToValidate = cachedDraftText.text;
        } else {
          // Extract text from the uploaded draft document
          const extractedData = await uploadAndExtract(draftFile, 'DRAFT', cartorioId || 'default_cartorio');
          if (extractedData && extractedData.text) {
            textToValidate = extractedData.text;
            setCachedDraftText({fileName: draftFile.name, text: extractedData.text});
          } else {
            throw new Error('Falha ao extrair texto da minuta.');
          }
        }
      }

      if (!textToValidate.trim()) {
         throw new Error('O texto para validação não pode estar vazio.');
      }

      const apiUrl = ENV.apiUrl;
      const endpoint = `${apiUrl}/validate_document_text`;

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Cartorio-ID': cartorioId || ''
        },
        body: JSON.stringify({
          ground_truth: resolvedGroundTruth,
          typed_text: textToValidate,
        }),
      });

      const responseText = await response.text();
      let data: ValidationResponse;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(`Erro no servidor: Resposta não está em formato JSON. Corpo: ${responseText.substring(0, 100)}`);
      }

      if (!response.ok) {
        if (response.status === 429) {
           setServerError('Serviço temporariamente indisponível devido ao alto volume (Rate Limit). Por favor, tente novamente em alguns segundos.');
        } else {
           setServerError(data.error || 'Ocorreu um erro desconhecido durante a validação');
        }
      } else {
        setValidationErrors(data.errors || []);
      }
    } catch (error: any) {
      setServerError(error.message || 'Falha ao conectar com o serviço de validação.');
      console.error('Validation error:', error);
    } finally {
      setIsValidating(false);
    }
  };

  const isButtonDisabled = isValidating || isUploading || isExtracting || !groundTruth || hasUnresolvedConflicts();
  const isProcessing = isValidating || isUploading || isExtracting;

  const handleResolveDiffBlock = (id: string, status: ResolutionStatus, editedText?: string) => {
    setInteractiveDiffBlocks(prev => {
        if (!prev) return prev;
        return prev.map(block => {
            if (block.id === id) {
                return { ...block, status, userEditedText: editedText };
            }
            return block;
        });
    });
  };

  const computeFinalText = () => {
    if (!interactiveDiffBlocks) return correctedText || '';

    return interactiveDiffBlocks.map(block => {
        if (!block.isDiff) return block.originalText;

        switch (block.status) {
            case 'use_pdf': return block.correctedText;
            case 'keep_minuta': return block.originalText;
            case 'edited': return block.userEditedText || block.correctedText;
            case 'pending': return block.correctedText; // default to PDF if unhandled
            default: return block.correctedText;
        }
    }).join('');
  };

  const handleMarkAsResolved = async (error: ValidationError) => {
    try {
      setResolvingFields(prev => {
        const next = new Set(prev);
        next.add(error.field);
        return next;
      });

      const apiUrl = ENV.apiUrl;
      const endpoint = `${apiUrl}/log_hitl_resolution`;

      const documentId = groundTruth?.document_id || 'unknown';

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Cartorio-ID': cartorioId || ''
        },
        body: JSON.stringify({
          document_id: documentId,
          field: error.field,
          expected: error.expected || '',
          found: error.found || '',
          resolution_type: 'resolved_by_user',
        }),
      });

      if (!response.ok) {
        throw new Error(`Falha ao registrar resolução. Status: ${response.status}`);
      }

      // Update local state to mark this field as resolved only if fetch succeeds
      setResolvedErrors(prev => {
        const next = new Set(prev);
        next.add(error.field);
        return next;
      });
    } catch (err: any) {
      console.error("Error logging resolution:", err);
      setServerError(`Erro ao registrar resolução: ${err.message}. Por favor, tente novamente.`);
      // Do not update resolvedErrors, forcing the user to retry and locking the pipeline
    } finally {
      setResolvingFields(prev => {
        const next = new Set(prev);
        next.delete(error.field);
        return next;
      });
    }
  };

  const [isFinalizing, setIsFinalizing] = useState(false);
  const handleFinalizeValidation = async () => {
      setIsFinalizing(true);
      setServerError(null);

      const documentId = draftId || groundTruth?.document_id;
      if (!documentId) {
          setServerError("ID do documento não encontrado. Por favor, tente enviar novamente.");
          setIsFinalizing(false);
          return;
      }

      try {
          const apiUrl = ENV.apiUrl;
          const endpoint = `${apiUrl}/finalize_validation`;
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';

          const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                  'X-Cartorio-ID': cartorioId || ''
              },
              body: JSON.stringify({
                  document_id: documentId,
                  final_text: computeFinalText(),
              })
          });

          if (!response.ok) {
              const data = await response.json();
              throw new Error(data.error || 'Falha ao finalizar validação.');
          }

          alert("Validação concluída com sucesso! Minuta pronta para o Módulo 2.");
          if (onValidationComplete) {
              onValidationComplete();
          }

      } catch (err: any) {
          console.error("Failed to finalize:", err);
          setServerError(`Erro ao finalizar: ${err.message}`);
      } finally {
          setIsFinalizing(false);
      }
  };

  return (
    <div className="h-full bg-white border border-gray-300 rounded-lg shadow-sm flex flex-col overflow-hidden">
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex justify-between items-center">
        <h2 className="text-sm font-semibold text-gray-700">Área de Validação (Minuta)</h2>
        <div className="flex bg-white rounded-md border border-gray-300 p-0.5">
          <button
            onClick={() => setInputType('upload')}
            className={`px-3 py-1 text-xs font-medium rounded-sm ${inputType === 'upload' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Upload de Minuta
          </button>
          <button
            onClick={() => setInputType('typing')}
            className={`px-3 py-1 text-xs font-medium rounded-sm ${inputType === 'typing' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Digitar Texto
          </button>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col relative">

        {groundTruth && !hasAcknowledgedGroundTruth && (
          hasUnresolvedConflicts() ? (
            <div className="mb-4 bg-orange-50 border-l-4 border-orange-400 p-4 rounded shadow-sm">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-orange-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3 w-full">
                        <h3 className="text-sm font-medium text-orange-800">Conflito de Dados Detectado</h3>
                        <div className="mt-2 text-sm text-orange-700">
                            <p>Existem dados conflitantes entre os documentos enviados. Por favor, selecione o valor correto antes de prosseguir.</p>
                            <div className="mt-3 flex flex-col gap-3">
                                {resolvedGroundTruth?.entities?.map((entity: any, eIdx: number) => {
                                    if (!entity._conflicts || Object.keys(entity._conflicts).length === 0) return null;
                                    return Object.entries(entity._conflicts).map(([field, conflictData]: [string, any], cIdx) => (
                                        <div key={`${eIdx}-${field}-${cIdx}`} className="bg-white p-3 rounded border border-orange-200">
                                            <p className="font-semibold capitalize mb-2">{entity.nome} - {field.replace('_', ' ')}:</p>
                                            <div className="flex flex-col gap-2">
                                                {conflictData.options.map((opt: any, oIdx: number) => (
                                                    <button
                                                        key={oIdx}
                                                        onClick={() => resolveConflict(eIdx, field, opt.value)}
                                                        disabled={resolvingFields.has(`conflict_${eIdx}_${field}`)}
                                                        className={`text-left px-3 py-2 border border-orange-300 rounded transition-colors ${resolvingFields.has(`conflict_${eIdx}_${field}`) ? 'bg-orange-200 cursor-not-allowed' : 'hover:bg-orange-100'}`}
                                                    >
                                                        {resolvingFields.has(`conflict_${eIdx}_${field}`) ? (
                                                            <span className="text-orange-700 font-medium">Resolvendo...</span>
                                                        ) : (
                                                            <>
                                                                <span className="font-medium">{opt.value}</span>
                                                                <span className="text-xs text-orange-600 ml-2">(Fonte: {opt.source})</span>
                                                            </>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ));
                                })}
                                {resolvedGroundTruth?.entities?.map((entity: any, eIdx: number) => {
                                    if (!entity._potential_duplicates || entity._potential_duplicates.length === 0) return null;
                                    return (
                                        <div key={`dup-${eIdx}`} className="bg-white p-4 rounded border border-yellow-300 mt-4 shadow-sm">
                                            <h4 className="font-bold text-yellow-900 mb-2">Possíveis Entidades Duplicadas Detectadas</h4>
                                            <p className="text-sm text-yellow-800 mb-3">
                                                O sistema encontrou entidades muito semelhantes a <span className="font-semibold">{entity.entity_name || entity.nome}</span>, mas não conseguiu mesclá-las automaticamente.
                                            </p>
                                            <div className="bg-yellow-50 p-2 rounded border border-yellow-200 mb-3">
                                                <p className="text-xs text-yellow-700 font-semibold mb-1">Entidades possivelmente iguais:</p>
                                                <ul className="list-disc list-inside text-sm text-yellow-900">
                                                    {entity._potential_duplicates.map((dupName: string, dIdx: number) => (
                                                        <li key={dIdx}>{dupName}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <button
                                                onClick={() => resolveDuplicate(eIdx)}
                                                disabled={resolvingFields.has(`duplicate_${eIdx}`)}
                                                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${resolvingFields.has(`duplicate_${eIdx}`) ? 'bg-yellow-400 cursor-not-allowed' : 'bg-yellow-600 hover:bg-yellow-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500`}
                                            >
                                                {resolvingFields.has(`duplicate_${eIdx}`) ? 'Confirmando...' : 'Confirmar como Entidades Separadas'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          ) : (
            <div className="mb-4 bg-green-50 border-l-4 border-green-500 p-4 rounded shadow-sm">
              <div className="flex flex-col items-start h-full">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">Sucesso na Extração</h3>
                    <p className="text-sm text-green-700 mt-1">
                      Extração concluída. Todos os dados das fontes foram consolidados com sucesso (Nenhum conflito manual detectado).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHasAcknowledgedGroundTruth(true)}
                  className="mt-2 ml-9 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Prosseguir para Validação da Minuta
                </button>
              </div>
            </div>
          )
        )}

         {isProcessing && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <svg className="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-700 font-medium">
              {isUploading ? 'Enviando minuta...' : isExtracting ? 'Lendo minuta com IA...' : 'Validando dados...'}
            </p>
          </div>
        )}

        {(!groundTruth || hasAcknowledgedGroundTruth) && (!validationErrors && !serverError) && (
          <>
            {inputType === 'upload' ? (
              <div
                className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-md p-6 bg-gray-50 hover:bg-gray-100 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    setDraftFile(e.dataTransfer.files[0]);
                  }
                }}
              >
                 <input
                  id="file-upload"
                  type="file"
                  accept=".doc,.docx,.pdf,application/msword,application/pdf"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files && setDraftFile(e.target.files[0])}
                  className="hidden"
                />
                <div className="text-center">
                   <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                   </svg>
                   <div className="mt-4 flex text-sm text-gray-600 justify-center">
                     <label htmlFor="file-upload" className="relative cursor-pointer font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                        <span>Selecione um arquivo</span>
                     </label>
                     <p className="pl-1">ou arraste e solte</p>
                   </div>
                   <p className="text-xs text-gray-500 mt-2">Word (DOC/DOCX) ou PDF</p>
                </div>
                {draftFile && (
                  <div className="mt-4 p-2 bg-blue-50 rounded border border-blue-200 text-sm text-blue-700 text-center w-full truncate">
                    Arquivo selecionado: {draftFile.name}
                  </div>
                )}
              </div>
            ) : (
              <textarea
                id="typed-text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                className="w-full h-32 border border-gray-300 rounded-md shadow-sm p-3 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm"
                placeholder="Digite ou cole o texto do documento aqui..."
                disabled={isValidating}
              />
            )}

            <div className="mt-4 flex justify-between items-center">
              {!groundTruth ? (
                <span className="text-sm text-yellow-600 bg-yellow-50 px-2 py-1 rounded border border-yellow-200">
                  Por favor, adicione documentos fonte primeiro.
                </span>
              ) : hasUnresolvedConflicts() ? (
                <span className="text-sm text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                  Validação pausada: Por favor, resolva os conflitos nos documentos acima.
                </span>
              ) : (
                <span></span>
              )}
              <button
                type="button"
                onClick={handleValidate}
                disabled={isButtonDisabled}
                className={`ml-auto inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                  isButtonDisabled
                    ? 'bg-blue-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }`}
              >
                {isProcessing ? 'Processando...' : 'Validar Minuta'}
              </button>
            </div>
          </>
        )}

        <div className="mt-6 border-t border-gray-200 pt-4 overflow-y-auto flex-1 flex flex-col">
          <div className="flex justify-between items-center mb-3">
             <div className="flex space-x-2">
                <button
                  onClick={() => setViewMode('validation')}
                  className={`text-sm font-medium px-3 py-1.5 rounded-md ${viewMode === 'validation' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  Validação
                </button>
                <button
                  onClick={() => setViewMode('visual_review')}
                  disabled={!correctedText}
                  className={`text-sm font-medium px-3 py-1.5 rounded-md ${viewMode === 'visual_review' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'} ${!correctedText ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Revisão Visual
                </button>
                <button
                  onClick={() => setViewMode('corrected')}
                  disabled={!correctedText}
                  className={`text-sm font-medium px-3 py-1.5 rounded-md ${viewMode === 'corrected' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'} ${!correctedText ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Minuta Corrigida
                </button>
             </div>
             {validationErrors && validationErrors.length > 0 && viewMode === 'validation' && (
                <button
                  onClick={handleApplyCorrections}
                  disabled={isFormatting}
                  className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded shadow-sm text-white bg-green-600 hover:bg-green-700 ${isFormatting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <svg className="-ml-0.5 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {isFormatting ? 'Formatando...' : 'Aplicar Correções Seguras'}
                </button>
             )}

             {viewMode === 'corrected' && (
                <button
                  onClick={handleFinalizeValidation}
                  disabled={isFinalizing}
                  className={`inline-flex items-center px-4 py-2 text-sm font-bold rounded shadow-sm text-white bg-blue-600 hover:bg-blue-700 ${isFinalizing ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isFinalizing ? 'Finalizando...' : 'Finalizar Validação'}
                </button>
             )}
          </div>

          {viewMode === 'visual_review' && interactiveDiffBlocks && (
            <div className="flex-1 flex flex-col p-4 border border-gray-300 bg-white rounded-md overflow-y-auto whitespace-pre-wrap font-mono text-sm leading-relaxed">
              <div className="mb-4 bg-blue-50 border border-blue-200 p-2 rounded text-blue-800 text-xs">
                <strong>Instrução:</strong> Analise as divergências abaixo. Escolha se deseja aplicar a sugestão baseada no documento fonte ("USAR PDF"), manter o texto original ("MANTER") ou editar manualmente ("EDITAR").
              </div>
              <div>
                {interactiveDiffBlocks.map(block => (
                  <InteractiveDiffWidget
                    key={block.id}
                    block={block}
                    onResolve={handleResolveDiffBlock}
                  />
                ))}
              </div>
            </div>
          )}

          {viewMode === 'corrected' && interactiveDiffBlocks && (
            <div className="flex-1 flex flex-col relative h-full overflow-hidden">
               <textarea
                 readOnly
                 value={computeFinalText()}
                 className="flex-1 w-full p-4 border border-green-300 bg-green-50 rounded-md font-mono text-sm resize-none"
               />
               <div className="mt-2 text-right shrink-0">
                  <button onClick={() => { navigator.clipboard.writeText(computeFinalText()); alert('Copiado!')}} className="text-sm text-blue-600 hover:underline">
                    Copiar Tudo
                  </button>
               </div>
            </div>
          )}

          {viewMode === 'validation' && (
            <>
          {serverError && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700 font-bold">Erro no Servidor</p>
                  <p className="text-sm text-red-600 mt-1">{serverError}</p>
                </div>
              </div>
            </div>
          )}

          {validationErrors === null && !serverError ? (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-center text-gray-500 text-sm">
              Aguardando validação...
            </div>
          ) : validationErrors && validationErrors.length === 0 ? (
            <div className="bg-green-50 border-l-4 border-green-500 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-green-700 font-bold">Sucesso!</p>
                  <p className="text-sm text-green-600 mt-1">Nenhuma divergência encontrada entre a minuta e os documentos fonte.</p>
                </div>
              </div>
            </div>
          ) : (
            validationErrors && validationErrors.length > 0 && (
              <div className="flex flex-col space-y-6">
                <div>
                  <div className="bg-red-50 border-l-4 border-red-500 p-3 mb-4">
                    <p className="text-sm text-red-700 font-bold">Ação Necessária: Divergências Encontradas</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {validationErrors.map((error, idx) => {
                      const isMissing = error.category === 'MISSING_FIELD';
                      const isUnmatched = error.category === 'UNMATCHED_ENTITY';

                      let cardColor = "border-red-200 bg-white";
                      let badgeColor = "bg-red-100 text-red-800";

                      if (isMissing) {
                        cardColor = "border-orange-200 bg-white";
                        badgeColor = "bg-orange-100 text-orange-800";
                      } else if (isUnmatched) {
                        cardColor = "border-purple-200 bg-white";
                        badgeColor = "bg-purple-100 text-purple-800";
                      }

                      const isResolved = resolvedErrors.has(error.field);

                      if (isResolved) return null;

                      return (
                        <div key={idx} className={`border rounded-lg shadow-sm p-4 ${cardColor} relative overflow-hidden`}>
                          {error.requires_human_review && (
                             <div className="absolute top-0 right-0 bg-yellow-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg shadow-sm">
                               Revisão Humana Necessária
                             </div>
                          )}
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeColor} mb-2`}>
                                {error.category === 'VALUE_MISMATCH' ? 'DIVERGÊNCIA DE VALOR' :
                                 error.category === 'MISSING_FIELD' ? 'CAMPO AUSENTE' :
                                 error.category === 'UNMATCHED_ENTITY' ? 'ENTIDADE NÃO ENCONTRADA' :
                                 (error.category as string).replace('_', ' ')}
                              </span>
                              <h4 className="text-sm font-bold text-gray-900 uppercase">
                                {(() => {
                                  const fieldLabels: Record<string, string> = {
                                    "nome": "Nome",
                                    "cpf": "CPF",
                                    "rg": "RG",
                                    "orgao_emissor_rg": "Órgão Emissor do RG",
                                    "data_nascimento": "Data de Nascimento",
                                    "estado_civil": "Estado Civil",
                                    "filiacao_mae": "Filiação (Mãe)",
                                    "filiacao_pai": "Filiação (Pai)",
                                    "naturalidade": "Naturalidade",
                                    "nacionalidade": "Nacionalidade",
                                    "profissao": "Profissão",
                                    "endereco": "Endereço",
                                    "regime_bens": "Regime de Bens"
                                  };

                                  if (error.entity_name) {
                                     const rawAttribute = error.field.split('.').pop() || '';
                                     const attribute = fieldLabels[rawAttribute] || rawAttribute;
                                     return `${error.entity_name} - ${attribute}`;
                                  }

                                  const entityMatch = error.field.match(/^entities\[(\d+)\]\.(.*)/);
                                  if (entityMatch) {
                                    const index = parseInt(entityMatch[1]);
                                    const rawAttribute = entityMatch[2];
                                    const attribute = fieldLabels[rawAttribute] || rawAttribute;
                                    return `ENTIDADE ${index + 1} - ${attribute}`;
                                  }

                                  return error.field.replace(/^document_metadata\./, 'METADADOS - ');
                                })()}
                              </h4>
                            </div>
                          </div>

                          <p className="text-sm text-gray-600 mb-2">{error.message}</p>

                          {error.requires_human_review && error.review_reason && (
                            <p className="text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 p-2 rounded mb-4">
                               <span className="font-bold">Motivo da incerteza:</span> {error.review_reason}
                            </p>
                          )}

                          <div className="bg-gray-50 rounded p-3 text-sm grid grid-cols-2 gap-4">
                            <div>
                              <span className="block text-xs font-medium text-gray-500 mb-1">O que está na minuta:</span>
                              {error.found ? (
                                <span className="text-red-700 font-mono break-all bg-red-50 px-2 py-1 rounded line-through decoration-red-500 decoration-2">{error.found}</span>
                              ) : (
                                <span className="text-gray-400 italic">Não encontrado</span>
                              )}
                            </div>
                            <div>
                              <span className="block text-xs font-medium text-gray-500 mb-1">O que deveria ser (Documento Fonte):</span>
                              {error.expected ? (
                                <span className="text-green-700 font-mono break-all bg-green-50 px-2 py-1 rounded border border-green-200">{error.expected}</span>
                              ) : (
                                <span className="text-gray-400 italic">-</span>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 flex justify-end space-x-3 border-t border-gray-100 pt-3">
                            {error.expected && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (error.expected) {
                                    navigator.clipboard.writeText(error.expected);
                                    alert('Valor copiado para a área de transferência!');
                                  }
                                }}
                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                              >
                                <svg className="-ml-0.5 mr-2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Copiar Valor Correto
                              </button>
                            )}
                            <button
                                type="button"
                                onClick={() => handleMarkAsResolved(error)}
                                disabled={resolvingFields.has(error.field)}
                                className={`inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-xs font-medium rounded text-white ${resolvingFields.has(error.field) ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                              >
                                {resolvingFields.has(error.field) ? (
                                  <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Resolvendo...
                                  </>
                                ) : (
                                  <>
                                    <svg className="-ml-0.5 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Marcar como Resolvido
                                  </>
                                )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              </div>
            )
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataChecker;
