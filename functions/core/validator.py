import re
import unicodedata
import logging
from typing import Dict, Any, List
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

CORE_IDENTITY_FIELDS = {
    "nome", "cpf", "rg", "orgao_emissor_rg", "data_nascimento",
    "estado_civil", "filiacao_mae", "filiacao_pai", "naturalidade",
    "nacionalidade", "profissao", "endereco", "regime_bens",
    "matricula", "data_obito", "aliquota_itcd"
}


@dataclass
class Discrepancy:
    field: str
    category: str
    message: str
    expected: str
    found: str
    found_in_text: str = ""
    requires_human_review: bool = False
    review_reason: str = ""
    entity_name: str = ""

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

class DataNormalizer:
    @staticmethod
    def normalize_cpf_cnpj(text: str) -> str:
        """Strip all non-numeric characters for CPF/CNPJ."""
        if not text:
            return ""
        if not isinstance(text, str):
            text = str(text)
        return re.sub(r'[^0-9]', '', text)

    @staticmethod
    def normalize_digits(text: str) -> str:
        """Strip all non-numeric characters (keeps X/x for RG)."""
        if not text:
            return ""
        if not isinstance(text, str):
            text = str(text)
        return re.sub(r'[^0-9X]', '', text.upper())

    @staticmethod
    def normalize_string(text: str) -> str:
        """Uppercase, remove extra spaces, strip accents, strip markdown, and apply smart normalization."""
        if not text:
            return ""
        if not isinstance(text, str):
            text = str(text)
        text = text.upper()

        # Strip markdown artifacts
        text = re.sub(r'[*_#`]', '', text)

        # Strip gender suffixes like (A) or (O/A) BEFORE word stemming
        text = re.sub(r'\([AO](/[AO])?\)', '', text)

        # Strip accents FIRST, before word matching for safety
        text = ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')

        # Normalize common gendered terms to masculine/base form
        text = re.sub(r'\b(BRASILEIR|SOLTEIR|CASAD|DIVORCIAD|VIUV|SEPARAD)[AO]S?\b', r'\1O', text)

        # Standardize state abbreviations (e.g., JOAO PESSOA/PB, JOAO PESSOA - PB, JOAO PESSOA, PB)
        text = re.sub(r'[\s,\-/\\]+([A-Z]{2})$', r' \1', text)

        # Remove extra spaces
        return re.sub(r'\s+', ' ', text).strip()

    @staticmethod
    def normalize_field(key: str, value: str) -> str:
        """Tiered Canonicalization Architecture based on field type."""
        if not value:
            return ""

        value = str(value)
        key_lower = key.lower()

        # Tier 1: Strict Fields (Zero-Tolerance)
        strict_fields = ["entity_name", "nome", "cpf", "cnpj", "rg", "matricula", "itbi_valor", "itcd_valor"]
        if key_lower in strict_fields or "data" in key_lower:
            if key_lower in ["cpf", "cnpj"]:
                return DataNormalizer.normalize_cpf_cnpj(value)
            elif key_lower in ["rg", "matricula"]:
                return DataNormalizer.normalize_digits(value)
            elif "data" in key_lower:
                return DataNormalizer.normalize_date(value)
            elif key_lower in ["itbi_valor", "itcd_valor"]:
                val = re.sub(r'[^0-9A-Z]', '', value.upper())
                return val
            else: # entity_name, nome
                val = value.upper()
                val = ''.join(c for c in unicodedata.normalize('NFD', val) if unicodedata.category(c) != 'Mn')
                val = re.sub(r'[^A-Z0-9]', ' ', val)
                return re.sub(r'\s+', ' ', val).strip()

        # Tier 2: Descriptive Fields (The Canonicalizer)
        descriptive_fields = ["endereco", "profissao"]
        if key_lower in descriptive_fields:
            val = value.upper()

            # Common abbreviations translation
            abbrevs = {
                r'\bAV\.\b': 'AVENIDA',
                r'\bAV\b': 'AVENIDA',
                r'\bR\.\b': 'RUA',
                r'\bR\b': 'RUA',
                r'\bS/N\b': 'SEM NUMERO',
                r'\bS\.N\.\b': 'SEM NUMERO'
            }
            for pattern, repl in abbrevs.items():
                val = re.sub(pattern, repl, val)

            # Strip all punctuation, replace with space to preserve word boundaries
            val = ''.join(c for c in unicodedata.normalize('NFD', val) if unicodedata.category(c) != 'Mn')
            val = re.sub(r'[^A-Z0-9]', ' ', val)

            # Normalize whitespace
            return re.sub(r'\s+', ' ', val).strip()

        # Tier 3: Enums/Roles
        if key_lower == "papel":
            return value.upper().strip()

        # Fallback to general normalization
        return DataNormalizer.normalize_string(value)

    @staticmethod
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

