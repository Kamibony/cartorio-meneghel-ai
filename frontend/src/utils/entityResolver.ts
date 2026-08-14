export const getEntityDisplayName = (entity: any): string => {
  if (!entity) return "Entidade Sem Nome";

  // 1. Check correct root-level properties
  const rootName = entity.entity_name || entity.nome || entity.razao_social || entity.nome_fantasia || entity.name;
  if (rootName && typeof rootName === 'string' && rootName.trim() !== '') {
    return rootName.trim();
  }

  // 2. Check nested attributes correctly (using attr.key, not attr.name)
  if (Array.isArray(entity.attributes)) {
    for (const attr of entity.attributes) {
      if (attr.key && (attr.key.toLowerCase() === 'nome' || attr.key.toLowerCase() === 'razao_social' || attr.key.toLowerCase() === 'razao social')) {
         if (attr.value && typeof attr.value === 'string' && attr.value.trim() !== '') {
            return attr.value.trim();
         }
      }
    }
  }

  // 3. Iterate over all keys (checking for both 'nome' and 'name')
  for (const key of Object.keys(entity)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('nome') || lowerKey.includes('name') || lowerKey.includes('razao_social')) {
      const val = entity[key];
      if (val && typeof val === 'string' && val.trim() !== '') {
        return val.trim();
      }
    }
  }

  return "Entidade Sem Nome";
};
