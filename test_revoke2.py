import json
import os
import sys
from flask import Flask, request

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'functions')))

from admin import revokeEmployeeAccess
from firebase_functions import https_fn
from unittest.mock import Mock, patch

app = Flask(__name__)

def test():
    # TEST WITHOUT CONTENT TYPE
    with app.test_request_context(method='POST', headers={'Authorization': 'Bearer test_token'}, data=json.dumps({"uid": "test_uid"})):
        req = request

        with patch('admin.auth.verify_id_token') as mock_verify:
            mock_verify.return_value = {'uid': 'caller_uid', 'role': 'super_admin'}
            with patch('admin.firestore.client') as mock_client:
                mock_db = Mock()
                mock_client.return_value = mock_db

                mock_caller_doc = Mock()
                mock_caller_doc.exists = True
                mock_caller_doc.to_dict.return_value = {'role': 'super_admin', 'cartorio_id': None}

                mock_target_doc = Mock()
                mock_target_doc.exists = True
                mock_target_doc.to_dict.return_value = {'role': 'escrevente', 'cartorio_id': 'some_cartorio'}

                mock_db.collection.return_value.document.return_value.get.side_effect = [mock_caller_doc, mock_target_doc]

                with patch('admin.auth.update_user') as mock_update:
                    resp = revokeEmployeeAccess(req)
                    print("STATUS:", resp.status)
                    print("DATA:", resp.get_data(as_text=True))

test()
