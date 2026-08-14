import React from 'react';
import { getEntityDisplayName } from '../../../utils/entityResolver';

interface Props {
  template: any;
  groundTruth: any;
  roleSelections: Record<string, any>;
  onSelectRole: (roleName: string, entity: any) => void;
  onNext: () => void;
  onPrev: () => void;
}

const Step2_RoleMapping: React.FC<Props> = ({ template, groundTruth, roleSelections, onSelectRole, onNext, onPrev }) => {
  const rolesSchema = template.roles_schema || [];

  // Extract entities from groundTruth. Format varies depending on backend extraction.
  // Ground truth could have `.entities` or be flat.
  const extractedData = groundTruth?.human_final_data || groundTruth?.ai_extracted_data || groundTruth || {};
  let availableEntities: any[] = [];

  if (Array.isArray(extractedData.entities)) {
      availableEntities = extractedData.entities;
  } else if (Array.isArray(extractedData.pessoas)) {
      availableEntities = extractedData.pessoas;
  }

  const renderEntityOption = (entity: any) => {
    // Make a best guess on what to show as the label
    const name = getEntityDisplayName(entity);
    const doc = entity.cpf || entity.cnpj || entity.matricula || "";
    return doc ? `${name} (${doc})` : name;
  };

  const handleRoleChange = (roleName: string, entityIndexStr: string) => {
      if (entityIndexStr === "") {
          onSelectRole(roleName, null);
      } else {
          const entity = availableEntities[parseInt(entityIndexStr, 10)];
          onSelectRole(roleName, entity);
      }
  };

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Mapeamento de Papéis (Roles)</h2>

      {rolesSchema.length === 0 ? (
          <div className="text-sm text-gray-500 italic mb-4">
              Nenhum papel definido neste template. Você preencherá as tags manualmente no próximo passo.
          </div>
      ) : (
          <div className="space-y-4 mb-4">
              {rolesSchema.map((roleDef: any, idx: number) => {
                  const roleName = roleDef.role;
                  // In a real scenario we might filter availableEntities by roleDef.expected_entity_type

                  // Find the currently selected entity index, if any
                  let selectedIdx = "";
                  if (roleSelections[roleName]) {
                      const selectedEntityStr = JSON.stringify(roleSelections[roleName]);
                      const foundIdx = availableEntities.findIndex(e => JSON.stringify(e) === selectedEntityStr);
                      if (foundIdx !== -1) selectedIdx = foundIdx.toString();
                  }

                  return (
                      <div key={idx} className="p-3 border rounded bg-gray-50">
                          <label className="block text-xs font-bold text-gray-700 mb-1">{roleName}</label>
                          <select
                              value={selectedIdx}
                              onChange={(e) => handleRoleChange(roleName, e.target.value)}
                              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-xs px-2 py-1 border"
                          >
                              <option value="">-- Selecione uma entidade --</option>
                              {availableEntities.map((ent, entIdx) => (
                                  <option key={entIdx} value={entIdx}>
                                      {renderEntityOption(ent)}
                                  </option>
                              ))}
                          </select>
                      </div>
                  );
              })}
          </div>
      )}

      <div className="mt-auto pt-4 flex justify-between">
        <button
          onClick={onPrev}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-bold rounded hover:bg-gray-300 transition-colors"
        >
          Voltar
        </button>
        <button
          onClick={onNext}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 transition-colors"
        >
          Próximo
        </button>
      </div>
    </div>
  );
};

export default Step2_RoleMapping;
