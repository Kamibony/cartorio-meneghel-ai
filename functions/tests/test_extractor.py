import unittest
from unittest.mock import MagicMock, patch
from core.extractor import DocumentExtractor, deduplicate_entities, get_entity_attr

class TestExtractor(unittest.TestCase):

    def test_deduplicate_entities(self):
        entities = [
            {
                "entity_name": "João",
                "entity_type": "PESSOA_FISICA",
                "attributes": [
                    {"key": "nome", "value": "João", "data_type": "STRING"},
                    {"key": "cpf", "value": "000.111.222-33", "data_type": "IDENTIFIER"}
                ]
            },
            {
                "entity_name": "João",
                "entity_type": "PESSOA_FISICA",
                "attributes": [
                    {"key": "nome", "value": "João", "data_type": "STRING"},
                    {"key": "cpf", "value": "00011122233", "data_type": "IDENTIFIER"}
                ]
            },
            {
                "entity_name": "Bianca Dantas",
                "entity_type": "PESSOA_FISICA",
                "attributes": [
                    {"key": "nome", "value": "Bianca Dantas", "data_type": "STRING"},
                    {"key": "cpf", "value": "123.456.789-00", "data_type": "IDENTIFIER"},
                    {"key": "rg", "value": "12345", "data_type": "IDENTIFIER"}
                ]
            },
            {
                "entity_name": "Bianca Dantas",
                "entity_type": "PESSOA_FISICA",
                "attributes": [
                    {"key": "nome", "value": "Bianca Dantas", "data_type": "STRING"},
                    {"key": "rg", "value": "12345", "data_type": "IDENTIFIER"}
                ]
            }
        ]

        merged = deduplicate_entities(entities)

        # João should be merged into one
        # Bianca should be merged into one
        self.assertEqual(len(merged), 2)

        joao = next(e for e in merged if get_entity_attr(e, "cpf") == "00011122233" or get_entity_attr(e, "cpf") == "000.111.222-33")
        self.assertEqual(get_entity_attr(joao, "nome"), "João")

        bianca = next(e for e in merged if get_entity_attr(e, "cpf") == "12345678900" or get_entity_attr(e, "cpf") == "123.456.789-00")
        self.assertEqual(get_entity_attr(bianca, "rg"), "12345")
        self.assertEqual(get_entity_attr(bianca, "nome"), "Bianca Dantas")

    @patch('google.genai.Client')
    def test_document_extractor(self, mock_client_class):
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client

        mock_response = MagicMock()
        mock_response.text = '{"entities": [{"entity_type": "PESSOA_FISICA", "entity_name": "Teste", "attributes": [{"key": "nome", "value": "Teste", "data_type": "STRING"}]}], "document_type": "RG"}'
        mock_client.models.generate_content.return_value = mock_response

        extractor = DocumentExtractor()
        data = extractor.extract("gs://bucket/doc.pdf")

        self.assertIn("entities", data)
        self.assertEqual(data["document_type"], "RG")
        self.assertEqual(data["entities"][0]["_source_document_type"], "RG")

    @patch('google.genai.Client')
    def test_document_extractor_draft(self, mock_client_class):
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client

        mock_response = MagicMock()
        mock_response.text = '{"text": "Texto da minuta"}'
        mock_client.models.generate_content.return_value = mock_response

        extractor = DocumentExtractor()
        data = extractor.extract("gs://bucket/doc.pdf", "DRAFT")

        self.assertEqual(data["text"], "Texto da minuta")

if __name__ == '__main__':
    unittest.main()