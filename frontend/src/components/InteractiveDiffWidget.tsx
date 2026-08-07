import React, { useState, useEffect } from 'react';
import { diff_match_patch } from 'diff-match-patch';

export type ResolutionStatus = 'pending' | 'use_pdf' | 'keep_minuta' | 'edited';

export interface DiffBlock {
  id: string;
  originalText: string;
  correctedText: string;
  status: ResolutionStatus;
  userEditedText?: string;
  isDiff: boolean;
}

interface InteractiveDiffWidgetProps {
  block: DiffBlock;
  onResolve: (id: string, status: ResolutionStatus, editedText?: string) => void;
}

const InteractiveDiffWidget: React.FC<InteractiveDiffWidgetProps> = ({ block, onResolve }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(block.userEditedText || block.correctedText);

  // When block updates (e.g. from parent re-rendering), ensure local state syncs if needed
  useEffect(() => {
    if (block.status !== 'edited') {
      setEditText(block.correctedText);
    }
  }, [block]);

  // If not a diff block, just render plain text
  if (!block.isDiff) {
    return <span>{block.originalText}</span>;
  }

  // Calculate micro character diff between original (minuta) and corrected (PDF logic)
  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(block.originalText, block.correctedText);
  dmp.diff_cleanupSemantic(diffs);

  const renderDiff = () => {
    return diffs.map((part, index) => {
      const [op, text] = part;
      if (op === 1) { // Insert (from PDF logic)
        return <ins key={index} className="text-green-700 bg-green-100 font-bold px-0.5 mx-0.5 no-underline rounded">{text}</ins>;
      } else if (op === -1) { // Delete (from Minuta)
        return <del key={index} className="text-red-500 bg-red-100 line-through px-0.5 mx-0.5 rounded">{text}</del>;
      } else { // Equal
        return <span key={index}>{text}</span>;
      }
    });
  };

  const handleEditSubmit = () => {
    onResolve(block.id, 'edited', editText);
    setIsEditing(false);
  };

  const getBorderClass = () => {
    if (block.status === 'use_pdf') return 'border-green-400 bg-green-50';
    if (block.status === 'keep_minuta') return 'border-red-300 bg-red-50';
    if (block.status === 'edited') return 'border-blue-400 bg-blue-50';
    return 'border-yellow-400 bg-yellow-50'; // pending
  };

  return (
    <span className={`inline-flex flex-col border rounded p-1 mx-1 my-1 shadow-sm align-middle min-w-[200px] ${getBorderClass()}`}>
      {isEditing ? (
        <div className="flex flex-col gap-1">
          <input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <div className="flex gap-1 justify-end">
            <button
              onClick={() => setIsEditing(false)}
              className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded"
            >
              Cancelar
            </button>
            <button
              onClick={handleEditSubmit}
              className="px-2 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded"
            >
              Salvar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="font-mono text-sm break-words whitespace-pre-wrap mb-1">
            {block.status === 'pending' && renderDiff()}
            {block.status === 'use_pdf' && <span className="text-green-800 font-bold">{block.correctedText}</span>}
            {block.status === 'keep_minuta' && <span className="text-red-800">{block.originalText}</span>}
            {block.status === 'edited' && <span className="text-blue-800 italic">{block.userEditedText}</span>}
          </div>

          <div className="flex gap-1 border-t border-gray-200 pt-1 mt-1">
            <button
              onClick={() => onResolve(block.id, 'use_pdf')}
              className={`flex-1 px-1.5 py-1 text-[10px] font-bold uppercase rounded transition-colors ${block.status === 'use_pdf' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
              title="Usar correção sugerida pelo documento fonte (PDF)"
            >
              Usar PDF
            </button>
            <button
              onClick={() => onResolve(block.id, 'keep_minuta')}
              className={`flex-1 px-1.5 py-1 text-[10px] font-bold uppercase rounded transition-colors ${block.status === 'keep_minuta' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
              title="Manter o texto original da minuta"
            >
              Manter
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className={`flex-1 px-1.5 py-1 text-[10px] font-bold uppercase rounded transition-colors ${block.status === 'edited' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              title="Editar manualmente"
            >
              Editar
            </button>
          </div>
        </>
      )}
    </span>
  );
};

export default InteractiveDiffWidget;
