import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ENV } from '../config/env';
import { auth } from '../utils/firebase';

interface ExtractionReviewPanelProps {
  resolvedGroundTruth: any;
  setResolvedGroundTruth: (gt: any) => void;
  hasAcknowledgedGroundTruth: boolean;
  setHasAcknowledgedGroundTruth: (acked: boolean) => void;
  hasUnresolvedConflicts: () => boolean;
}

const ExtractionReviewPanel: React.FC<ExtractionReviewPanelProps> = ({
  resolvedGroundTruth,
  setResolvedGroundTruth,
  hasAcknowledgedGroundTruth,
  setHasAcknowledgedGroundTruth,
  hasUnresolvedConflicts
}) => {
  const { cartorioId } = useAuth();
  const [resolvingFields, setResolvingFields] = useState<Set<string>>(new Set());

  if (!resolvedGroundTruth || hasAcknowledgedGroundTruth) {
    return null; // Don't render if there's no ground truth or it's already acknowledged
  }

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

    } catch (err) {
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

  if (hasUnresolvedConflicts()) {
    return (
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
    );
  }

  return (
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
          Prosseguir para Próxima Etapa
        </button>
      </div>
    </div>
  );
};

export default ExtractionReviewPanel;
