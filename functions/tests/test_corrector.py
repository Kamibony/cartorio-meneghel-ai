import unittest
from unittest.mock import MagicMock, patch
from core.corrector import DocumentCorrector

class TestDocumentCorrector(unittest.TestCase):
    @patch('google.genai.Client')
    def test_successful_replacement(self, MockClient):
        # Setup mock
        mock_client = MagicMock()
        mock_models = MagicMock()
        mock_response = MagicMock()

        # Simulated AI response JSON
        mock_response.text = '''[
            {"block_index": 0, "prefix": "nascido em ", "suffix": ",", "new_value": "26/06/2000"},
            {"block_index": 0, "prefix": "estado civil ", "suffix": ".", "new_value": "solteiro"}
        ]'''

        mock_models.generate_content.return_value = mock_response
        mock_client.models = mock_models
        MockClient.return_value = mock_client

        corrector = DocumentCorrector()

        draft_text = "O homem nascido em 26/08/2000, estado civil casado."
        validation_errors = [
            {"field": "data_nascimento", "expected": "26/06/2000", "found": "26/08/2000"},
            {"field": "estado_civil", "expected": "solteiro", "found": "casado"}
        ]

        result = corrector.correct_text(draft_text, validation_errors)

        expected_text = "O homem nascido em 26/06/2000, estado civil solteiro."
        self.assertEqual(result, expected_text)

    @patch('google.genai.Client')
    def test_missing_text_safely_ignored(self, MockClient):
        mock_client = MagicMock()
        mock_models = MagicMock()
        mock_response = MagicMock()

        mock_response.text = '''[
            {"block_index": 0, "prefix": "nao existe ", "suffix": " aqui", "new_value": "novo texto"}
        ]'''

        mock_models.generate_content.return_value = mock_response
        mock_client.models = mock_models
        MockClient.return_value = mock_client

        corrector = DocumentCorrector()

        draft_text = "O documento original."
        validation_errors = [
            {"field": "qualquer", "expected": "novo texto", "found": "texto inexistente"}
        ]

        result = corrector.correct_text(draft_text, validation_errors)

        # Output should be unmodified draft_text
        self.assertEqual(result, "O documento original.")

    def test_no_validation_errors(self):
        corrector = DocumentCorrector()
        draft_text = "Tudo perfeito."

        # Should return text directly without calling AI
        result = corrector.correct_text(draft_text, [])
        self.assertEqual(result, draft_text)

    @patch('google.genai.Client')
    def test_whitespace_resilience(self, MockClient):
        mock_client = MagicMock()
        mock_models = MagicMock()
        mock_response = MagicMock()

        mock_response.text = '''[
            {"block_index": 0, "prefix": "nome é ", "suffix": " , residente", "new_value": "João da Silva"}
        ]'''

        mock_models.generate_content.return_value = mock_response
        mock_client.models = mock_models
        MockClient.return_value = mock_client

        corrector = DocumentCorrector()

        draft_text = "O nome é   João  da Silva , residente"
        validation_errors = [
            {"field": "nome", "expected": "João da Silva", "found": "João  da Silva"}
        ]

        result = corrector.correct_text(draft_text, validation_errors)

        expected_text = "O nome é João da Silva , residente"
        self.assertEqual(result, expected_text)

if __name__ == '__main__':
    unittest.main()
