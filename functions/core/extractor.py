import os
import json
import logging
import traceback
from typing import Dict, Any

logger = logging.getLogger(__name__)

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
            prompt = (
                "Analyze this document. Extract all relevant structured data based on the following schema constraints: "
                "1. Isolate document-level properties (e.g., instrument type) into a 'document_metadata' object. "
                "2. Extract person-level identity data (e.g., nome, cpf, rg, data_nascimento, filiacao_mae, filiacao_pai, estado_civil, naturalidade, spouse details) "
                "into an 'entities' array. Each object in this array represents a distinct person and MUST include a 'role' attribute (e.g., 'OUTORGANTE', 'PROCURADOR', 'COMPRADOR', 'VENDEDOR'). "
                "STRICTLY EXCLUDE all notary metadata, fees, and footers (e.g., emolumentos, selo_digital, cartorio_endereco, nome_escrevente, data_emissao). "
                "Return the data strictly as a valid JSON object with top-level keys 'document_metadata' and 'entities'. "
                "Translate all keys and values into Brazilian Portuguese (pt-BR). "
                "Do not include markdown blocks or any other text outside the JSON."
            )

        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[file_part, prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )

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
                return json.loads(raw_text)
            except json.JSONDecodeError as je:
                raise ValueError(f"Failed to parse JSON response from AI model. Raw text: {raw_text[:200]}...") from je
        except Exception as e:
            logger.error(f"Error extracting document data: {e}", exc_info=True)
            tb_str = traceback.format_exc()
            raise Exception(f"Extraction failed: {str(e)}\nTraceback: {tb_str}") from e

    def extract_from_text(self, text: str, ground_truth_keys: list) -> Dict[str, Any]:
        """
        Extracts structured data from raw text using Gemini 2.5 Flash, returning
        a JSON object strictly matching the provided ground truth keys.
        Uses temperature=0.0 to reduce hallucinations.

        Args:
            text (str): The raw draft text to analyze.
            ground_truth_keys (list): List of expected keys in the output JSON.

        Returns:
            Dict[str, Any]: The extracted structured data.
        """
        from google import genai
        from google.genai import types

        client = genai.Client(vertexai=True, project=self.project_id, location=self.location)

        # If ground_truth_keys is a list, it's a legacy flat schema
        # If it's a dict containing document_metadata/entities, it's the new nested schema
        is_nested = isinstance(ground_truth_keys, dict) and ("document_metadata" in ground_truth_keys or "entities" in ground_truth_keys)

        if is_nested:
            schema_constraint = "It must contain a 'document_metadata' object and an 'entities' array of objects with a 'role' attribute."
        else:
            schema_constraint = "The output MUST be a strictly flat JSON object (no nested objects or dictionaries)."

        prompt = (
            "Analyze the following document text and extract all relevant structured data. "
            f"The output MUST be a valid JSON object matching EXACTLY the keys/structure described here: {ground_truth_keys}. "
            f"{schema_constraint} "
            "Translate all values into Brazilian Portuguese (pt-BR). "
            "If a field is not found or cannot be determined, set its value to null. "
            "Do not include markdown blocks or any other text outside the JSON."
        )

        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[prompt, text],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.0
                )
            )

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
                return json.loads(raw_text)
            except json.JSONDecodeError as je:
                raise ValueError(f"Failed to parse JSON response from AI model. Raw text: {raw_text[:200]}...") from je
        except Exception as e:
            logger.error(f"Error extracting from text: {e}", exc_info=True)
            tb_str = traceback.format_exc()
            raise Exception(f"Extraction from text failed: {str(e)}\nTraceback: {tb_str}") from e
