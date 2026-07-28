import unittest
from unittest.mock import MagicMock, patch
from core.extractor import DocumentExtractor, get_entity_attr
from core.consolidator import MasterProfileConsolidator
deduplicate_entities = MasterProfileConsolidator.deduplicate_entities
from core.validator import DocumentValidator

class TestE2EDoacao(unittest.TestCase):
    @patch('google.genai.Client')
    def test_doacao_pipeline(self, mock_client_class):
        sot_entities = [
            {
                "entity_name": "CARLOS ALBERTO",
                "entity_type": "PESSOA_FISICA",
                "_source_document_type": "RG",
                "sources": ["RG"],
                "attributes": [
                    {"key": "nome", "value": "CARLOS ALBERTO", "data_type": "STRING"},
                    {"key": "cpf", "value": "333.444.555-66", "data_type": "IDENTIFIER"},
                    {"key": "estado_civil", "value": "Divorciado", "data_type": "STRING"}
                ]
            },
            {
                "entity_name": "ANA CLARA",
                "entity_type": "PESSOA_FISICA",
                "_source_document_type": "RG",
                "sources": ["RG"],
                "attributes": [
                    {"key": "nome", "value": "ANA CLARA", "data_type": "STRING"},
                    {"key": "cpf", "value": "777.888.999-00", "data_type": "IDENTIFIER"}
                ]
            },
            {
                "entity_name": "CARLOS ALBERTO",
                "entity_type": "PESSOA_FISICA",
                "_source_document_type": "Guia ITCD",
                "sources": ["Guia ITCD"],
                "attributes": [
                    {"key": "nome", "value": "CARLOS ALBERTO", "data_type": "STRING"},
                    {"key": "aliquota_itcd", "value": "6%", "data_type": "STRING"}
                ]
            },
            {
                "entity_name": "CARLOS ALBERTO",
                "entity_type": "IMOVEL",
                "_source_document_type": "Matrícula",
                "sources": ["Matrícula"],
                "attributes": [
                    {"key": "matricula", "value": "99.111", "data_type": "IDENTIFIER"}
                ]
            }
        ]

        master_entities = deduplicate_entities(sot_entities)
        ground_truth = {"entities": master_entities}

        minuta_text = "DOADOR: CARLOS ALBERTO, CPF 333.444.555-66. DONATÁRIO: ANA CLARA, CPF 777.888.999-11. Imóvel da Matrícula 99.111. O imposto ITCD foi recolhido sob a alíquota de 4%."

        validator = DocumentValidator(ground_truth, minuta_text)
        real_extractor = DocumentExtractor()
        draft_data = {
            "entities": [
                {
                    "entity_name": "CARLOS ALBERTO",
                    "entity_type": "PESSOA_FISICA",
                    "attributes": [
                        {"key": "nome", "value": "CARLOS ALBERTO", "data_type": "STRING"},
                        {"key": "cpf", "value": "333.444.555-66", "data_type": "IDENTIFIER"},
                        {"key": "aliquota_itcd", "value": "4%", "data_type": "STRING"},
                        {"key": "matricula", "value": "99.111", "data_type": "IDENTIFIER"},
                        {"key": "role", "value": "DOADOR", "data_type": "STRING"}
                    ]
                },
                {
                    "entity_name": "ANA CLARA",
                    "entity_type": "PESSOA_FISICA",
                    "attributes": [
                        {"key": "nome", "value": "ANA CLARA", "data_type": "STRING"},
                        {"key": "cpf", "value": "777.888.999-11", "data_type": "IDENTIFIER"},
                        {"key": "role", "value": "DONATÁRIO", "data_type": "STRING"}
                    ]
                },
                {
                    "entity_name": "CARLOS ALBERTO",
                    "entity_type": "IMOVEL",
                    "attributes": [
                        {"key": "matricula", "value": "99.111", "data_type": "IDENTIFIER"}
                    ]
                }
            ]
        }
        real_extractor.extract_from_text = MagicMock(return_value=draft_data)
        validator._extractor_instance = real_extractor
        errors = validator.validate()

        cpf_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "cpf" in e["field"] and e["expected"] == "777.888.999-00"), None)
        aliquota_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "aliquota_itcd" in e["field"]), None)

        self.assertIsNotNone(cpf_error)
        self.assertEqual(cpf_error["found"], "777.888.999-11")

        self.assertIsNotNone(aliquota_error)
        self.assertEqual(aliquota_error["expected"], "6%")
        self.assertEqual(aliquota_error["found"], "4%")

if __name__ == '__main__':
    unittest.main()
