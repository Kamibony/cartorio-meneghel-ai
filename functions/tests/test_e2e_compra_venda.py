import unittest
from unittest.mock import MagicMock
from core.extractor import DocumentExtractor, deduplicate_entities
from core.validator import DocumentValidator
from unittest.mock import patch

class TestE2ECompraVenda(unittest.TestCase):
    @patch('google.genai.Client')
    def test_compra_venda_pipeline(self, mock_client_class):
        # MOCK EXTRACTOR PAYLOADS
        sot_entities = [
            # RG Vendedor
            {
                "nome": "MARCOS SILVA GOMES",
                "filiacao_pai": "Carlos",
                "filiacao_mae": "Maria",
                "data_nascimento": "15/04/1985",
                "cpf": "111.222.333-44",
                "rg": "5.666.777 SSP/PB",
                "estado_civil": "Solteiro",
                "_source_document_type": "RG",
                "sources": ["RG"]
            },
            # Certidão Casamento Vendedor
            {
                "nome": "MARCOS SILVA GOMES",
                "estado_civil": "Casado",
                "regime_bens": "Comunhão Parcial",
                "has_marriage_certificate": True,
                "_source_document_type": "Certidão de Casamento",
                "sources": ["Certidão de Casamento"]
            },
            {
                "nome": "LETÍCIA SOUZA GOMES",
                "estado_civil": "Casado",
                "regime_bens": "Comunhão Parcial",
                "has_marriage_certificate": True,
                "_source_document_type": "Certidão de Casamento",
                "sources": ["Certidão de Casamento"]
            },
            # CNH Comprador
            {
                "nome": "RAFAEL COSTA",
                "rg": "9.888.777 SSP/PB",
                "cpf": "888.999.000-11",
                "_source_document_type": "CNH",
                "sources": ["CNH"]
            },
            # Matrícula
            {
                "nome": "MARCOS SILVA GOMES", # owner
                "matricula": "85.432",
                "_source_document_type": "Matrícula",
                "sources": ["Matrícula"]
            }
        ]

        # STEP 1: Aggregation (Master Profile)
        master_entities = deduplicate_entities(sot_entities)
        ground_truth = {"entities": master_entities}

        # Validate master profile overrides
        marcos = next(e for e in master_entities if e["cpf"] == "111.222.333-44")
        self.assertEqual(marcos["estado_civil"], "Casado")

        # STEP 2: Validation against Minuta text
        minuta_text = "VENDEDOR: MARCOS SILVA GOMES, solteiro, RG 5.666.777 SSP/PB, CPF 111.222.333-45. COMPRADOR: RAFAEL COSTA, solteiro, RG 9.888.777 SSP/PB e CPF 888.999.000-11. Imóvel matriculado sob o nº 85.430."

        validator = DocumentValidator(ground_truth, minuta_text)

        # We need to mock the extractor instance inside validator
        real_extractor = DocumentExtractor()
        draft_data = {
            "entities": [
                {
                    "nome": "MARCOS SILVA GOMES",
                    "estado_civil": "solteiro",
                    "rg": "5.666.777 SSP/PB",
                    "cpf": "111.222.333-45",
                    "matricula": "85.430",
                    "role": "VENDEDOR"
                },
                {
                    "nome": "RAFAEL COSTA",
                    "estado_civil": "solteiro",
                    "rg": "9.888.777 SSP/PB",
                    "cpf": "888.999.000-11",
                    "role": "COMPRADOR"
                }
            ]
        }
        real_extractor.extract_from_text = MagicMock(return_value=draft_data)

        validator._extractor_instance = real_extractor

        errors = validator.validate()

        # Find specific errors
        cpf_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "cpf" in e["field"] and e["expected"] == "111.222.333-44"), None)
        matricula_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "matricula" in e["field"]), None)
        estado_civil_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "estado_civil" in e["field"] and e["expected"] == "Casado"), None)

        # Assertions
        self.assertIsNotNone(cpf_error, "Should catch Seller's CPF mismatch")
        self.assertEqual(cpf_error["found"], "111.222.333-45")

        self.assertIsNotNone(matricula_error, "Should catch Matrícula mismatch")
        self.assertEqual(matricula_error["expected"], "85.432")
        self.assertEqual(matricula_error["found"], "85.430")

        self.assertIsNotNone(estado_civil_error, "Should catch Seller's Estado Civil mismatch")
        self.assertEqual(estado_civil_error["found"], "solteiro")

if __name__ == '__main__':
    unittest.main()
