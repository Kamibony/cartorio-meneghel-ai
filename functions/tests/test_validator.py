import unittest
from unittest.mock import MagicMock
from core.validator import DocumentValidator, Discrepancy

class TestDocumentValidator(unittest.TestCase):
    def setUp(self):
        self.ground_truth = {
            "entities": [
                {
                    "cpf": "702.478.934-47",
                    "nome": "JOAO DA SILVA"
                }
            ]
        }

    def test_value_mismatch_hallucination_filtered(self):
        # The exact string "JOAO DA SILVA" is in the text.
        typed_text = "O nome é JOAO DA SILVA e o cpf é 702.478.934-47."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        # Mock LLM hallucinations: returning a VALUE_MISMATCH but the found_in_text is not actually in the draft
        mock_extractor.audit_draft.return_value = [
            {
                "field": "entities[0].nome",
                "category": "VALUE_MISMATCH",
                "message": "Nome não confere",
                "expected": "JOAO DA SILVA",
                "found_in_text": "JOAO SILVA" # This substring does NOT exist in typed_text
            }
        ]
        validator._extractor_instance = mock_extractor

        errors = validator.validate()

        # The Hallucination filter should catch it because "JOAO SILVA" not in "O nome é JOAO DA SILVA..."
        self.assertEqual(len(errors), 0)

    def test_value_mismatch_passed(self):
        typed_text = "O nome é JOAO SILVA e o cpf é 702.478.934-47."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.audit_draft.return_value = [
            {
                "field": "entities[0].nome",
                "category": "VALUE_MISMATCH",
                "message": "Nome não confere",
                "expected": "JOAO DA SILVA",
                "found_in_text": "JOAO SILVA" # This substring DOES exist in typed_text
            }
        ]
        validator._extractor_instance = mock_extractor

        errors = validator.validate()

        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "entities[0].nome")

    def test_missing_field_hallucination_filtered(self):
        # The expected value "702.478.934-47" is exactly in the text.
        typed_text = "O nome é JOAO DA SILVA e o cpf é 702.478.934-47."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        # Mock LLM hallucinations: claiming MISSING_FIELD but the exact expected string IS in the draft
        mock_extractor.audit_draft.return_value = [
            {
                "field": "entities[0].cpf",
                "category": "MISSING_FIELD",
                "message": "CPF ausente",
                "expected": "702.478.934-47",
                "found_in_text": None
            }
        ]
        validator._extractor_instance = mock_extractor

        errors = validator.validate()

        # The Reverse-Hallucination filter should catch it
        self.assertEqual(len(errors), 0)

    def test_missing_field_passed(self):
        typed_text = "O nome é JOAO DA SILVA e o cpf não está aqui."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.audit_draft.return_value = [
            {
                "field": "entities[0].cpf",
                "category": "MISSING_FIELD",
                "message": "CPF ausente",
                "expected": "702.478.934-47",
                "found_in_text": None
            }
        ]
        validator._extractor_instance = mock_extractor

        errors = validator.validate()

        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "entities[0].cpf")

if __name__ == '__main__':
    unittest.main()
