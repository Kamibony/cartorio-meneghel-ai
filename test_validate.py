from core.validator import DocumentValidator

gt = {
    "entities": [
        {
            "cpf": "123.456.789-00",
            "nome": "João Silva"
        }
    ]
}

text = "O cpf 12345678900 de JOAO SILVA"
validator = DocumentValidator(gt, text)

# Mock extractor to return something
from unittest.mock import MagicMock
mock_extractor = MagicMock()
mock_extractor.extract_from_text.return_value = {
    "entities": [
        {
            "role": "OUTORGANTE",
            "cpf": "123.456.789-00",
            "nome": "João Silva"
        }
    ]
}
validator._extractor_instance = mock_extractor

errors = validator.validate()
print("Errors:", errors)

# Try with mismatched data
mock_extractor.extract_from_text.return_value = {
    "entities": [
        {
            "role": "OUTORGANTE",
            "cpf": "123.456.789-01",
            "nome": "Joao Silva"
        }
    ]
}
validator = DocumentValidator(gt, text)
validator._extractor_instance = mock_extractor
errors = validator.validate()
print("Errors mismatched:", errors)
