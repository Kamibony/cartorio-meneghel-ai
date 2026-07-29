import unittest
from unittest.mock import MagicMock, patch
from core.extractor import DocumentExtractor, get_entity_attr
from core.consolidator import MasterProfileConsolidator
deduplicate_entities = MasterProfileConsolidator.deduplicate_entities
from core.validator import DocumentValidator

class TestE2ECompraVenda(unittest.TestCase):
    @patch('google.genai.Client')
    def test_compra_venda_pipeline(self, mock_client_class):
        sot_entities = [
            {
                "entity_name": "MARCOS SILVA GOMES",
                "entity_type": "PESSOA_FISICA",
                "_source_document_type": "RG",
                "sources": ["RG"],
                "attributes": [
                    {"key": "nome", "value": "MARCOS SILVA GOMES", "data_type": "STRING"},
                    {"key": "filiacao_pai", "value": "Carlos", "data_type": "STRING"},
                    {"key": "filiacao_mae", "value": "Maria", "data_type": "STRING"},
                    {"key": "data_nascimento", "value": "15/04/1985", "data_type": "DATE"},
                    {"key": "cpf", "value": "111.222.333-44", "data_type": "IDENTIFIER"},
                    {"key": "rg", "value": "5.666.777 SSP/PB", "data_type": "IDENTIFIER"},
                    {"key": "estado_civil", "value": "Solteiro", "data_type": "STRING"}
                ]
            },
            {
                "entity_name": "MARCOS SILVA GOMES",
                "entity_type": "PESSOA_FISICA",
                "has_marriage_certificate": True,
                "_source_document_type": "Certidão de Casamento",
                "sources": ["Certidão de Casamento"],
                "attributes": [
                    {"key": "nome", "value": "MARCOS SILVA GOMES", "data_type": "STRING"},
                    {"key": "estado_civil", "value": "Casado", "data_type": "STRING"},
                    {"key": "regime_bens", "value": "Comunhão Parcial", "data_type": "STRING"},
                    {"key": "cpf", "value": "111.222.333-44", "data_type": "IDENTIFIER"}
                ]
            },
            {
                "entity_name": "RAFAEL COSTA",
                "entity_type": "PESSOA_FISICA",
                "_source_document_type": "CNH",
                "sources": ["CNH"],
                "attributes": [
                    {"key": "nome", "value": "RAFAEL COSTA", "data_type": "STRING"},
                    {"key": "rg", "value": "9.888.777 SSP/PB", "data_type": "IDENTIFIER"},
                    {"key": "cpf", "value": "888.999.000-11", "data_type": "IDENTIFIER"}
                ]
            },
            {
                "entity_name": "Imóvel X",
                "entity_type": "IMOVEL",
                "_source_document_type": "Matrícula",
                "sources": ["Matrícula"],
                "attributes": [
                    {"key": "matricula", "value": "85.432", "data_type": "IDENTIFIER"}
                ]
            }
        ]

        master_entities = deduplicate_entities(sot_entities)
        from core.models import validate_entity
        master_entities = [validate_entity(ent) for ent in master_entities]
        ground_truth = {"entities": master_entities}

        marcos = next(e for e in master_entities if get_entity_attr(e, "cpf") == "111.222.333-44")
        self.assertEqual(get_entity_attr(marcos, "estado_civil"), "Casado(a)")

        minuta_text = "VENDEDOR: MARCOS SILVA GOMES, solteiro, RG 5.666.777 SSP/PB, CPF 111.222.333-45. COMPRADOR: RAFAEL COSTA, solteiro, RG 9.888.777 SSP/PB e CPF 888.999.000-11. Imóvel matriculado sob o nº 85.430."

        validator = DocumentValidator(ground_truth, minuta_text)
        real_extractor = DocumentExtractor()
        draft_data = {
            "entities": [
                {
                    "entity_name": "MARCOS SILVA GOMES",
                    "entity_type": "PESSOA_FISICA",
                    "attributes": [
                        {"key": "nome", "value": "MARCOS SILVA GOMES", "data_type": "STRING"},
                        {"key": "estado_civil", "value": "solteiro", "data_type": "STRING"},
                        {"key": "rg", "value": "5.666.777 SSP/PB", "data_type": "IDENTIFIER"},
                        {"key": "cpf", "value": "111.222.333-45", "data_type": "IDENTIFIER"},
                        {"key": "role", "value": "VENDEDOR", "data_type": "STRING"}
                    ]
                },
                {
                    "entity_name": "RAFAEL COSTA",
                    "entity_type": "PESSOA_FISICA",
                    "attributes": [
                        {"key": "nome", "value": "RAFAEL COSTA", "data_type": "STRING"},
                        {"key": "estado_civil", "value": "solteiro", "data_type": "STRING"},
                        {"key": "rg", "value": "9.888.777 SSP/PB", "data_type": "IDENTIFIER"},
                        {"key": "cpf", "value": "888.999.000-11", "data_type": "IDENTIFIER"},
                        {"key": "role", "value": "COMPRADOR", "data_type": "STRING"}
                    ]
                },
                {
                    "entity_name": "Imóvel X",
                    "entity_type": "IMOVEL",
                    "attributes": [
                        {"key": "matricula", "value": "85.430", "data_type": "IDENTIFIER"}
                    ]
                }
            ]
        }
        real_extractor.extract_from_text = MagicMock(return_value=draft_data)
        validator._extractor_instance = real_extractor
        errors = validator.validate()

        cpf_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "cpf" in e["field"] and e["expected"] == "111.222.333-44"), None)
        matricula_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "matricula" in e["field"]), None)
        estado_civil_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "estado_civil" in e["field"] and e["expected"] == "Casado(a)"), None)

        self.assertIsNotNone(cpf_error)
        self.assertIsNotNone(matricula_error)
        self.assertIsNotNone(estado_civil_error)

if __name__ == '__main__':
    unittest.main()
