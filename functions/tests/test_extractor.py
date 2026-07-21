import unittest
from unittest.mock import patch, MagicMock
import os

from core.extractor import DocumentExtractor


class TestExtractor(unittest.TestCase):

    @patch.dict(os.environ, {"FIREBASE_PROJECT_ID": "test-project"})
    @patch('google.genai.Client')
    def test_document_extractor(self, mock_client_class):
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client

        mock_response = MagicMock()
        mock_response.text = '{"nome": "Joao Silva", "document_type": "CNH"}'
        mock_client.models.generate_content.return_value = mock_response

        extractor = DocumentExtractor()
        data = extractor.extract("gs://test-bucket/test.pdf")

        self.assertEqual(data, {"nome": "Joao Silva", "document_type": "CNH"})
        self.assertTrue(mock_client.models.generate_content.called)

    @patch.dict(os.environ, {"FIREBASE_PROJECT_ID": "test-project"})
    @patch('google.genai.Client')
    def test_document_extractor_draft(self, mock_client_class):
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client

        mock_response = MagicMock()
        mock_response.text = '{"text": "This is a draft text."}'
        mock_client.models.generate_content.return_value = mock_response

        extractor = DocumentExtractor()
        data = extractor.extract("gs://test-bucket/draft.pdf", document_type="DRAFT")

        self.assertEqual(data, {"text": "This is a draft text."})
        self.assertTrue(mock_client.models.generate_content.called)

if __name__ == '__main__':
    unittest.main()
