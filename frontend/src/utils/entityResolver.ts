export const getEntityDisplayName = (entity: any): string => {
  if (!entity) return "Entidade Sem Nome";

  // Check common root-level properties
  const rootName = entity.nome || entity.razao_social || entity.nome_fantasia || entity.descricao;
  if (rootName && typeof rootName === 'string' && rootName.trim() !== '') {
    return rootName.trim();
  }

  // If the entity has nested attributes (like in some JSON structures where it's an array of key-value objects)
  if (Array.isArray(entity.attributes)) {
    for (const attr of entity.attributes) {
      if (attr.name && (attr.name.toLowerCase() === 'nome' || attr.name.toLowerCase() === 'razao_social' || attr.name.toLowerCase() === 'razao social')) {
         if (attr.value && typeof attr.value === 'string' && attr.value.trim() !== '') {
            return attr.value.trim();
         }
      }
    }
  }

  // Iterate over all keys to find a potential name if nothing else matches
  for (const key of Object.keys(entity)) {
    if (key.toLowerCase().includes('nome') || key.toLowerCase().includes('razao_social') || key.toLowerCase().includes('razaosocial')) {
      const val = entity[key];
      if (val && typeof val === 'string' && val.trim() !== '') {
        return val.trim();
      }
    }
  }

  return "Entidade Sem Nome";
};
