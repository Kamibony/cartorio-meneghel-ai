import unittest
from unittest.mock import patch, MagicMock
import os

from core.extractor import DocumentExtractor, deduplicate_entities


class TestExtractor(unittest.TestCase):

    def test_deduplicate_entities(self):
        entities = [
            {"cpf": "123.456.789-00", "nome": "Bianca", "rg": "12345"},
            {"cpf": "12345678900", "nome": "Bianca Dantas", "estado_civil": "CASADA"},
            {"cpf": "000.111.222-33", "nome": "João"}
        ]

        merged = deduplicate_entities(entities)

        self.assertEqual(len(merged), 2)

        bianca = next(e for e in merged if e["cpf"] == "12345678900" or e["cpf"] == "123.456.789-00")
        self.assertEqual(bianca["nome"], "Bianca Dantas")
        self.assertEqual(bianca["rg"], "12345")
        self.assertEqual(bianca["estado_civil"], "CASADA")

        joao = next(e for e in merged if e["nome"] == "João")
        self.assertEqual(joao["cpf"], "000.111.222-33")

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
