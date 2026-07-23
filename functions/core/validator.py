import re
import unicodedata
import logging
from typing import Dict, Any, List
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

@dataclass
class Discrepancy:
    field: str
    category: str
    message: str
    expected: str
    found: str
    found_in_text: str = ""

    def __post_init__(self):
        def _coerce_to_string(val: Any) -> str:
            if isinstance(val, str):
                return val
            if isinstance(val, dict):
                return str(val.get("nome") or val.get("cpf") or "[Objeto]")
            if val is None:
                return ""
            if isinstance(val, list):
                return ", ".join([str(v) for v in val])
            return str(val)

        self.expected = _coerce_to_string(self.expected)
        self.found = _coerce_to_string(self.found)
        if self.found_in_text is None:
            self.found_in_text = ""
        else:
            self.found_in_text = str(self.found_in_text)

def normalize_digits(text: str) -> str:
    """Strip all non-numeric characters (keeps X/x for RG)."""
    if not isinstance(text, str):
        text = str(text)
    return re.sub(r'[^0-9X]', '', text.upper())

def normalize_string(text: str) -> str:
    """Uppercase, remove extra spaces, strip accents, and apply smart normalization."""
    if not isinstance(text, str):
        text = str(text)
    text = text.upper()

    # Strip gender suffixes like (A) or (O/A)
    text = re.sub(r'\([AO](/[AO])?\)', '', text)

    # Normalize common gendered terms to masculine/base form
    text = re.sub(r'\b(BRASILEIR|SOLTEIR|CASAD|DIVORCIAD|VIUV|SEPARAD)[AO]S?\b', r'\1O', text)

    # Strip trailing state slashes (e.g., JOAO PESSOA/PB -> JOAO PESSOA)
    text = re.sub(r'/[A-Z]{2}$', '', text)

    # Strip accents
    text = ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    # Remove extra spaces
    text = re.sub(r'\s+', ' ', text).strip()

    return text

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

class DocumentValidator:
    """
    Deterministically cross-checks structured ground truth data against a typed text string
    using a single-pass LLM-as-a-Judge approach.
    """
    def __init__(self, ground_truth: Dict[str, Any], typed_text: str):
        self.ground_truth = ground_truth.copy()
        self.typed_text = typed_text
        self.errors = []
        self._extractor_instance = None

    def validate(self) -> List[Dict[str, str]]:
        self.errors = []

        from core.extractor import DocumentExtractor
        if self._extractor_instance is None:
            self._extractor_instance = DocumentExtractor()

        raw_discrepancies = self._extractor_instance.audit_draft(self.ground_truth, self.typed_text)

        # Deterministic Hallucination Filter
        validated_discrepancies = []
        for d in raw_discrepancies:
            try:
                error = Discrepancy(
                    field=d.get("field", "unknown"),
                    category=d.get("category", "UNKNOWN"),
                    message=d.get("message", ""),
                    expected=d.get("expected", ""),
                    found=d.get("found", d.get("found_in_text", "")),
                    found_in_text=d.get("found_in_text")
                )
            except Exception as e:
                logger.error(f"Error parsing discrepancy: {d} - {e}")
                continue

            if error.category == "VALUE_MISMATCH":
                # Normalize values to check for false positive mismatches (case, accent, gender suffix)
                norm_expected = normalize_string(error.expected)
                norm_found = normalize_string(error.found_in_text)

                if norm_expected == norm_found and norm_expected != "":
                    logger.warning(f"False positive filtered: '{error.expected}' vs '{error.found_in_text}' resolved to '{norm_expected}'.")
                    continue

                # Deterministic anchor check
                if error.found_in_text and error.found_in_text in self.typed_text:
                    validated_discrepancies.append(error)
                else:
                    logger.warning(f"Hallucination filtered: '{error.found_in_text}' not in raw text.")
                    continue

            elif error.category == "MISSING_FIELD":
                # Reverse-hallucination check
                # Check if the expected value is actually in the text
                # We normalize both to prevent case/accent mismatches from bypassing the filter
                if error.expected:
                    norm_expected = normalize_string(str(error.expected))
                    norm_text = normalize_string(self.typed_text)
                    if norm_expected and norm_expected in norm_text:
                        logger.warning(f"Hallucination filtered: MISSING_FIELD for '{error.expected}', but found in text.")
                        continue
                validated_discrepancies.append(error)

            elif error.category == "UNMATCHED_ENTITY":
                validated_discrepancies.append(error)

            else:
                validated_discrepancies.append(error)

        self.errors = validated_discrepancies
        return [asdict(e) for e in self.errors]
