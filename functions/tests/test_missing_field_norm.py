import unittest
from core.validator import DocumentValidator, Discrepancy
from unittest.mock import MagicMock

class TestMissingFieldNorm(unittest.TestCase):
    def test_missing_field_normalization_filtering(self):
        ground_truth = {"entities": [{"nome": "JOÃO DA SILVÁ"}]}
        typed_text = "O nome é joao da silva."

        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.audit_draft.return_value = [
            {
                "field": "entities[0].nome",
                "category": "MISSING_FIELD",
                "message": "Missing",
                "expected": "JOÃO DA SILVÁ",
                "found_in_text": None
            }
        ]
        validator._extractor_instance = mock_extractor

        errors = validator.validate()

        # Should be filtered out because "JOÃO DA SILVÁ" normalized is "JOAO DA SILVA"
        # which IS in the normalized typed text "O NOME E JOAO DA SILVA."
        self.assertEqual(len(errors), 0)

if __name__ == '__main__':
    unittest.main()
