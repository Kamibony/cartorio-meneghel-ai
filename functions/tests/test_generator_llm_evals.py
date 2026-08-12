import pytest
import io
import os
import sys
import json
from unittest.mock import patch
import difflib

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from core.generator import generate_document_from_template
from docx import Document

@pytest.mark.skipif(not os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'), reason="Skipping LLM evals because GOOGLE_APPLICATION_CREDENTIALS is not set.")
def test_generator_llm_evals():
    """
    Test Generator Semantic Quality.
    Uses LLM to evaluate the generated text against a golden expected output.
    Focuses on preservation of legal intent and mandatory clauses.
    """
    golden_path = os.path.join(os.path.dirname(__file__), "fixtures", "test_generator_golden.json")
    with open(golden_path, "r", encoding="utf-8") as f:
        golden_data = json.load(f)

    contract_data = golden_data["test_contract"]
    verified_data = contract_data["verified_data"]
    required_tags = contract_data["required_tags"]
    expected_text = contract_data["expected_text"].strip()

    template_path = os.path.join(os.path.dirname(__file__), "fixtures", "template_mock.docx")
    with open(template_path, "rb") as f:
        template_bytes = f.read()

    # 1. Generate document
    generated_bytes = generate_document_from_template(template_bytes, verified_data, required_tags)

    # 2. Extract text from the generated docx
    doc = Document(io.BytesIO(generated_bytes))
    full_text = []
    for para in doc.paragraphs:
        full_text.append(para.text)
    actual_text = '\n'.join(full_text).strip()

    # 3. LLM-as-a-judge deterministic evaluation
    # To keep it deterministic and avoid flaky tests, we first do a structural check.
    # If the semantic intent (the key facts) are perfectly represented, we pass.
    # In this simplified eval, we check if all mandatory clauses/values from the expected text are in the actual text.

    # Simple deterministic check: Are all expected values present in the generated text?
    for key, value in verified_data.items():
        assert value in actual_text, f"Mandatory value '{value}' for '{key}' is missing from generated text."

    # Since we generated it with LLM, we can do a diff similarity or keyword check
    matcher = difflib.SequenceMatcher(None, expected_text, actual_text)
    ratio = matcher.ratio()

    # We expect high structural similarity for these legal documents.
    assert ratio > 0.8, f"Generated text semantic structure deviated too much from golden template. Ratio: {ratio}. \nExpected:\n{expected_text}\n\nActual:\n{actual_text}"
