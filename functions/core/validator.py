import re
import unicodedata
from typing import Dict, Any, List

def normalize_digits(text: str) -> str:
    """Strip all non-numeric characters (keeps X/x for RG)."""
    if not isinstance(text, str):
        text = str(text)
    return re.sub(r'[^0-9X]', '', text.upper())

STATE_MAPPING = {
    "ACRE": "AC", "ALAGOAS": "AL", "AMAPA": "AP", "AMAZONAS": "AM", "BAHIA": "BA",
    "CEARA": "CE", "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", "GOIAS": "GO",
    "MARANHAO": "MA", "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG",
    "PARA": "PA", "PARAIBA": "PB", "PARANA": "PR", "PERNAMBUCO": "PE", "PIAUI": "PI",
    "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS",
    "RONDONIA": "RO", "RORAIMA": "RR", "SANTA CATARINA": "SC", "SAO PAULO": "SP",
    "SERGIPE": "SE", "TOCANTINS": "TO"
}

def normalize_date(text: str) -> str:
    """Attempt to parse various date formats into YYYY-MM-DD."""
    if not text:
        return ""

    text = str(text).strip()

    # Check for DD/MM/YYYY or DD-MM-YYYY
    match = re.match(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$', text)
    if match:
        day, month, year = match.groups()
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"

    # Check for YYYY-MM-DD or YYYY/MM/DD
    match = re.match(r'^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$', text)
    if match:
        year, month, day = match.groups()
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"

    return text

def normalize_list_or_string(item: Any) -> List[str]:
    """Coerce lists and strings into a sorted list of normalized strings."""
    if item is None:
        return []

    if isinstance(item, list):
        items = [str(x) for x in item]
    else:
        text = str(item)
        # Split by common separators: comma, ' e ', ' and ', ' ou '
        items = re.split(r',|\s+e\s+|\s+and\s+|\s+ou\s+', text, flags=re.IGNORECASE)

    normalized_items = [normalize_string(i.strip()) for i in items if i.strip()]
    normalized_items.sort()
    return normalized_items

def normalize_string(text: str) -> str:
    """Uppercase, remove extra spaces, strip accents, and apply smart normalization."""
    if not isinstance(text, str):
        text = str(text)
    text = text.upper()

    # Strip gender suffixes like (A) or (O/A)
    text = re.sub(r'\([AO](/[AO])?\)', '', text)

    # Strip trailing state slashes (e.g., JOAO PESSOA/PB -> JOAO PESSOA)
    text = re.sub(r'/[A-Z]{2}$', '', text)

    # Strip accents
    text = ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    # Remove extra spaces
    text = re.sub(r'\s+', ' ', text).strip()

    # Map full state names to acronyms
    if text in STATE_MAPPING:
        text = STATE_MAPPING[text]

    return text


CORE_IDENTITY_FIELDS = {
    "nome",
    "cpf",
    "rg",
    "data_nascimento",
    "estado_civil",
    "filiacao",
    "filiacao_mae",
    "filiacao_pai",
    "nome_mae",
    "nome_pai",
    "naturalidade",
    "nacionalidade",
    "cidade_expedicao",
    "estado_expedicao",
    "cpf_requerente",
    "nome_requerente",
    "conjuge",
    "nome_conjuge"
}

# Keys to strictly exclude (notary metadata, fees, footers)
NOTARY_METADATA_KEYS = {
    "emolumentos", "emolumento", "selo_digital", "selo", "cartorio_endereco",
    "nome_escrevente", "escrevente", "data_emissao", "cartorio", "endereco",
    "livro", "folha", "termo", "matricula", "averbacao", "anotacao",
    "observacao", "observacoes", "rodape", "assinatura"
}

class DocumentValidator:
    """
    Deterministically cross-checks structured ground truth data against a typed text string
    using a hybrid approach:
      1. Extract structured data from `typed_text` via LLM into a JSON matching `ground_truth`.
      2. Deterministically compare the extracted JSON to the `ground_truth` using pure Python.
    """
    def __init__(self, ground_truth: Dict[str, Any], typed_text: str):
        self.ground_truth = ground_truth.copy()

        if "document_metadata" in self.ground_truth and isinstance(self.ground_truth["document_metadata"], dict):
            filtered_metadata = {}
            for key, value in self.ground_truth["document_metadata"].items():
                key_lower = key.lower()
                if not any(meta_key in key_lower for meta_key in NOTARY_METADATA_KEYS):
                    filtered_metadata[key] = value
            self.ground_truth["document_metadata"] = filtered_metadata

        self.typed_text = typed_text
        self.errors = []
        self._extractor_instance = None

    def validate(self) -> List[Dict[str, str]]:
        self.errors = []

        # 1. Extract draft data using LLM
        from core.extractor import DocumentExtractor
        if self._extractor_instance is None:
            self._extractor_instance = DocumentExtractor()

        # Build schema to pass to extractor
        is_nested = "document_metadata" in self.ground_truth or "entities" in self.ground_truth

        if is_nested:
            schema = {}
            if "document_metadata" in self.ground_truth:
                schema["document_metadata"] = list(self.ground_truth["document_metadata"].keys())
            if "entities" in self.ground_truth and isinstance(self.ground_truth["entities"], list) and len(self.ground_truth["entities"]) > 0:
                # Aggregate all unique keys from all entities
                entity_keys = set()
                for entity in self.ground_truth["entities"]:
                    if isinstance(entity, dict):
                        entity_keys.update(entity.keys())
                schema["entities"] = list(entity_keys)
        else:
            # Legacy flat schema
            schema = list(self.ground_truth.keys())

        draft_json = self._extractor_instance.extract_from_text(self.typed_text, schema)

        # 2. Deterministic validation

        # Validate metadata if present
        if "document_metadata" in self.ground_truth:
             draft_metadata = draft_json.get("document_metadata", {})
             self._validate_node("document_metadata", self.ground_truth["document_metadata"], draft_metadata)

        # Validate entities if present
        if "entities" in self.ground_truth and isinstance(self.ground_truth["entities"], list):
            draft_entities = draft_json.get("entities", [])
            if not isinstance(draft_entities, list):
                draft_entities = []

            # Match entities sequentially for testing if strict matching fails
            # In a real scenario, we might want a more robust assignment problem solution
            # Try to match entities by CPF, then by name, then by index as fallback
            used_draft_indices = set()
            for i, gt_entity in enumerate(self.ground_truth["entities"]):
                matched_draft_entity = None
                matched_draft_index = -1

                gt_cpf = normalize_digits(str(gt_entity.get("cpf", "")))
                if not gt_cpf: # Try alternative keys for CPF
                    gt_cpf = normalize_digits(str(gt_entity.get("cpf_requerente", "")))

                gt_nome = normalize_string(str(gt_entity.get("nome", "")))
                if not gt_nome: # Try alternative keys for Nome
                    gt_nome = normalize_string(str(gt_entity.get("nome_requerente", "")))
                    if not gt_nome:
                        gt_nome = normalize_string(str(gt_entity.get("nome_vendedor_1", ""))) # Just examples

                # Match by CPF first
                if gt_cpf:
                    for j, d_entity in enumerate(draft_entities):
                        if j in used_draft_indices:
                            continue
                        d_cpf = normalize_digits(str(d_entity.get("cpf", "")))
                        if not d_cpf:
                             d_cpf = normalize_digits(str(d_entity.get("cpf_requerente", "")))
                        if d_cpf == gt_cpf:
                            matched_draft_entity = d_entity
                            matched_draft_index = j
                            break

                # Fallback to name match
                if not matched_draft_entity and gt_nome:
                    for j, d_entity in enumerate(draft_entities):
                        if j in used_draft_indices:
                            continue
                        d_nome = normalize_string(str(d_entity.get("nome", "")))
                        if not d_nome:
                             d_nome = normalize_string(str(d_entity.get("nome_requerente", "")))
                        if d_nome == gt_nome:
                            matched_draft_entity = d_entity
                            matched_draft_index = j
                            break

                # If we STILL haven't matched it but it's a test case testing field mismatch,
                # we should probably fall back to index matching if the arrays are the same size
                if not matched_draft_entity and i < len(draft_entities) and i not in used_draft_indices:
                    matched_draft_entity = draft_entities[i]
                    matched_draft_index = i

                if matched_draft_entity:
                    used_draft_indices.add(matched_draft_index)
                    self._validate_node(f"entities[{i}]", gt_entity, matched_draft_entity)
                else:
                    self.errors.append({
                        "field": f"entities[{i}]",
                        "level": "critical",
                        "message": f"Entidade não encontrada no texto (esperado CPF: {gt_cpf} ou Nome: {gt_nome}).",
                        "expected": str(gt_entity),
                        "found": ""
                    })

        # For backward compatibility / flat schema support
        for key, value in self.ground_truth.items():
            if key not in ["document_metadata", "entities"]:
                self._validate_node(key, value, draft_json.get(key))

        return self.errors

    def _validate_node(self, path: str, expected_node: Any, found_node: Any) -> None:
        def format_val(val: Any) -> str:
            if val is None:
                return ""
            if isinstance(val, list):
                return ", ".join([str(v) for v in val])
            return str(val)

        expected_str_raw = format_val(expected_node)
        found_str_raw = format_val(found_node)

        if isinstance(expected_node, dict):
            if not isinstance(found_node, dict):
                self.errors.append({
                    "field": path if path else "root",
                    "level": "critical",
                    "message": f"O campo '{path}' deveria ser um objeto (dicionário), mas não é.",
                    "expected": expected_str_raw,
                    "found": found_str_raw
                })
                return
            for key, expected_val in expected_node.items():
                current_path = f"{path}.{key}" if path else key
                found_val = found_node.get(key)
                self._validate_node(current_path, expected_val, found_val)
        else:
            # Leaf node processing
            if expected_node is None or (isinstance(expected_node, str) and not expected_node.strip()):
                return

            leaf_key = path.split('.')[-1]

            if found_node is None:
                if leaf_key in CORE_IDENTITY_FIELDS:
                    self.errors.append({
                        "field": path,
                        "level": "critical",
                        "message": f"O campo '{path}' não foi encontrado no texto.",
                        "expected": expected_str_raw,
                        "found": ""
                    })
                return

            if leaf_key in ["cpf", "rg"]:
                norm_expected = normalize_digits(str(expected_node))
                norm_found = normalize_digits(str(found_node))
                if norm_expected != norm_found:
                    self.errors.append({
                        "field": path,
                        "level": "critical",
                        "message": f"O campo '{path}' não confere. Esperado: {norm_expected}, Encontrado: {norm_found}",
                        "expected": expected_str_raw,
                        "found": found_str_raw
                    })
            elif "data" in leaf_key.lower():
                norm_expected = normalize_date(str(expected_node))
                norm_found = normalize_date(str(found_node))
                if norm_expected != norm_found:
                    self.errors.append({
                        "field": path,
                        "level": "critical",
                        "message": f"O campo '{path}' não confere. Esperado: {norm_expected}, Encontrado: {norm_found}",
                        "expected": expected_str_raw,
                        "found": found_str_raw
                    })
            elif isinstance(expected_node, list) or isinstance(found_node, list) or "filia" in leaf_key.lower() or "nome" in leaf_key.lower():
                # For fields that might be lists (filiation, names sometimes extracted as lists of words)
                norm_expected_list = normalize_list_or_string(expected_node)
                norm_found_list = normalize_list_or_string(found_node)

                # Further check if they are identical lists
                if norm_expected_list != norm_found_list:
                    # If dealing with lists of single elements, maybe try simple string check as fallback
                    if len(norm_expected_list) == 1 and len(norm_found_list) == 1:
                        if norm_expected_list[0] != norm_found_list[0]:
                             self.errors.append({
                                "field": path,
                                "level": "critical",
                                "message": f"O campo '{path}' não confere. Esperado: '{norm_expected_list[0]}', Encontrado: '{norm_found_list[0]}'",
                                "expected": expected_str_raw,
                                "found": found_str_raw
                            })
                    else:
                        expected_str = ", ".join(norm_expected_list)
                        found_str = ", ".join(norm_found_list)
                        if expected_str != found_str:
                            self.errors.append({
                                "field": path,
                                "level": "critical",
                                "message": f"O campo '{path}' não confere. Esperado: [{expected_str}], Encontrado: [{found_str}]",
                                "expected": expected_str_raw,
                                "found": found_str_raw
                            })
            else:
                # General Check for all other fields
                norm_expected_val = normalize_string(str(expected_node))
                norm_found_val = normalize_string(str(found_node))
                if norm_expected_val != norm_found_val:
                    self.errors.append({
                        "field": path,
                        "level": "critical",
                        "message": f"O campo '{path}' não confere. Esperado: '{norm_expected_val}', Encontrado: '{norm_found_val}'",
                        "expected": expected_str_raw,
                        "found": found_str_raw
                    })
