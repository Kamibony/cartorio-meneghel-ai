import os
import json
from abc import ABC, abstractmethod
from typing import Dict, Any

from google.cloud import documentai
import vertexai
from vertexai.generative_models import GenerativeModel, Part, GenerationConfig


class DocumentExtractor(ABC):
    """
    Abstract base class for all document extractors.
    """

    @abstractmethod
    def extract(self, gcs_uri: str) -> Dict[str, Any]:
        """
        Extracts structured data from a document given its GCS URI.

        Args:
            gcs_uri (str): The Google Cloud Storage URI of the document.

        Returns:
            Dict[str, Any]: The extracted structured data.
        """
        pass


class IdentityExtractor(DocumentExtractor):
    """
    Extractor for standard identification documents (e.g., CNH, RG)
    using Google Cloud Document AI.
    """

    def __init__(self) -> None:
        """Initializes the IdentityExtractor."""
        self.project_id = os.environ.get("FIREBASE_PROJECT_ID")
        self.location = os.environ.get("DOCUMENT_AI_LOCATION", "us")
        self.processor_id = os.environ.get("DOCUMENT_AI_PROCESSOR_ID")

        if not self.project_id or not self.processor_id:
            raise ValueError(
                "FIREBASE_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID environment variables must be set."
            )

        self.client = documentai.DocumentProcessorServiceClient()

    def extract(self, gcs_uri: str) -> Dict[str, Any]:
        """
        Extracts data using Google Cloud Document AI.

        Args:
            gcs_uri (str): The GCS URI of the document.

        Returns:
            Dict[str, Any]: The extracted entities as a dictionary.
        """
        name = self.client.processor_path(self.project_id, self.location, self.processor_id)

        mime_type = "application/pdf"
        if gcs_uri.lower().endswith(".jpg") or gcs_uri.lower().endswith(".jpeg"):
            mime_type = "image/jpeg"
        elif gcs_uri.lower().endswith(".png"):
            mime_type = "image/png"

        gcs_doc = documentai.GcsDocument(gcs_uri=gcs_uri, mime_type=mime_type)
        request = documentai.ProcessRequest(
            name=name,
            gcs_document=gcs_doc
        )

        result = self.client.process_document(request=request)
        document = result.document

        extracted_data = {}
        for entity in document.entities:
            extracted_data[entity.type_] = entity.mention_text

        return extracted_data


class ComplexDocumentExtractor(DocumentExtractor):
    """
    Extractor for complex or semi-structured documents (e.g., Certidões, IPTU)
    using Vertex AI with Gemini 2.5 Flash.
    """

    def __init__(self) -> None:
        """Initializes the ComplexDocumentExtractor."""
        self.project_id = os.environ.get("FIREBASE_PROJECT_ID")
        self.location = os.environ.get("VERTEX_AI_LOCATION", "us-central1")

        if not self.project_id:
            raise ValueError("FIREBASE_PROJECT_ID environment variable must be set.")

        vertexai.init(project=self.project_id, location=self.location)
        self.model = GenerativeModel("gemini-2.5-flash")

    def extract(self, gcs_uri: str) -> Dict[str, Any]:
        """
        Extracts data using Vertex AI Gemini model.

        Args:
            gcs_uri (str): The GCS URI of the document.

        Returns:
            Dict[str, Any]: The extracted structured data.
        """
        mime_type = "application/pdf"
        if gcs_uri.lower().endswith(".jpg") or gcs_uri.lower().endswith(".jpeg"):
            mime_type = "image/jpeg"
        elif gcs_uri.lower().endswith(".png"):
            mime_type = "image/png"

        file_part = Part.from_uri(uri=gcs_uri, mime_type=mime_type)

        prompt = (
            "Extract the relevant fields from this document. "
            "Return the data strictly as a valid JSON object. "
            "Do not include markdown blocks or any other text outside the JSON."
        )

        response = self.model.generate_content(
            [file_part, prompt],
            generation_config=GenerationConfig(
                response_mime_type="application/json"
            )
        )

        if not response.text:
            raise ValueError("Empty response received from Vertex AI.")

        try:
            return json.loads(response.text)
        except json.JSONDecodeError:
            raise ValueError(f"Failed to parse JSON response from Vertex AI. Response was: {response.text}")


def get_extractor(document_type: str) -> DocumentExtractor:
    """
    Router/Factory to get the appropriate extractor based on document type.

    Args:
        document_type (str): The type of the document (e.g., 'CNH', 'RG', 'CERTIDAO').

    Returns:
        DocumentExtractor: An instance of a DocumentExtractor subclass.

    Raises:
        ValueError: If the document type is unsupported.
    """
    identity_types = {"CNH", "RG"}
    complex_types = {"CERTIDAO", "IPTU"}

    doc_type_upper = document_type.upper()

    if doc_type_upper in identity_types:
        return IdentityExtractor()
    elif doc_type_upper in complex_types:
        return ComplexDocumentExtractor()
    else:
        raise ValueError(f"Unsupported document type: {document_type}")
