import os
import json
import logging
import traceback
import threading
from typing import Dict, Any
from tenacity import retry, wait_random_exponential, stop_after_attempt, retry_if_exception_type

logger = logging.getLogger(__name__)

_semaphore = threading.Semaphore(3)

def deduplicate_entities(entities: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    """
    Deterministically deduplicates and merges entities across documents.
    Uses O(N^2) pairwise comparison to allow matching when CPFs are missing (e.g. Certidoes vs RG).
    Matches by CPF first, falling back to Normalized Name (with prefix/substring match) + non-conflicting Filiacao Mae.
    Enforces the Universal Legal Hierarchy Rule: 'Certidão' data strictly overwrites others.
    """
    from core.validator import normalize_digits, normalize_string

    def is_certidao(doc_type_str):
        return doc_type_str and "certid" in str(doc_type_str).lower()

    def is_certidao_casamento(doc_type_str):
        return "casamento" in str(doc_type_str).lower()

    def do_entities_match(ent1, ent2):
        cpf1 = normalize_digits(ent1.get("cpf", ""))
        cpf2 = normalize_digits(ent2.get("cpf", ""))

        if cpf1 and cpf2 and cpf1 == cpf2:
            return True

        nome1 = normalize_string(ent1.get("nome", ""))
        nome2 = normalize_string(ent2.get("nome", ""))

        def is_name_compatible(n1, n2):
            if not n1 or not n2:
                return False
            if n1 in n2 or n2 in n1:
                return True
            stopwords = {"DE", "DA", "DO", "DAS", "DOS", "E"}
            t1 = {w for w in n1.split() if w not in stopwords}
            t2 = {w for w in n2.split() if w not in stopwords}
            if t1 and t2 and (t1.issubset(t2) or t2.issubset(t1)):
                return True
            return False

        # If one CPF is missing or they don't have CPFs, check name compatibility
        if (not cpf1 or not cpf2) and nome1 and nome2:
            # Check for prefix or substring match (e.g. BIANCA AGUIAR SANTOS vs BIANCA AGUIAR SANTOS DANTAS)
            if is_name_compatible(nome1, nome2):
                # Need to check mother's name to avoid false positives (e.g. siblings)
                mae1 = normalize_string(ent1.get("filiacao_mae", ""))
                mae2 = normalize_string(ent2.get("filiacao_mae", ""))

                # If both have a mother's name, they must match or one must be a substring
                if mae1 and mae2:
                    if is_name_compatible(mae1, mae2):
                        return True
                    else:
                        return False # Explicit conflict

                # If only one has a mother's name or neither do, accept the name match
                return True

        return False

    has_casamento = any(is_certidao_casamento(e.get("_source_document_type", "")) for e in entities)

    merged_entities = []

    for entity in entities:
        # Find if this entity matches an already merged entity
        matched_idx = -1
        for i, merged_ent in enumerate(merged_entities):
            if do_entities_match(entity, merged_ent):
                matched_idx = i
                break

        if matched_idx == -1:
            # Not matched, add as a new entity (copying to avoid mutating source)
            merged_entities.append(dict(entity))
        else:
            # Matched, perform merge
            existing = merged_entities[matched_idx]

            # Universal Legal Hierarchy Rule Check
            incoming_is_cert = is_certidao(entity.get("_source_document_type", ""))
            existing_is_cert = is_certidao(existing.get("_source_document_type", ""))

            # If the incoming document is a Certidão and the existing is NOT,
            # the Certidão's fields unconditionally overwrite conflicting fields.
            force_overwrite = incoming_is_cert and not existing_is_cert

            # If the existing document is a Certidão and the incoming is NOT,
            # the Certidão's fields cannot be overwritten by the incoming.
            protect_existing = existing_is_cert and not incoming_is_cert

            for k, v in entity.items():
                if v not in (None, ""):
                    if force_overwrite:
                        existing[k] = v
                    elif protect_existing:
                        if existing.get(k) in (None, ""):
                            # Only fill it in if the Certidao was missing it entirely
                            existing[k] = v
                    else:
                        # Standard merge logic: newer non-empty value takes precedence,
                        # BUT for names, prefer the longer one to capture appended surnames
                        if k == "nome" and existing.get("nome"):
                            if len(str(v)) > len(str(existing["nome"])):
                                existing[k] = v
                        else:
                            existing[k] = v

            # Keep the Certidao tag alive if it ever got applied, to protect future merges
            if incoming_is_cert:
                if is_certidao_casamento(entity.get("_source_document_type", "")):
                    existing["_source_document_type"] = "Certidão de Casamento (Merged)"
                elif not is_certidao_casamento(existing.get("_source_document_type", "")):
                    existing["_source_document_type"] = "Certidao (Merged)"

    for existing in merged_entities:
        if has_casamento or is_certidao_casamento(existing.get("_source_document_type", "")):
            existing["estado_civil"] = "Casado(a)"

    return merged_entities


class DocumentExtractor:
    """
    Unified extractor for all document types using Vertex AI with Gemini 2.5 Flash.
    Autonomous processing without hardcoded routing maps.
    """

    def __init__(self) -> None:
        """Initializes the DocumentExtractor."""
        self.project_id = os.environ.get("FIREBASE_PROJECT_ID", "cartorio-meneghel-ai")
        self.location = os.environ.get("VERTEX_AI_LOCATION", "us-central1")

        if not self.project_id:
            raise ValueError("FIREBASE_PROJECT_ID environment variable must be set.")

    def extract(self, gcs_uri: str, document_type: str = None) -> Dict[str, Any]:
        """
        Extracts data autonomously using Vertex AI Gemini model.

        Args:
            gcs_uri (str): The GCS URI of the document.
            document_type (str, optional): The type of the document (e.g., "DRAFT").

        Returns:
            Dict[str, Any]: The extracted structured data.
        """
        from google import genai
        from google.genai import types

        client = genai.Client(vertexai=True, project=self.project_id, location=self.location)

        mime_type = "application/pdf"
        if gcs_uri.lower().endswith(".jpg") or gcs_uri.lower().endswith(".jpeg"):
            mime_type = "image/jpeg"
        elif gcs_uri.lower().endswith(".png"):
            mime_type = "image/png"
        elif gcs_uri.lower().endswith(".doc") or gcs_uri.lower().endswith(".docx"):
            mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" if gcs_uri.lower().endswith(".docx") else "application/msword"

        file_part = types.Part.from_uri(file_uri=gcs_uri, mime_type=mime_type)

        if document_type == 'DRAFT':
            prompt = (
                "Extract the entire text verbatim from this document. "
                "Return the data strictly as a valid JSON object with a single key 'text' containing the extracted text. "
                "Do not include markdown blocks or any other text outside the JSON."
            )
        else:
            # Profile A: Source Identities (Ground Truth)
            prompt = (
                "Analyze this identity document (e.g., CNH, RG, Certidão). Extract a pure 'Identity Profile'. "
                "Extract ONLY the person's core identity data (e.g., nome, cpf, rg, data_nascimento, filiacao_mae, filiacao_pai, estado_civil, naturalidade, nacionalidade). "
                "Also extract a top-level 'document_type' string indicating the type of the source document (e.g., 'Certidão de Casamento', 'RG', 'CNH'). "
                "Place the data into an 'entities' array. "
                "If a field is not explicitly present in the document, set its value to null. Do not infer, force, or duplicate values for missing fields. "
                "Only create top-level entity objects for the primary subjects of the document (the identity holders, spouses, or main contracting parties). "
                "Secondary individuals, such as parents, MUST be strictly nested as 'filiacao_mae' and 'filiacao_pai' string attributes within the primary subject's object. "
                "NEVER create standalone entities for parents. "
                "COMPLETELY DISCARD the 'document type' or any 'role' (e.g., ignore 'Titular'). Treat the document purely as a database of personal facts. "
                "Ensure all extracted fields are flat strings. For example, 'naturalidade' MUST be a single string (e.g., 'João Pessoa - PB'), NEVER a nested object. "
                "Return the data strictly as a valid JSON object with a top-level key 'entities'. "
                "Translate all keys and values into Brazilian Portuguese (pt-BR). "
                "Do not include markdown blocks or any other text outside the JSON."
            )

        @retry(wait=wait_random_exponential(min=2, max=15), stop=stop_after_attempt(5), retry=retry_if_exception_type(Exception))
        def _generate():
            with _semaphore:
                return client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[file_part, prompt],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.0
                    )
                )

        try:
            response = _generate()

            if not response.text:
                raise ValueError("Empty response received from Vertex AI.")

            raw_text = response.text.strip()

            try:
                data = json.loads(raw_text)
                if "entities" in data and isinstance(data["entities"], list):
                    data["entities"] = deduplicate_entities(data["entities"])
                return data
            except json.JSONDecodeError as je:
                raise ValueError(f"Failed to parse JSON response from AI model. Raw text: {raw_text[:200]}...") from je
        except Exception as e:
            logger.error(f"Error extracting document data: {e}", exc_info=True)
            tb_str = traceback.format_exc()
            raise Exception(f"Extraction failed: {str(e)}\nTraceback: {tb_str}") from e

    def extract_batch(self, gcs_uris: list[str]) -> Dict[str, Any]:
        """
        Extracts data from a batch of documents by iterating over each file atomically,
        then merges the extracted entities deterministically using Python code.

        Args:
            gcs_uris (list[str]): A list of GCS URIs of the documents for a single session.

        Returns:
            Dict[str, Any]: The unified extracted structured data with a single 'entities' array.
        """
        all_entities = []

        for uri in gcs_uris:
            try:
                # Process each document atomically to avoid LLM cognitive overload
                extracted_data = self.extract(uri)

                # Tag the document type onto each entity for later merging rules
                doc_type = extracted_data.get("document_type", "Desconhecido")
                entities = extracted_data.get("entities", [])

                for entity in entities:
                    entity["_source_document_type"] = doc_type
                    all_entities.append(entity)

            except Exception as e:
                logger.error(f"Error extracting batch document data for URI {uri}: {e}", exc_info=True)
                raise

        # Now deterministically merge the entities
        merged_entities = deduplicate_entities(all_entities)

        # Clean up internal tags
        for entity in merged_entities:
            entity.pop("_source_document_type", None)

        return {"entities": merged_entities}

    def extract_from_text(self, text: str) -> Dict[str, Any]:
        """
        Extracts structured data from raw text using Gemini 2.5 Flash, returning
        a JSON object for the drafted document.
        Uses temperature=0.0 to reduce hallucinations.

        Args:
            text (str): The raw draft text to analyze.

        Returns:
            Dict[str, Any]: The extracted structured data.
        """
        from google import genai
        from google.genai import types

        client = genai.Client(vertexai=True, project=self.project_id, location=self.location)

        # Profile B: Legal Drafts
        prompt = (
            "Analyze the following legal draft text and extract all relevant structured data. "
            "1. Extract document-level properties (e.g., instrument type) into a 'document_metadata' object. "
            "2. Extract the entities mentioned within the text into an 'entities' array. "
            "Each object in this array MUST include their assigned legal 'role' (e.g., 'OUTORGANTE', 'OUTORGADO', 'VENDEDOR') "
            "and their listed personal data (e.g., nome, cpf, rg). "
            "Only create top-level entity objects for the primary subjects of the document (the main contracting parties like outorgantes, outorgados, vendedores, compradores). "
            "Secondary individuals, such as parents, MUST be strictly nested as 'filiacao_mae' and 'filiacao_pai' string attributes within the primary subject's object. "
            "NEVER create standalone entities for parents. "
            "Ensure all extracted fields are flat strings. For example, 'naturalidade' MUST be a single string (e.g., 'João Pessoa - PB'), NEVER a nested object. "
            "The output MUST be a strictly valid JSON object containing exactly the top-level keys 'document_metadata' and 'entities'. "
            "Translate all keys and values into Brazilian Portuguese (pt-BR). "
            "If a field is not found or cannot be determined, set its value to null. "
            "Do not include markdown blocks or any other text outside the JSON."
        )

        @retry(wait=wait_random_exponential(min=2, max=15), stop=stop_after_attempt(5), retry=retry_if_exception_type(Exception))
        def _generate():
            with _semaphore:
                return client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[prompt, text],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.0
                    )
                )

        try:
            response = _generate()

            if not response.text:
                raise ValueError("Empty response received from Vertex AI.")

            raw_text = response.text.strip()

            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]

            raw_text = raw_text.strip()

            try:
                data = json.loads(raw_text)
                if "entities" in data and isinstance(data["entities"], list):
                    data["entities"] = deduplicate_entities(data["entities"])
                return data
            except json.JSONDecodeError as je:
                raise ValueError(f"Failed to parse JSON response from AI model. Raw text: {raw_text[:200]}...") from je
        except Exception as e:
            logger.error(f"Error extracting from text: {e}", exc_info=True)
            tb_str = traceback.format_exc()
            raise Exception(f"Extraction from text failed: {str(e)}\nTraceback: {tb_str}") from e

    def audit_draft(self, ground_truth: Dict[str, Any], draft_text: str) -> list[Dict[str, Any]]:
        """
        Deterministically compares ground truth against the unstructured draft text.
        First extracts structured data from the draft text using an LLM,
        then performs a deterministic Python diff against the ground truth to find discrepancies.
        """
        import re
        from core.validator import normalize_digits, normalize_string

        try:
            from core.validator import CORE_IDENTITY_FIELDS
            # 1. Extract structured data from the draft text
            draft_data = self.extract_from_text(draft_text)
            draft_entities = draft_data.get("entities", [])
            gt_entities = ground_truth.get("entities", [])

            discrepancies = []

            # Create lookup dictionaries for draft entities (by CPF)
            draft_by_cpf = {}
            for draft_ent in draft_entities:
                cpf = normalize_digits(draft_ent.get("cpf", ""))
                if cpf:
                    draft_by_cpf[cpf] = draft_ent

            # 2. Deterministic Diffing
            for i, gt_ent in enumerate(gt_entities):
                gt_cpf = normalize_digits(gt_ent.get("cpf", ""))
                gt_nome = normalize_string(gt_ent.get("nome", ""))

                # Find matching entity in draft
                matched_draft_ent = None
                if gt_cpf and gt_cpf in draft_by_cpf:
                    matched_draft_ent = draft_by_cpf[gt_cpf]
                else:
                    # Fallback to name substring matching for draft entity lookup
                    # E.g. Ground Truth has "BIANCA AGUIAR SANTOS DANTAS"
                    # Draft has "BIANCA AGUIAR SANTOS"
                    for draft_ent in draft_entities:
                        draft_nome = normalize_string(draft_ent.get("nome", ""))
                        if draft_nome and gt_nome and (draft_nome in gt_nome or gt_nome in draft_nome):
                            matched_draft_ent = draft_ent
                            break

                if not matched_draft_ent:
                    # Entity entirely missing from draft
                    discrepancies.append({
                        "field": f"entities[{i}]",
                        "category": "UNMATCHED_ENTITY",
                        "message": f"Entity '{gt_ent.get('nome', 'Unknown')}' not found in the draft document.",
                        "expected": gt_ent.get("nome", ""),
                        "found_in_text": None,
                        "requires_human_review": False
                    })
                    continue

                # Compare fields for the matched entity
                for key in CORE_IDENTITY_FIELDS:
                    expected_val = gt_ent.get(key)
                    if expected_val in (None, ""):
                        continue

                    draft_val = matched_draft_ent.get(key)
                    field_path = f"entities[{i}].{key}"

                    if draft_val in (None, ""):
                        discrepancies.append({
                            "field": field_path,
                            "category": "MISSING_FIELD",
                            "message": f"Expected '{key}' is missing in the draft.",
                            "expected": str(expected_val),
                            "found_in_text": None,
                            "requires_human_review": False
                        })
                    else:
                        norm_expected = normalize_string(str(expected_val))
                        norm_draft = normalize_string(str(draft_val))

                        if norm_expected != norm_draft:
                            # Try to extract the exact substring from the raw draft text
                            # This is necessary because DocumentValidator downstream requires the exact literal match
                            exact_substring = str(draft_val)
                            try:
                                # We search the draft text for a case-insensitive match of the drafted value
                                escaped_val = re.escape(str(draft_val))
                                match = re.search(escaped_val, draft_text, re.IGNORECASE)
                                if match:
                                    exact_substring = match.group(0)
                            except Exception:
                                pass

                            discrepancies.append({
                                "field": field_path,
                                "category": "VALUE_MISMATCH",
                                "message": f"Value mismatch for '{key}'. Expected '{expected_val}', found '{draft_val}'.",
                                "expected": str(expected_val),
                                "found": str(draft_val),
                                "found_in_text": exact_substring,
                                "requires_human_review": False
                            })

            return discrepancies

        except Exception as e:
            logger.error(f"Error in deterministic audit_draft: {e}", exc_info=True)
            return []
