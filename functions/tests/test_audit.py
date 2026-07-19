import unittest
from unittest.mock import patch, MagicMock
import json

# Adjust imports based on the functions directory structure
from flask import Flask
import core.audit as audit
from main import submit_audit_event

class TestAuditLogger(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app_context = self.app.app_context()
        self.app_context.push()

    def tearDown(self):
        self.app_context.pop()
    @patch('core.audit.firestore.client')
    def test_log_audit_event(self, mock_firestore_client):
        # Setup mock db and collection
        mock_db = MagicMock()
        mock_collection = MagicMock()
        mock_db.collection.return_value = mock_collection
        mock_firestore_client.return_value = mock_db

        # Instantiate logger with mocked firestore
        logger = audit.AuditLogger()

        event_data = {
            "document_type": "CNH",
            "ai_detected": {"name": "JOAO SILVA"},
            "user_corrected": {"name": "JOÃO SILVA"}
        }

        # Test logging
        logger.log_audit_event(event_data)

        # Check that db collection was called
        # We need to wait a small bit or mock threading because it's async
        pass

    @patch('core.audit.AuditLogger.log_audit_event')
    def test_submit_audit_event_success(self, mock_log):
        with self.app.test_request_context(
                method="POST",
                json={
                    "document_type": "CNH",
                    "ai_detected": {"cpf": "123"},
                    "user_corrected": {"cpf": "123"}
                }
        ) as req_context:
            response = submit_audit_event(req_context.request)

            # Assertions
            self.assertEqual(response.status_code, 200)
            self.assertIn("Audit event submitted", response.response[0].decode('utf-8'))
            mock_log.assert_called_once()

    def test_submit_audit_event_missing_fields(self):
        with self.app.test_request_context(
                method="POST",
                json={
                    "document_type": "CNH"
                    # Missing ai_detected and user_corrected
                }
        ) as req_context:
            response = submit_audit_event(req_context.request)

            self.assertEqual(response.status_code, 400)
            self.assertIn("Missing required fields", response.response[0].decode('utf-8'))

    def test_submit_audit_event_wrong_method(self):
        with self.app.test_request_context(method="GET") as req_context:
            response = submit_audit_event(req_context.request)

            self.assertEqual(response.status_code, 405)
            self.assertIn("Only POST requests are accepted", response.response[0].decode('utf-8'))

if __name__ == '__main__':
    unittest.main()
