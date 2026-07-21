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

class DocumentValidator:
    """
    Deterministically cross-checks structured ground truth data against a typed text string
    using a hybrid approach:
      1. Extract structured data from `typed_text` via LLM into a JSON matching `ground_truth`.
      2. Deterministically compare the extracted JSON to the `ground_truth` using pure Python.
    """
    def __init__(self, ground_truth: Dict[str, Any], typed_text: str):
        self.ground_truth = ground_truth
        self.typed_text = typed_text
        self.errors = []
        self._extractor_instance = None

    def validate(self) -> List[Dict[str, str]]:
        self.errors = []

        # 1. Extract draft data using LLM
        from core.extractor import DocumentExtractor
        if self._extractor_instance is None:
            self._extractor_instance = DocumentExtractor()

        keys_to_extract = list(self.ground_truth.keys())
        draft_json = self._extractor_instance.extract_from_text(self.typed_text, keys_to_extract)

        # 2. Deterministic validation
        self._validate_node("", self.ground_truth, draft_json)

        return self.errors

    def _validate_node(self, path: str, expected_node: Any, found_node: Any) -> None:
        if isinstance(expected_node, dict):
            if not isinstance(found_node, dict):
                self.errors.append({
                    "field": path if path else "root",
                    "level": "critical",
                    "message": f"O campo '{path}' deveria ser um objeto (dicionário), mas não é."
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

            if found_node is None:
                self.errors.append({
                    "field": path,
                    "level": "critical",
                    "message": f"O campo '{path}' não foi encontrado no texto."
                })
                return

            leaf_key = path.split('.')[-1]

            if leaf_key == "cpf":
                norm_expected_cpf = normalize_digits(str(expected_node))
                norm_found_cpf = normalize_digits(str(found_node))

                if norm_expected_cpf != norm_found_cpf:
                    self.errors.append({
                        "field": path,
                        "level": "critical",
                        "message": f"O campo '{path}' não confere. Esperado: {norm_expected_cpf}, Encontrado: {norm_found_cpf}"
                    })
            elif leaf_key == "rg":
                norm_expected_rg = normalize_digits(str(expected_node))
                norm_found_rg = normalize_digits(str(found_node))

                if norm_expected_rg != norm_found_rg:
                    self.errors.append({
                        "field": path,
                        "level": "critical",
                        "message": f"O campo '{path}' não confere. Esperado: {norm_expected_rg}, Encontrado: {norm_found_rg}"
                    })
            else:
                # General Check for all other fields
                norm_expected_val = normalize_string(str(expected_node))
                norm_found_val = normalize_string(str(found_node))
                if norm_expected_val != norm_found_val:
                    self.errors.append({
                        "field": path,
                        "level": "critical",
                        "message": f"O campo '{path}' não confere. Esperado: '{norm_expected_val}', Encontrado: '{norm_found_val}'"
                    })
