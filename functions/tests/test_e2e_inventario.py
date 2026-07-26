import unittest
from unittest.mock import MagicMock, patch
from core.extractor import DocumentExtractor, deduplicate_entities
from core.validator import DocumentValidator

class TestE2EInventario(unittest.TestCase):
    @patch('google.genai.Client')
    def test_inventario_pipeline(self, mock_client_class):
        # MOCK EXTRACTOR PAYLOADS
        sot_entities = [
            # Certidão de Óbito
            {
                "nome": "JOSÉ PEREIRA",
                "data_obito": "10/05/2026",
                "estado_civil": "Casado",
                "_source_document_type": "Certidão de Óbito",
                "sources": ["Certidão de Óbito"]
            },
            # Certidão de Casamento
            {
                "nome": "JOSÉ PEREIRA",
                "estado_civil": "Casado",
                "regime_bens": "Comunhão Universal",
                "has_marriage_certificate": True,
                "_source_document_type": "Certidão de Casamento",
                "sources": ["Certidão de Casamento"]
            },
            {
                "nome": "MARIA SILVA PEREIRA",
                "estado_civil": "Casado",
                "regime_bens": "Comunhão Universal",
                "has_marriage_certificate": True,
                "_source_document_type": "Certidão de Casamento",
                "sources": ["Certidão de Casamento"]
            },
            # RG Herdeiro
            {
                "nome": "LUCAS SILVA PEREIRA",
                "filiacao_pai": "José",
                "filiacao_mae": "Maria",
                "cpf": "222.333.444-55",
                "_source_document_type": "RG",
                "sources": ["RG"]
            },
            # Matrícula
            {
                "nome": "JOSÉ PEREIRA",
                "matricula": "10.555",
                "_source_document_type": "Matrícula",
                "sources": ["Matrícula"]
            }
        ]

        # STEP 1: Aggregation (Master Profile)
        master_entities = deduplicate_entities(sot_entities)
        ground_truth = {"entities": master_entities}

        # STEP 2: Validation against Minuta text
        minuta_text = "Falecimento de JOSÉ PEREIRA, no dia 15/05/2026. Herdeiro: LUCAS SILVA PEREIRA, CPF 222.333.444-50. Imóvel da Matrícula nº 10.550."

        validator = DocumentValidator(ground_truth, minuta_text)

        real_extractor = DocumentExtractor()
        draft_data = {
            "entities": [
                {
                    "nome": "JOSÉ PEREIRA",
                    "data_obito": "15/05/2026",
                    "matricula": "10.550",
                    "role": "FALECIDO"
                },
                {
                    "nome": "LUCAS SILVA PEREIRA",
                    "cpf": "222.333.444-50",
                    "role": "HERDEIRO"
                }
            ]
        }
        real_extractor.extract_from_text = MagicMock(return_value=draft_data)

        validator._extractor_instance = real_extractor

        errors = validator.validate()

        # Find specific errors
        data_obito_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "data_obito" in e["field"]), None)
        cpf_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "cpf" in e["field"] and e["expected"] == "222.333.444-55"), None)
        matricula_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "matricula" in e["field"]), None)

        # Assertions
        self.assertIsNotNone(data_obito_error, "Should catch Date of Death mismatch")
        self.assertEqual(data_obito_error["expected"], "10/05/2026")
        self.assertEqual(data_obito_error["found"], "15/05/2026")

        self.assertIsNotNone(cpf_error, "Should catch Heir's CPF mismatch")
        self.assertEqual(cpf_error["found"], "222.333.444-50")

        self.assertIsNotNone(matricula_error, "Should catch Matrícula mismatch")
        self.assertEqual(matricula_error["expected"], "10.555")
        self.assertEqual(matricula_error["found"], "10.550")

if __name__ == '__main__':
    unittest.main()
