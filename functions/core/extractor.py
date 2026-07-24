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
    Deterministically deduplicates entities by matching CPF.
    Later occurrences override earlier attributes if they contain non-empty data.
    """
    from core.validator import normalize_digits

    # Using a dict to preserve ordering and merge by key
    merged_entities_by_cpf = {}
    unmerged = []

    for entity in entities:
        cpf_raw = entity.get("cpf")

        # If no CPF, we can't reliably merge it right now, just append it
        if not cpf_raw:
            unmerged.append(entity)
            continue

        cpf_norm = normalize_digits(cpf_raw)
        if not cpf_norm:
            unmerged.append(entity)
            continue

        if cpf_norm in merged_entities_by_cpf:
            existing = merged_entities_by_cpf[cpf_norm]
            # Merge fields, newer entity takes precedence for non-empty values
            for k, v in entity.items():
                if v not in (None, ""):
                    existing[k] = v
        else:
            merged_entities_by_cpf[cpf_norm] = entity

    return list(merged_entities_by_cpf.values()) + unmerged


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
                "Place the data into an 'entities' array. "
                "If a field is not explicitly present in the document, set its value to null. Do not infer, force, or duplicate values for missing fields. "
                "Only create top-level entity objects for the primary subjects of the document (the identity holders, spouses, or main contracting parties). "
                "Secondary individuals, such as parents, MUST be strictly nested as 'filiacao_mae' and 'filiacao_pai' string attributes within the primary subject's object. "
                "NEVER create standalone entities for parents. "
                "COMPLETELY DISCARD the 'document type' or any 'role' (e.g., ignore 'Titular'). Treat the document purely as a database of personal facts. "
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
        Extracts data autonomously from a batch of documents using Vertex AI Gemini model.
        Cross-references entities across all files to build a single, unified list of Master Entities.

        Args:
            gcs_uris (list[str]): A list of GCS URIs of the documents for a single session.

        Returns:
            Dict[str, Any]: The unified extracted structured data with a single 'entities' array.
        """
        from google import genai
        from google.genai import types

        client = genai.Client(vertexai=True, project=self.project_id, location=self.location)

        contents = []

        # Iterate through the list of URIs and resolve mime_type for each
        for uri in gcs_uris:
            mime_type = "application/pdf"
            if uri.lower().endswith(".jpg") or uri.lower().endswith(".jpeg"):
                mime_type = "image/jpeg"
            elif uri.lower().endswith(".png"):
                mime_type = "image/png"
            elif uri.lower().endswith(".doc") or uri.lower().endswith(".docx"):
                mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" if uri.lower().endswith(".docx") else "application/msword"

            file_part = types.Part.from_uri(file_uri=uri, mime_type=mime_type)
            contents.append(file_part)

        prompt = (
            "Analyze this batch of identity documents belonging to the same legal session. "
            "Extract a pure 'Identity Profile' for all entities found. "
            "Extract ONLY the person's core identity data (e.g., nome, cpf, rg, data_nascimento, filiacao_mae, filiacao_pai, estado_civil, naturalidade, nacionalidade). "
            "Place the data into a single 'entities' array. "
            "If a field is not explicitly present in the document, set its value to null. Do not infer, force, or duplicate values for missing fields. "
            "Only create top-level entity objects for the primary subjects of the document (the identity holders, spouses, or main contracting parties). "
            "Secondary individuals, such as parents, MUST be strictly nested as 'filiacao_mae' and 'filiacao_pai' string attributes within the primary subject's object. "
            "NEVER create standalone entities for parents. "
            "COMPLETELY DISCARD the 'document type' or any 'role' (e.g., ignore 'Titular'). Treat the documents purely as a database of personal facts. "
            "CRITICAL: You are receiving a batch of documents. If the same person appears across multiple documents (e.g., an ID and a Marriage Certificate), "
            "you must consolidate them into ONE Master Entity containing all gathered data points (CPF, RG, spouse, etc.). Do not duplicate the individual. "
            "Return the data strictly as a valid JSON object with a top-level key 'entities'. "
            "Translate all keys and values into Brazilian Portuguese (pt-BR). "
            "Do not include markdown blocks or any other text outside the JSON."
        )

        contents.append(prompt)

        @retry(wait=wait_random_exponential(min=2, max=15), stop=stop_after_attempt(5), retry=retry_if_exception_type(Exception))
        def _generate():
            with _semaphore:
                return client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=contents,
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

            # Robust JSON parsing
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
            logger.error(f"Error extracting batch document data: {e}", exc_info=True)
            tb_str = traceback.format_exc()
            raise Exception(f"Extraction failed: {str(e)}\nTraceback: {tb_str}") from e

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
        Uses LLM-as-a-Judge to directly compare ground truth against unstructured draft text.
        Returns a list of raw discrepancies to be filtered by the validator.
        """
        from google import genai
        from google.genai import types

        client = genai.Client(vertexai=True, project=self.project_id, location=self.location)

        prompt = (
            "You are an expert legal data auditor for Brazilian Notary Offices (Cartório) evaluating legal draft documents with 100% precision.\n"
            "You are given two inputs:\n"
            "1. GROUND_TRUTH: A verified JSON object containing entities and their attributes.\n"
            "2. DRAFT_TEXT: The raw, unstructured, OCR-extracted text of the draft document.\n\n"
            "OBJECTIVE: Compare every expected attribute in the GROUND_TRUTH against the DRAFT_TEXT. "
            "If the data in the draft contradicts the ground truth or is missing, report it as a discrepancy.\n\n"
            "STRICT RULES:\n"
            "- CONTEXT-AWARE AUDITING (CRITICAL): Understand the legal context of the DRAFT_TEXT first.\n"
            "- NO CORRECTIONS: Do not fix the draft text. Only report discrepancies.\n"
            "- EXACT SUBSTRING RULE (CRITICAL): For any VALUE_MISMATCH, you MUST extract the literal, exact substring from the DRAFT_TEXT and assign it to the 'found_in_text' field. Do not normalize, fix capitalization, or strip punctuation. If you cannot extract the exact substring, you must not report a mismatch.\n"
            "- VALUE MATCHING: If a field from GROUND_TRUTH is present in the DRAFT_TEXT, it MUST match accurately. If it contradicts, report it as a VALUE_MISMATCH.\n"
            "- SMART MISSING FIELDS: If a field from GROUND_TRUTH is missing in the DRAFT_TEXT, evaluate if it is a critical identity requirement for this specific type of document (e.g., Name, CPF). If it's supplementary/irrelevant data for this specific act (e.g., a marriage date in a simple Power of Attorney), silently ignore the absence instead of flagging it.\n"
            "- NULL VALUES: If a field in GROUND_TRUTH is null, missing, or empty, never report it as a MISSING_FIELD.\n"
            "- Return ONLY a JSON array of discrepancy objects.\n\n"
            "OUTPUT SCHEMA:\n"
            "Array of objects, each with:\n"
            "- field: string (e.g., 'entities[0].nome')\n"
            "- category: string (VALUE_MISMATCH, MISSING_FIELD, or UNMATCHED_ENTITY)\n"
            "- message: string (description of the error)\n"
            "- expected: string (the value from ground truth)\n"
            "- found_in_text: string or null (the EXACT literal substring from the raw draft text that caused the mismatch)\n"
        )

        content = f"GROUND_TRUTH:\n{json.dumps(ground_truth, ensure_ascii=False)}\n\nDRAFT_TEXT:\n{draft_text}"

        @retry(wait=wait_random_exponential(min=2, max=15), stop=stop_after_attempt(5), retry=retry_if_exception_type(Exception))
        def _generate():
            with _semaphore:
                return client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[prompt, content],
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
            return json.loads(raw_text)
        except Exception as e:
            logger.error(f"Error in audit_draft: {e}", exc_info=True)
            return []
