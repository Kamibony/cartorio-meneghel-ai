import os
import json
import logging
import traceback
import threading
from typing import Dict, Any
from tenacity import retry, wait_random_exponential, stop_after_attempt, retry_if_exception_type

logger = logging.getLogger(__name__)

_semaphore = threading.Semaphore(3)

def merge_into_master_profile(existing_entity: dict, incoming_entity: dict) -> dict:
    """
    Intelligently merges an incoming entity into an existing entity to build the Master Truth Profile.
    Applies hierarchy rules (e.g. Certidão > RG) to auto-resolve safe conflicts silently, while surfacing hard factual anomalies.
    """
    from core.validator import DataNormalizer

    # Document Hierarchy Weights (higher = more authoritative)
    hierarchy = {
        "Certidão de Casamento": 100,
        "Certidão de Nascimento": 90,
        "CNH": 50,
        "RG": 40,
        "Desconhecido": 0
    }

    incoming_type = incoming_entity.get("_source_document_type", "Desconhecido")
    # Clean it up a bit for matching
    base_incoming_type = "Desconhecido"
    for h_key in hierarchy:
        if h_key.lower() in incoming_type.lower():
            base_incoming_type = h_key
            break

    incoming_weight = hierarchy.get(base_incoming_type, 0)

    # Determine the existing document's weight based on its tracked sources
    existing_sources = existing_entity.get("sources", [])
    max_existing_weight = 0
    primary_existing_source = "Desconhecido"

    for src in existing_sources:
        for h_key in hierarchy:
            if h_key.lower() in src.lower():
                weight = hierarchy.get(h_key, 0)
                if weight > max_existing_weight:
                    max_existing_weight = weight
                    primary_existing_source = src

    for key, incoming_val in incoming_entity.items():
        if key in ["_source_document_type", "sources", "_conflicts", "_resolved_conflicts"]:
            continue

        if incoming_val in (None, ""):
            continue

        existing_val = existing_entity.get(key)

        if existing_val in (None, ""):
            existing_entity[key] = incoming_val
            continue

        norm_incoming = DataNormalizer.normalize_string(incoming_val)
        norm_existing = DataNormalizer.normalize_string(existing_val)

        if norm_incoming != norm_existing:
            # Special logic for names (substring match allows keeping the longest)
            if key == "nome" and (norm_incoming in norm_existing or norm_existing in norm_incoming):
                if len(str(incoming_val)) > len(str(existing_val)):
                    existing_entity[key] = incoming_val
                continue

            # Immutable Data Check: Force Hard Conflict regardless of hierarchy
            immutable_fields = {"cpf", "data_nascimento", "filiacao_mae", "filiacao_pai"}

            if key not in immutable_fields:
                # Conflict handling
                # 1. Safe Automated Override: Strict Hierarchy Win
                if incoming_weight > max_existing_weight:
                    # Incoming wins
                    existing_entity[key] = incoming_val
                    if "_resolved_conflicts" not in existing_entity:
                        existing_entity["_resolved_conflicts"] = []
                    if key not in existing_entity["_resolved_conflicts"]:
                        existing_entity["_resolved_conflicts"].append(key)
                    continue

                elif max_existing_weight > incoming_weight:
                    # Existing wins, silent log
                    if "_resolved_conflicts" not in existing_entity:
                        existing_entity["_resolved_conflicts"] = []
                    if key not in existing_entity["_resolved_conflicts"]:
                        existing_entity["_resolved_conflicts"].append(key)
                    continue

            # 2. Hard Conflict: Same tier, unresolvable, or IMMUTABLE data mismatch
            if "_conflicts" not in existing_entity:
                existing_entity["_conflicts"] = {}

            if key not in existing_entity["_conflicts"]:
                existing_entity["_conflicts"][key] = {
                    "options": [
                        {"value": existing_val, "source": primary_existing_source},
                        {"value": incoming_val, "source": incoming_type}
                    ]
                }
            else:
                # Add to existing conflicts if not already there
                options = existing_entity["_conflicts"][key]["options"]
                if not any(opt.get("value") == incoming_val for opt in options):
                    options.append({"value": incoming_val, "source": incoming_type})

    # Track sources non-destructively
    if incoming_type and incoming_type not in existing_sources:
        existing_sources.append(incoming_type)
        existing_entity["sources"] = existing_sources

    return existing_entity

