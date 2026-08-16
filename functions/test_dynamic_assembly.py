import json
import io
import sys
from unittest.mock import MagicMock, patch

def test_assemble_dynamic_document():
    # Create mock DB
    mock_db = MagicMock()

    def create_mock_clause(title, text, required_variables=None):
        if required_variables is None:
            required_variables = []
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"title": title, "text": text, "required_variables": required_variables}
        return mock_doc

    mock_clause_1 = create_mock_clause("Clause 1", "This is clause 1 with {{COMPRADOR_NOME}}.", [{"name": "COMPRADOR_NOME", "description": "Nome do comprador"}])
    mock_clause_2 = create_mock_clause("Clause 2", "Details: {{DETAILS}}.", [{"name": "DETAILS", "description": "Nome da entidade bancária"}])

    def get_clause(cid):
        if cid == "c1": return mock_clause_1
        if cid == "c2": return mock_clause_2
        mock_doc = MagicMock()
        mock_doc.exists = False
        return mock_doc

    def mock_document(cid):
        mock_doc_ref = MagicMock()
        mock_doc_ref.get.side_effect = lambda: get_clause(cid)
        return mock_doc_ref

    mock_db.collection.return_value.document.side_effect = mock_document

    verified_data = {
        "COMPRADOR_NOME": "João Silva",
            "DETAILS": "Banco do Brasil"
    }

    sys.path.append('.')
    import core.generator

    # Mock Gemini client
    with patch('core.generator.genai.Client') as mock_client:
        mock_instance = MagicMock()
        mock_client.return_value = mock_instance

        mock_response = MagicMock()
        mock_response.text = '{"COMPRADOR_NOME": "João Silva", "DETAILS": "Banco do Brasil"}'
        mock_instance.models.generate_content.return_value = mock_response

        try:
            result_bytes = core.generator.assemble_dynamic_document(["c1", "c2"], {}, {}, verified_data, mock_db)

            from docx import Document
            doc = Document(io.BytesIO(result_bytes))
            full_text = '\n'.join([p.text for p in doc.paragraphs])

            print("Generated Text:")
            print(full_text)

            assert "Banco do Brasil" in full_text
            assert "{" not in full_text, "Raw JSON braces found in generated document!"
            print("Test Passed: No raw JSON detected.")
        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)

if __name__ == "__main__":
    test_assemble_dynamic_document()
