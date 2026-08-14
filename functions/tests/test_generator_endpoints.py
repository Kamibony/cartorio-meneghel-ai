import pytest
import json
from unittest.mock import patch, MagicMock
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

@pytest.fixture
def mock_req():
    req = MagicMock()
    req.auth = MagicMock()
    req.auth.uid = "testuid"
    req.data = {}
    return req

def test_endpoints_import():
    from main import register_template, generate_document_api
    assert register_template is not None
    assert generate_document_api is not None