# Backwards compatibility aliases
normalize_cpf_cnpj = DataNormalizer.normalize_cpf_cnpj
normalize_digits = DataNormalizer.normalize_digits
normalize_string = DataNormalizer.normalize_string
normalize_date = DataNormalizer.normalize_date

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

        from core.extractor import DocumentExtractor, get_entity_attr
        from core.consolidator import MasterProfileConsolidator

        # Deduplicate entities using Universal Legal Hierarchy Rule
        # This matches what audit_draft will do to align the indices.
        raw_entities = self.ground_truth.get("entities", [])
        merged_entities = MasterProfileConsolidator.deduplicate_entities(raw_entities)

        from core.models import validate_entity
        merged_entities = [validate_entity(ent) for ent in merged_entities]
        self.ground_truth["entities"] = merged_entities

        # CIN (New Brazilian ID) Pruning Logic for Dynamic Schema:
        # If the document is a CIN, the CPF and RG numbers are identical.
        # In this case, we strictly do not want to enforce the RG or orgao_emissor_rg fields.
        for entity in self.ground_truth["entities"]:
            cpf_val = DataNormalizer.normalize_digits(get_entity_attr(entity, "cpf") or "")
            rg_val = DataNormalizer.normalize_digits(get_entity_attr(entity, "rg") or "")
            if cpf_val and rg_val and cpf_val == rg_val:
                attrs = entity.get("attributes", [])
                entity["attributes"] = [a for a in attrs if a.get("key") not in ["rg", "orgao_emissor_rg"]]

        if self._extractor_instance is None:
            self._extractor_instance = DocumentExtractor()

        raw_discrepancies = self._extractor_instance.audit_draft(self.ground_truth, self.typed_text)

        # Deterministic Hallucination Filter
        validated_discrepancies = []
        for d in raw_discrepancies:
            try:
                field_path = d.get("field", "unknown")

                # Extract entity name if applicable
                entity_name_val = d.get("entity_name", "")
                if not entity_name_val and field_path.startswith("entities["):
                    match = re.search(r"entities\[(\d+)\]", field_path)
                    if match:
                        idx = int(match.group(1))
                        entities_list = self.ground_truth.get("entities", [])
                        if 0 <= idx < len(entities_list):
                            ent = entities_list[idx]
                            entity_name_val = ent.get("entity_name") or get_entity_attr(ent, "nome") or get_entity_attr(ent, "razao_social") or ""

                error = Discrepancy(
                    field=field_path,
                    category=d.get("category", "UNKNOWN"),
                    message=d.get("message", ""),
                    expected=d.get("expected", ""),
                    found=d.get("found", d.get("found_in_text", "")),
                    found_in_text=d.get("found_in_text"),
                    requires_human_review=d.get("requires_human_review", False),
                    review_reason=d.get("review_reason", "") or "",
                    entity_name=entity_name_val
                )
            except Exception as e:
                logger.error(f"Error parsing discrepancy: {d} - {e}")
                continue

            if error.category == "VALUE_MISMATCH":
                # Normalize values to check for false positive mismatches (case, accent, gender suffix)
                field_base = error.field.split('.')[-1]
                # Use tiered normalize_field to evaluate equality properly
                norm_expected = DataNormalizer.normalize_field(field_base, error.expected)
                norm_found = DataNormalizer.normalize_field(field_base, error.found_in_text)

                if norm_expected == norm_found and norm_expected != "":
                    logger.warning(f"False positive filtered: '{error.expected}' vs '{error.found_in_text}' resolved to '{norm_expected}'.")
                    continue

                # Deterministic anchor check
                if error.found_in_text:
                    norm_found_text = DataNormalizer.normalize_string(error.found_in_text)
                    norm_typed = DataNormalizer.normalize_string(self.typed_text)
                    if norm_found_text and norm_found_text in norm_typed:
                        validated_discrepancies.append(error)
                    else:
                        logger.warning(f"Hallucination filtered: '{error.found_in_text}' not in raw text.")
                        continue
                else:
                    logger.warning(f"Hallucination filtered: '{error.found_in_text}' not in raw text.")
                    continue

            elif error.category == "MISSING_FIELD":
                # Filter out non-core metadata fields
                # Extract the base field name (e.g., 'document_type' from 'entities[0].document_type')
                field_base = error.field.split('.')[-1]

                if field_base not in CORE_IDENTITY_FIELDS:
                    logger.warning(f"Metadata filtered: MISSING_FIELD for '{field_base}' ignored.")
                    continue

                # Reverse-hallucination check
                # Check if the expected value is actually in the text
                # We normalize both to prevent case/accent mismatches from bypassing the filter
                if error.expected:
                    norm_expected = DataNormalizer.normalize_string(str(error.expected))
                    norm_text = DataNormalizer.normalize_string(self.typed_text)
                    if norm_expected and norm_expected in norm_text:
                        logger.warning(f"Hallucination filtered: MISSING_FIELD for '{error.expected}', but found in text.")
                        continue
                validated_discrepancies.append(error)

            elif error.category == "UNMATCHED_ENTITY":
                # Reverse-hallucination check for entities
                if error.expected:
                    norm_expected = DataNormalizer.normalize_string(str(error.expected))
                    norm_text = DataNormalizer.normalize_string(self.typed_text)
                    if norm_expected and norm_expected in norm_text:
                        logger.warning(f"Hallucination filtered: UNMATCHED_ENTITY for '{error.expected}', but found in text.")
                        continue
                validated_discrepancies.append(error)

            else:
                validated_discrepancies.append(error)

        self.errors = validated_discrepancies
        return [asdict(e) for e in self.errors]
