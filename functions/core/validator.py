import re
import unicodedata
from typing import Dict, Any, List

def normalize_digits(text: str) -> str:
    """Strip all non-numeric characters (keeps X/x for RG)."""
    if not isinstance(text, str):
        text = str(text)
    return re.sub(r'[^0-9X]', '', text.upper())

def normalize_string(text: str) -> str:
    """Uppercase, remove extra spaces, and strip accents."""
    if not isinstance(text, str):
        text = str(text)
    text = text.upper()
    # Strip accents
    text = ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    # Remove extra spaces
    text = re.sub(r'\s+', ' ', text).strip()
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
        for key, expected_val in self.ground_truth.items():
            if expected_val is None or (isinstance(expected_val, str) and not expected_val.strip()):
                continue

            found_val = draft_json.get(key)
            if found_val is None:
                self.errors.append({
                    "field": key,
                    "level": "critical",
                    "message": f"O campo '{key}' não foi encontrado no texto."
                })
                continue

            if key == "cpf":
                norm_expected_cpf = normalize_digits(str(expected_val))
                norm_found_cpf = normalize_digits(str(found_val))

                if norm_expected_cpf != norm_found_cpf:
                    self.errors.append({
                        "field": "cpf",
                        "level": "critical",
                        "message": f"O campo 'cpf' não confere. Esperado: {norm_expected_cpf}, Encontrado: {norm_found_cpf}"
                    })

            elif key == "rg":
                norm_expected_rg = normalize_digits(str(expected_val))
                norm_found_rg = normalize_digits(str(found_val))

                if norm_expected_rg != norm_found_rg:
                    self.errors.append({
                        "field": "rg",
                        "level": "critical",
                        "message": f"O campo 'rg' não confere. Esperado: {norm_expected_rg}, Encontrado: {norm_found_rg}"
                    })

            else:
                # General Check for all other fields
                norm_expected_val = normalize_string(str(expected_val))
                norm_found_val = normalize_string(str(found_val))
                if norm_expected_val != norm_found_val:
                    self.errors.append({
                        "field": key,
                        "level": "critical",
                        "message": f"O campo '{key}' não confere. Esperado: '{norm_expected_val}', Encontrado: '{norm_found_val}'"
                    })

        return self.errors
