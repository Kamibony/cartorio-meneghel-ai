import unittest
from unittest.mock import patch, MagicMock
import os
import json

from core.extractor import IdentityExtractor, ComplexDocumentExtractor, get_extractor


class TestExtractor(unittest.TestCase):

    @patch.dict(os.environ, {"FIREBASE_PROJECT_ID": "test-project", "DOCUMENT_AI_PROCESSOR_ID": "test-processor"})
    @patch('google.cloud.documentai.DocumentProcessorServiceClient')
    def test_identity_extractor(self, mock_client_class):
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.processor_path.return_value = "projects/test-project/locations/us/processors/test-processor"

        mock_result = MagicMock()
        mock_entity = MagicMock()
        mock_entity.type_ = "nome"
        mock_entity.mention_text = "Joao Silva"
        mock_result.document.entities = [mock_entity]
        mock_client.process_document.return_value = mock_result

        extractor = IdentityExtractor()
        data = extractor.extract("gs://test-bucket/test.pdf")

        self.assertEqual(data, {"nome": "Joao Silva"})
        self.assertTrue(mock_client.process_document.called)

    @patch.dict(os.environ, {"FIREBASE_PROJECT_ID": "test-project"})
    @patch('vertexai.init')
    @patch('vertexai.generative_models.GenerativeModel')
    @patch('vertexai.generative_models.Part.from_uri')
    def test_complex_document_extractor(self, mock_part, mock_model_class, mock_init):
        mock_model = MagicMock()
        mock_model_class.return_value = mock_model

        mock_response = MagicMock()
        mock_response.text = '{"nome": "Maria Silva", "cpf": "123.456.789-00"}'
        mock_model.generate_content.return_value = mock_response

        extractor = ComplexDocumentExtractor()
        data = extractor.extract("gs://test-bucket/test.pdf")

        self.assertEqual(data, {"nome": "Maria Silva", "cpf": "123.456.789-00"})
        self.assertTrue(mock_model.generate_content.called)

    def test_get_extractor(self):
        with patch.dict(os.environ, {"FIREBASE_PROJECT_ID": "test-project", "DOCUMENT_AI_PROCESSOR_ID": "test-processor"}):
            extractor = get_extractor("CNH")
            self.assertIsInstance(extractor, IdentityExtractor)

        with patch.dict(os.environ, {"FIREBASE_PROJECT_ID": "test-project"}):
            extractor = get_extractor("CERTIDAO")
            self.assertIsInstance(extractor, ComplexDocumentExtractor)

        with self.assertRaises(ValueError):
            get_extractor("UNKNOWN")

if __name__ == '__main__':
    unittest.main()
