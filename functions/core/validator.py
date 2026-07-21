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
    Deterministically cross-checks structured ground truth data against a typed text string.
    """
    def __init__(self, ground_truth: Dict[str, Any], typed_text: str):
        self.ground_truth = ground_truth
        self.typed_text = typed_text
        self.errors = []

    def validate(self) -> List[Dict[str, str]]:
        self.errors = []
        norm_typed_text = normalize_string(self.typed_text)

        for key, expected_val in self.ground_truth.items():
            if expected_val is None or (isinstance(expected_val, str) and not expected_val.strip()):
                continue

            if key == "cpf":
                norm_expected_cpf = normalize_digits(str(expected_val))
                # Find CPF-like patterns (e.g., 123.456.789-00 or 12345678900)
                cpf_patterns = re.findall(r'\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b', self.typed_text)
                found_cpfs = [normalize_digits(p) for p in cpf_patterns]

                if norm_expected_cpf not in found_cpfs:
                    found_str = ", ".join(found_cpfs) if found_cpfs else "nothing"
                    if len(found_cpfs) == 1:
                        msg = f"Expected {norm_expected_cpf} but found {found_cpfs[0]}"
                    else:
                        msg = f"Expected {norm_expected_cpf} but found {found_str}"

                    self.errors.append({
                        "field": "cpf",
                        "level": "critical",
                        "message": msg
                    })

            elif key == "rg":
                norm_expected_rg = normalize_digits(str(expected_val))
                # Find RG-like patterns: typical formats like 12.345.678-9 or just sequences of 5-14 digits
                rg_patterns = re.findall(r'\b(?:[0-9]{1,3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9X]|\d{5,14}X?)\b', self.typed_text, flags=re.IGNORECASE)
                found_rgs = [normalize_digits(p) for p in rg_patterns]

                if norm_expected_rg not in found_rgs:
                    found_str = ", ".join(found_rgs) if found_rgs else "nothing"
                    if len(found_rgs) == 1:
                        msg = f"Expected {norm_expected_rg} but found {found_rgs[0]}"
                    else:
                        msg = f"Expected {norm_expected_rg} but found {found_str}"

                    self.errors.append({
                        "field": "rg",
                        "level": "critical",
                        "message": msg
                    })

            else:
                # General Check for all other fields
                norm_expected_val = normalize_string(str(expected_val))
                if norm_expected_val not in norm_typed_text:
                    self.errors.append({
                        "field": key,
                        "level": "critical",
                        "message": f"Expected '{norm_expected_val}' as substring but not found in text"
                    })

        return self.errors
