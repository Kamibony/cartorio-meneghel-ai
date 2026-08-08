import pytest
from core.generator import extract_tags_from_template

def test_extract_tags():
    from docx import Document
    import io

    d = Document()
    d.add_paragraph("Hello {{ name }}, you are {{ age }} years old.")
    f = io.BytesIO()
    d.save(f)

    tags = extract_tags_from_template(f.getvalue())
    assert set(tags) == {"name", "age"}
