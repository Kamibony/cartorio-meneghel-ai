import unittest
from unittest.mock import MagicMock, patch
from core.extractor import DocumentExtractor, deduplicate_entities
from core.validator import DocumentValidator

class TestE2EDoacao(unittest.TestCase):
    @patch('google.genai.Client')
    def test_doacao_pipeline(self, mock_client_class):
        # MOCK EXTRACTOR PAYLOADS
        sot_entities = [
            # RG Doador
            {
                "nome": "CARLOS ALBERTO",
                "cpf": "333.444.555-66",
                "estado_civil": "Divorciado",
                "_source_document_type": "RG",
                "sources": ["RG"]
            },
            # RG Donatário
            {
                "nome": "ANA CLARA",
                "cpf": "777.888.999-00",
                "_source_document_type": "RG",
                "sources": ["RG"]
            },
            # Guia ITCD (SEFAZ)
            {
                "nome": "CARLOS ALBERTO",
                "aliquota_itcd": "6%",
                "_source_document_type": "Guia ITCD",
                "sources": ["Guia ITCD"]
            },
            # Matrícula
            {
                "nome": "CARLOS ALBERTO",
                "matricula": "99.111",
                "_source_document_type": "Matrícula",
                "sources": ["Matrícula"]
            }
        ]

        # STEP 1: Aggregation (Master Profile)
        master_entities = deduplicate_entities(sot_entities)
        ground_truth = {"entities": master_entities}

        # STEP 2: Validation against Minuta text
        minuta_text = "DOADOR: CARLOS ALBERTO, CPF 333.444.555-66. DONATÁRIO: ANA CLARA, CPF 777.888.999-11. Imóvel da Matrícula 99.111. O imposto ITCD foi recolhido sob a alíquota de 4%."

        validator = DocumentValidator(ground_truth, minuta_text)

        real_extractor = DocumentExtractor()
        draft_data = {
            "entities": [
                {
                    "nome": "CARLOS ALBERTO",
                    "cpf": "333.444.555-66",
                    "aliquota_itcd": "4%",
                    "matricula": "99.111",
                    "role": "DOADOR"
                },
                {
                    "nome": "ANA CLARA",
                    "cpf": "777.888.999-11",
                    "role": "DONATÁRIO"
                }
            ]
        }
        real_extractor.extract_from_text = MagicMock(return_value=draft_data)

        validator._extractor_instance = real_extractor

        errors = validator.validate()

        # Find specific errors
        cpf_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "cpf" in e["field"] and e["expected"] == "777.888.999-00"), None)
        aliquota_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "aliquota_itcd" in e["field"]), None)

        # Assertions
        self.assertIsNotNone(cpf_error, "Should catch Donee's CPF mismatch")
        self.assertEqual(cpf_error["found"], "777.888.999-11")

        self.assertIsNotNone(aliquota_error, "Should catch ITCD Alíquota mismatch")
        self.assertEqual(aliquota_error["expected"], "6%")
        self.assertEqual(aliquota_error["found"], "4%")

if __name__ == '__main__':
    unittest.main()
