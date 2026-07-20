import os
import json
from abc import ABC, abstractmethod
from typing import Dict, Any


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
        self.project_id = os.environ.get("FIREBASE_PROJECT_ID", "cartorio-meneghel-ai")
        self.location = os.environ.get("DOCUMENT_AI_LOCATION", "us")
        self.processor_id = os.environ.get("DOCUMENT_AI_PROCESSOR_ID")

        if not self.project_id or not self.processor_id:
            raise ValueError(
                "FIREBASE_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID environment variables must be set."
            )

    def extract(self, gcs_uri: str) -> Dict[str, Any]:
        """
        Extracts data using Google Cloud Document AI.

        Args:
            gcs_uri (str): The GCS URI of the document.

        Returns:
            Dict[str, Any]: The extracted entities as a dictionary.
        """
        from google.cloud import documentai

        client = documentai.DocumentProcessorServiceClient()
        name = client.processor_path(self.project_id, self.location, self.processor_id)

        mime_type = "application/pdf"
        if gcs_uri.lower().endswith(".jpg") or gcs_uri.lower().endswith(".jpeg"):
            mime_type = "image/jpeg"
        elif gcs_uri.lower().endswith(".png"):
            mime_type = "image/png"
        elif gcs_uri.lower().endswith(".doc") or gcs_uri.lower().endswith(".docx"):
            # Vertex AI supports Word docs as application/msword or application/vnd.openxmlformats-officedocument.wordprocessingml.document
            # but we can try generic octet-stream or specific if needed. Let's use the standard ones:
            mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" if gcs_uri.lower().endswith(".docx") else "application/msword"

        gcs_doc = documentai.GcsDocument(gcs_uri=gcs_uri, mime_type=mime_type)
        request = documentai.ProcessRequest(
            name=name,
            gcs_document=gcs_doc
        )

        result = client.process_document(request=request)
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
        self.project_id = os.environ.get("FIREBASE_PROJECT_ID", "cartorio-meneghel-ai")
        self.location = os.environ.get("VERTEX_AI_LOCATION", "us-central1")

        if not self.project_id:
            raise ValueError("FIREBASE_PROJECT_ID environment variable must be set.")

    def extract(self, gcs_uri: str) -> Dict[str, Any]:
        """
        Extracts data using Vertex AI Gemini model.

        Args:
            gcs_uri (str): The GCS URI of the document.

        Returns:
            Dict[str, Any]: The extracted structured data.
        """
        import vertexai
        from vertexai.generative_models import GenerativeModel, Part, GenerationConfig

        vertexai.init(project=self.project_id, location=self.location)
        model = GenerativeModel("gemini-2.5-flash")

        mime_type = "application/pdf"
        if gcs_uri.lower().endswith(".jpg") or gcs_uri.lower().endswith(".jpeg"):
            mime_type = "image/jpeg"
        elif gcs_uri.lower().endswith(".png"):
            mime_type = "image/png"
        elif gcs_uri.lower().endswith(".doc") or gcs_uri.lower().endswith(".docx"):
            mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" if gcs_uri.lower().endswith(".docx") else "application/msword"

        file_part = Part.from_uri(uri=gcs_uri, mime_type=mime_type)

        prompt = (
            "Extract the relevant fields from this document. "
            "Return the data strictly as a valid JSON object. "
            "Do not include markdown blocks or any other text outside the JSON."
        )

        response = model.generate_content(
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


class DraftExtractor(DocumentExtractor):
    """
    Extractor for draft documents (Minuta) using Vertex AI with Gemini 2.5 Flash
    to extract the full raw text.
    """

    def __init__(self) -> None:
        """Initializes the DraftExtractor."""
        self.project_id = os.environ.get("FIREBASE_PROJECT_ID", "cartorio-meneghel-ai")
        self.location = os.environ.get("VERTEX_AI_LOCATION", "us-central1")

        if not self.project_id:
            raise ValueError("FIREBASE_PROJECT_ID environment variable must be set.")

    def extract(self, gcs_uri: str) -> Dict[str, Any]:
        """
        Extracts raw text using Vertex AI Gemini model.

        Args:
            gcs_uri (str): The GCS URI of the document.

        Returns:
            Dict[str, Any]: A dictionary containing the extracted raw text {"text": "..."}.
        """
        import vertexai
        from vertexai.generative_models import GenerativeModel, Part, GenerationConfig

        vertexai.init(project=self.project_id, location=self.location)
        model = GenerativeModel("gemini-2.5-flash")

        mime_type = "application/pdf"
        if gcs_uri.lower().endswith(".jpg") or gcs_uri.lower().endswith(".jpeg"):
            mime_type = "image/jpeg"
        elif gcs_uri.lower().endswith(".png"):
            mime_type = "image/png"
        elif gcs_uri.lower().endswith(".doc") or gcs_uri.lower().endswith(".docx"):
            mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" if gcs_uri.lower().endswith(".docx") else "application/msword"

        file_part = Part.from_uri(uri=gcs_uri, mime_type=mime_type)

        prompt = (
            "Extract the full raw text from this document. "
            "Return the data strictly as a valid JSON object with a single key 'text' containing the extracted text. "
            "Do not include markdown blocks or any other text outside the JSON."
        )

        response = model.generate_content(
            [file_part, prompt],
            generation_config=GenerationConfig(
                response_mime_type="application/json"
            )
        )

        if not response.text:
            raise ValueError("Empty response received from Vertex AI.")

        try:
            result = json.loads(response.text)
            if "text" not in result:
                 # Fallback if the model returns something else
                 return {"text": response.text}
            return result
        except json.JSONDecodeError:
            # If the model fails to return strict JSON, wrap it.
            return {"text": response.text}


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
    draft_types = {"DRAFT", "MINUTA"}

    doc_type_upper = document_type.upper()

    if doc_type_upper in identity_types:
        return IdentityExtractor()
    elif doc_type_upper in complex_types:
        return ComplexDocumentExtractor()
    elif doc_type_upper in draft_types:
        return DraftExtractor()
    else:
        raise ValueError(f"Unsupported document type: {document_type}")
