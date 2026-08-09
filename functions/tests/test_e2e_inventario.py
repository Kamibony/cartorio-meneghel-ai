import unittest
from unittest.mock import MagicMock, patch
import json

from core.extractor import DocumentExtractor, get_entity_attr
from core.consolidator import MasterProfileConsolidator
deduplicate_entities = MasterProfileConsolidator.deduplicate_entities
from core.validator import DocumentValidator

class TestE2EInventario(unittest.TestCase):
    @patch('google.genai.Client')
    def test_inventario_pipeline(self, mock_client_class):
        sot_entities = [
            {
                "entity_name": "JOSÉ PEREIRA",
                "entity_type": "PESSOA_FISICA",
                "_source_document_type": "Certidão de Óbito",
                "sources": ["Certidão de Óbito"],
                "attributes": [
                    {"key": "nome", "value": "JOSÉ PEREIRA", "data_type": "STRING"},
                    {"key": "data_obito", "value": "10/05/2026", "data_type": "DATE"},
                    {"key": "estado_civil", "value": "Casado", "data_type": "STRING"}
                ]
            },
            {
                "entity_name": "JOSÉ PEREIRA",
                "entity_type": "PESSOA_FISICA",
                "has_marriage_certificate": True,
                "_source_document_type": "Certidão de Casamento",
                "sources": ["Certidão de Casamento"],
                "attributes": [
                    {"key": "nome", "value": "JOSÉ PEREIRA", "data_type": "STRING"},
                    {"key": "estado_civil", "value": "Casado", "data_type": "STRING"},
                    {"key": "regime_bens", "value": "Comunhão Universal", "data_type": "STRING"}
                ]
            },
            {
                "entity_name": "MARIA SILVA PEREIRA",
                "entity_type": "PESSOA_FISICA",
                "has_marriage_certificate": True,
                "_source_document_type": "Certidão de Casamento",
                "sources": ["Certidão de Casamento"],
                "attributes": [
                    {"key": "nome", "value": "MARIA SILVA PEREIRA", "data_type": "STRING"},
                    {"key": "estado_civil", "value": "Casado", "data_type": "STRING"},
                    {"key": "regime_bens", "value": "Comunhão Universal", "data_type": "STRING"}
                ]
            },
            {
                "entity_name": "LUCAS SILVA PEREIRA",
                "entity_type": "PESSOA_FISICA",
                "_source_document_type": "RG",
                "sources": ["RG"],
                "attributes": [
                    {"key": "nome", "value": "LUCAS SILVA PEREIRA", "data_type": "STRING"},
                    {"key": "filiacao_pai", "value": "José", "data_type": "STRING"},
                    {"key": "filiacao_mae", "value": "Maria", "data_type": "STRING"},
                    {"key": "cpf", "value": "222.333.444-55", "data_type": "IDENTIFIER"}
                ]
            },
            {
                "entity_name": "Imóvel Y",
                "entity_type": "IMOVEL",
                "_source_document_type": "Matrícula",
                "sources": ["Matrícula"],
                "attributes": [
                    {"key": "matricula", "value": "10.555", "data_type": "IDENTIFIER"}
                ]
            }
        ]

        master_entities = deduplicate_entities(sot_entities)
        ground_truth = {"entities": master_entities}

        minuta_text = "Falecimento de JOSÉ PEREIRA, no dia 15/05/2026. Herdeiro: LUCAS SILVA PEREIRA, CPF 222.333.444-50. Imóvel da Matrícula nº 10.550."

        validator = DocumentValidator(ground_truth, minuta_text)
        real_extractor = DocumentExtractor()
        draft_data = {
            "entities": [
                {
                    "entity_name": "JOSÉ PEREIRA",
                    "entity_type": "PESSOA_FISICA",
                    "attributes": [
                        {"key": "nome", "value": "JOSÉ PEREIRA", "data_type": "STRING"},
                        {"key": "data_obito", "value": "15/05/2026", "data_type": "DATE"},
                        {"key": "role", "value": "FALECIDO", "data_type": "STRING"}
                    ]
                },
                {
                    "entity_name": "LUCAS SILVA PEREIRA",
                    "entity_type": "PESSOA_FISICA",
                    "attributes": [
                        {"key": "nome", "value": "LUCAS SILVA PEREIRA", "data_type": "STRING"},
                        {"key": "cpf", "value": "222.333.444-50", "data_type": "IDENTIFIER"},
                        {"key": "role", "value": "HERDEIRO", "data_type": "STRING"}
                    ]
                },
                {
                    "entity_name": "Imóvel Y",
                    "entity_type": "IMOVEL",
                    "attributes": [
                        {"key": "matricula", "value": "10.550", "data_type": "IDENTIFIER"}
                    ]
                }
            ]
        }

        # Ensure that JSON serialization strictly uses allow_nan=False when serializing draft data
        draft_data_json = json.dumps(draft_data, ensure_ascii=False, allow_nan=False)
        self.assertIsInstance(draft_data_json, str)

        real_extractor.extract_from_text = MagicMock(return_value=draft_data)
        validator._extractor_instance = real_extractor
        errors = validator.validate()

        data_obito_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "data_obito" in e["field"]), None)
        cpf_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "cpf" in e["field"] and e["expected"] == "222.333.444-55"), None)
        matricula_error = next((e for e in errors if e["category"] == "VALUE_MISMATCH" and "matricula" in e["field"]), None)

        self.assertIsNotNone(data_obito_error)
        self.assertEqual(data_obito_error["expected"], "10/05/2026")
        self.assertEqual(data_obito_error["found"], "15/05/2026")

        self.assertIsNotNone(cpf_error)
        self.assertEqual(cpf_error["found"], "222.333.444-50")

        self.assertIsNotNone(matricula_error)
        self.assertEqual(matricula_error["expected"], "10.555")
        self.assertEqual(matricula_error["found"], "10.550")

    @patch('main.firestore', create=True)
    @patch('main.auth', create=True)
    @patch('main._init_firebase', create=True)
    def test_finalize_validation_endpoint_super_admin(self, mock_init_firebase, mock_auth, mock_firestore):
        from flask import Flask, request
        app = Flask(__name__)
        from main import finalize_validation

        req = MagicMock()
        req.method = "POST"
        req.get_json.return_value = {"document_id": "test_doc", "final_text": "text"}
        req.headers = {
            "Authorization": "Bearer fake_token",
            "X-Cartorio-ID": "test_cartorio"
        }

        mock_auth.verify_id_token.return_value = {
            "uid": "test_uid",
            "role": "super_admin",
            "cartorio_id": "test_cartorio"
        }

        db_mock = MagicMock()
        mock_firestore.client.return_value = db_mock
        minuta_doc_mock = MagicMock()
        minuta_doc_mock.exists = True
        minuta_doc_mock.to_dict.return_value = {"cartorio_id": "test_cartorio"}
        db_mock.collection.return_value.document.return_value.get.return_value = minuta_doc_mock

        with app.test_request_context():
            res = finalize_validation(req)

        self.assertEqual(res.status_code, 200)

if __name__ == '__main__':
    unittest.main()
