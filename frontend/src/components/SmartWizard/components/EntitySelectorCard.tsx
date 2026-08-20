import React from 'react';

interface EntitySelectorCardProps {
  groundTruth: any;
  selectedEntityId: string | null;
  onSelect: (entityId: string) => void;
  label?: string;
}

const EntitySelectorCard: React.FC<EntitySelectorCardProps> = ({ groundTruth, selectedEntityId, onSelect, label = 'Selecione uma entidade' }) => {
  const entities = groundTruth?.entities || groundTruth?._contexto_extraido?.entities || [];

  return (
    <div className="border border-gray-200 rounded-md p-3 bg-white shadow-sm mb-3">
      <label className="block text-xs font-semibold text-gray-700 mb-2">{label}</label>
      <div className="grid gap-2">
        {entities.length > 0 ? (
          entities.map((ent: any) => {
            const name = ent.nome || ent.razao_social || ent.name || ent.entity_name || ent.id;
            const isSelected = selectedEntityId === ent.id;
            return (
              <div
                key={ent.id}
                onClick={() => onSelect(ent.id)}
                className={`cursor-pointer flex items-center justify-between p-2 rounded-md border text-sm transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className="font-medium truncate">{name}</div>
                {isSelected && (
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-xs text-gray-500 italic">Nenhuma entidade disponível no contexto.</div>
        )}
      </div>
    </div>
  );
};

export default EntitySelectorCard;
