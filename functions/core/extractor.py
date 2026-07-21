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
                "Analyze this document. Identify its type automatically and extract all relevant structured data. "
                "Return the data strictly as a valid JSON object. "
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