def deduplicate_entities(entities: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    """
    Deterministically deduplicates and merges entities across documents to build a Master Truth Profile.
    Uses O(N^2) pairwise comparison to allow matching when CPFs are missing (e.g. Certidoes vs RG).
    Matches by CPF first, falling back to Normalized Name (with prefix/substring match) + non-conflicting Filiacao Mae.
    """
    from core.validator import DataNormalizer

    def do_entities_match(ent1, ent2):
        cpf1 = DataNormalizer.normalize_digits(ent1.get("cpf", ""))
        cpf2 = DataNormalizer.normalize_digits(ent2.get("cpf", ""))

        if cpf1 and cpf2 and cpf1 == cpf2:
            return True

        nome1 = DataNormalizer.normalize_string(ent1.get("nome", ""))
        nome2 = DataNormalizer.normalize_string(ent2.get("nome", ""))

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
                mae1 = DataNormalizer.normalize_string(ent1.get("filiacao_mae", ""))
                mae2 = DataNormalizer.normalize_string(ent2.get("filiacao_mae", ""))

                # If both have a mother's name, they must match or one must be a substring
                if mae1 and mae2:
                    if is_name_compatible(mae1, mae2):
                        return True
                    else:
                        return False # Explicit conflict

                # If only one has a mother's name or neither do, accept the name match
                return True

        return False

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
            new_ent = dict(entity)
            doc_type = new_ent.pop("_source_document_type", "")

            # Non-destructively track sources for new entities as well
            current_sources = new_ent.get("sources", [])
            if not isinstance(current_sources, list):
                current_sources = []

            if doc_type and doc_type not in current_sources:
                current_sources.append(doc_type)

            new_ent["sources"] = current_sources
            merged_entities.append(new_ent)
        else:
            # Matched, perform intelligent merge using the hierarchy rules
            existing = merged_entities[matched_idx]

            # Pass document type to merge function
            incoming_type = entity.get("_source_document_type", "")
            if incoming_type:
                entity["_source_document_type"] = incoming_type

            merged_entities[matched_idx] = merge_into_master_profile(existing, entity)

    # Final pass: Ensure "Casado(a)" is enforced if marriage cert exists and wasn't manually skipped
    for existing in merged_entities:
        has_marriage_cert = any("casamento" in src.lower() for src in existing.get("sources", []))
        if existing.get("has_marriage_certificate") or has_marriage_cert:
            resolved_conflicts = existing.get("_resolved_conflicts", [])
            if "estado_civil" not in resolved_conflicts:
                existing_civil = existing.get("estado_civil")
                # Even if we don't know existing, it should be Casado(a) if marriage cert present
                if DataNormalizer.normalize_string(str(existing_civil)) != DataNormalizer.normalize_string("Casado(a)"):
                    existing["estado_civil"] = "Casado(a)"
                    if "_resolved_conflicts" not in existing:
                        existing["_resolved_conflicts"] = []
                    existing["_resolved_conflicts"].append("estado_civil")

                    # Remove from conflicts if it was there
                    if "_conflicts" in existing and "estado_civil" in existing["_conflicts"]:
                        del existing["_conflicts"]["estado_civil"]
                        if not existing["_conflicts"]:
                            del existing["_conflicts"]

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
                doc_type = data.get("document_type", "Desconhecido")
                is_casamento = "casamento" in str(doc_type).lower()
                if "entities" in data and isinstance(data["entities"], list):
                    for ent in data["entities"]:
                        ent["_source_document_type"] = doc_type
                        if is_casamento:
                            ent["has_marriage_certificate"] = True
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
                is_casamento = "casamento" in str(doc_type).lower()
                entities = extracted_data.get("entities", [])

                for entity in entities:
                    entity["_source_document_type"] = doc_type
                    if is_casamento:
                        entity["has_marriage_certificate"] = True
                    all_entities.append(entity)

            except Exception as e:
                logger.error(f"Error extracting batch document data for URI {uri}: {e}", exc_info=True)
                raise

        # Now deterministically merge the entities
        merged_entities = deduplicate_entities(all_entities)

        # Do not enforce whitelist or clean up tags yet
        # The raw dictionaries must flow completely through to audit_draft
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
                doc_type = data.get("document_type", "Desconhecido")
                is_casamento = "casamento" in str(doc_type).lower()
                if "entities" in data and isinstance(data["entities"], list):
                    for ent in data["entities"]:
                        ent["_source_document_type"] = doc_type
                        if is_casamento:
                            ent["has_marriage_certificate"] = True
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
        from core.validator import DataNormalizer

        try:
            from core.validator import CORE_IDENTITY_FIELDS
            # 1. Extract structured data from the draft text
            draft_data = self.extract_from_text(draft_text)
            draft_entities = draft_data.get("entities", [])

            # Run ground truth through the deduplication engine to enforce Universal Legal Hierarchy Rule
            # and `estado_civil` domain logic ("Casado(a)") before deterministic diffing occurs.
            raw_gt_entities = ground_truth.get("entities", [])
            merged_gt_entities = deduplicate_entities(raw_gt_entities)

            # Apply CORE_IDENTITY_FIELDS whitelist to the merged entities
            # This ensures internal metadata like 'sources' does not leak into the validation
            gt_entities = []
            for entity in merged_gt_entities:
                clean_entity = {k: v for k, v in entity.items() if k in CORE_IDENTITY_FIELDS}
                gt_entities.append(clean_entity)

            discrepancies = []

            # Create lookup dictionaries for draft entities (by CPF)
            draft_by_cpf = {}
            for draft_ent in draft_entities:
                cpf = DataNormalizer.normalize_digits(draft_ent.get("cpf", ""))
                if cpf:
                    draft_by_cpf[cpf] = draft_ent

            # 2. Deterministic Diffing
            for i, gt_ent in enumerate(gt_entities):
                gt_cpf = DataNormalizer.normalize_digits(gt_ent.get("cpf", ""))
                gt_nome = DataNormalizer.normalize_string(gt_ent.get("nome", ""))

                # Find matching entity in draft
                matched_draft_ent = None
                if gt_cpf and gt_cpf in draft_by_cpf:
                    matched_draft_ent = draft_by_cpf[gt_cpf]
                else:
                    # Fallback to name substring matching for draft entity lookup
                    # E.g. Ground Truth has "BIANCA AGUIAR SANTOS DANTAS"
                    # Draft has "BIANCA AGUIAR SANTOS"
                    for draft_ent in draft_entities:
                        draft_nome = DataNormalizer.normalize_string(draft_ent.get("nome", ""))
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
                        norm_expected = DataNormalizer.normalize_string(str(expected_val))
                        norm_draft = DataNormalizer.normalize_string(str(draft_val))

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
