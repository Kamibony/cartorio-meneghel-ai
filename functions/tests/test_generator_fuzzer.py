import pytest
import io
from docx import Document
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from core.generator import generate_document_from_template

def test_generator_fuzzer_missing_fields(monkeypatch):
    """
    Test that the generator handles missing grammar payload gracefully and substitutes [DADO FALTANTE] or similar.
    We mock the LLM to raise an exception or return partial data to simulate a bad payload.
    """
    import google.genai as genai

    class MockModelResponse:
        @property
        def text(self):
            return '{"nome_comprador": "Sr. Fuzz"}' # missing nome_vendedor

    class MockModels:
        def generate_content(self, **kwargs):
            return MockModelResponse()

    class MockClient:
        def __init__(self, **kwargs):
            self.models = MockModels()

    monkeypatch.setattr(genai, "Client", MockClient)
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test")
    monkeypatch.setenv("VERTEX_AI_LOCATION", "test")

    template_path = os.path.join(os.path.dirname(__file__), "fixtures", "template_mock.docx")
    with open(template_path, "rb") as f:
        template_bytes = f.read()

    verified_data = {
        "valor_imovel": "R$ 1,00" # Literal tag
    }
    required_tags = ["nome_comprador", "valor_imovel", "nome_vendedor"]

    # When missing from both verified_data and the LLM response, it should not crash.
    # docxtpl will just leave the tag blank or we handle it.
    generated_bytes = generate_document_from_template(template_bytes, verified_data, required_tags)

    import zipfile
    zf = zipfile.ZipFile(io.BytesIO(generated_bytes))
    xml_content = zf.read("word/document.xml").decode("utf-8")

    assert "Sr. Fuzz" in xml_content
    assert "R$ 1,00" in xml_content
    # nome_vendedor is missing from payload, should be left blank or handled gracefully

def test_generator_fuzzer_malformed_llm_json(monkeypatch):
    """
    Test that the generator raises a ValueError if the LLM returns completely invalid JSON.
    """
    import google.genai as genai

    class MockModelResponse:
        @property
        def text(self):
            return 'NOT JSON'

    class MockModels:
        def generate_content(self, **kwargs):
            return MockModelResponse()

    class MockClient:
        def __init__(self, **kwargs):
            self.models = MockModels()

    monkeypatch.setattr(genai, "Client", MockClient)
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test")
    monkeypatch.setenv("VERTEX_AI_LOCATION", "test")

    template_path = os.path.join(os.path.dirname(__file__), "fixtures", "template_mock.docx")
    with open(template_path, "rb") as f:
        template_bytes = f.read()

    verified_data = {}
    required_tags = ["nome_comprador"]

    with pytest.raises(ValueError, match="Failed to generate document payload from LLM"):
        generate_document_from_template(template_bytes, verified_data, required_tags)

def test_generator_fuzzer_negative_financial(monkeypatch):
     """
     Test literal tag bypass (financial values shouldn't be altered by LLM)
     """
     import google.genai as genai

     class MockModels:
         def generate_content(self, **kwargs):
             assert False, "LLM should not be called if there are only literal tags"

     class MockClient:
         def __init__(self, **kwargs):
             self.models = MockModels()

     monkeypatch.setattr(genai, "Client", MockClient)

     template_path = os.path.join(os.path.dirname(__file__), "fixtures", "template_mock.docx")
     with open(template_path, "rb") as f:
         template_bytes = f.read()

     verified_data = {
         "valor_imovel": "R$ -500.000,00"
     }
     required_tags = ["valor_imovel"]

     generated_bytes = generate_document_from_template(template_bytes, verified_data, required_tags)

     import zipfile
     zf = zipfile.ZipFile(io.BytesIO(generated_bytes))
     xml_content = zf.read("word/document.xml").decode("utf-8")

     assert "R$ -500.000,00" in xml_content
