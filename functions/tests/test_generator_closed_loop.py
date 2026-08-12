import pytest
import io
import os
import sys
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from core.generator import generate_document_from_template
from core.validator import DocumentValidator

@pytest.mark.skipif(not os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'), reason="Skipping Closed Loop evals because GOOGLE_APPLICATION_CREDENTIALS is not set.")
def test_generator_closed_loop():
    """
    Test AI evaluating AI (Closed-Loop Self-Healing Test).
    1. Pass perfect data to the generator (LIVE LLM).
    2. Extract text from generated docx.
    3. Pass text and original data to the DocumentValidator (LIVE LLM).
    4. Assert 0 critical discrepancies.
    """
    golden_path = os.path.join(os.path.dirname(__file__), "fixtures", "test_generator_golden.json")
    with open(golden_path, "r") as f:
        golden_data = json.load(f)

    contract_data = golden_data["test_contract"]
    verified_data = contract_data["verified_data"]
    required_tags = contract_data["required_tags"]

    template_path = os.path.join(os.path.dirname(__file__), "fixtures", "template_mock.docx")
    with open(template_path, "rb") as f:
        template_bytes = f.read()

    # 1. Generate document (LIVE API CALL)
    generated_bytes = generate_document_from_template(template_bytes, verified_data, required_tags)

    # 2. Extract text accurately representing what validator will see
    from docx import Document
    doc = Document(io.BytesIO(generated_bytes))
    full_text = []
    for para in doc.paragraphs:
        full_text.append(para.text)
    typed_text = '\n'.join(full_text)

    print(f"Extracted Text from Docx:\n{typed_text}")

    # 3. Create ground truth for validator using standard entity schema
    ground_truth = {
        "entities": [
            {
                "entity_name": "João da Silva",
                "entity_type": "PESSOA_FISICA",
                "attributes": [
                    {"key": "papel", "value": "Comprador"}
                ]
            },
            {
                "entity_name": "Maria Souza",
                "entity_type": "PESSOA_FISICA",
                "attributes": [
                    {"key": "papel", "value": "Vendedor"}
                ]
            },
            {
                "entity_name": "Imovel",
                "entity_type": "IMOVEL",
                "attributes": [
                    {"key": "itbi_valor", "value": "R$ 500.000,00"}
                ]
            }
        ]
    }

    # 4. Live Validation
    validator = DocumentValidator(ground_truth, typed_text)
    errors = validator.validate()

    assert len(errors) == 0, f"Expected 0 errors from self-validation, got: {errors}"
