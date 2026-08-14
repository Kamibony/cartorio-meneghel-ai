import json
import logging
import io
import os
from docxtpl import DocxTemplate
from google import genai
from google.genai import types

from core.config import GEMINI_MODEL

logger = logging.getLogger(__name__)

def is_literal_tag(tag: str) -> bool:
    """Determines if a tag should be processed literally, bypassing the LLM."""
    tag_lower = tag.lower()
    return tag_lower.startswith('valor_') or 'emolumentos' in tag_lower

def generate_document_from_template(template_bytes: bytes, verified_data: dict, required_tags: list) -> bytes:
    """
    Generates a document from a .docx template.
    1. Sends the verified data and required tags to the LLM to generate the "Smart Payload".
    2. Uses docxtpl to inject the LLM-generated payload into the template.
    """
    grammar_tags = [tag for tag in required_tags if not is_literal_tag(tag)]
    literal_tags = [tag for tag in required_tags if is_literal_tag(tag)]

    payload = {}

    # Populate literal tags directly from verified_data (or fallback)
    for tag in literal_tags:
        payload[tag] = verified_data.get(tag, "[DADO FALTANTE]")

    # 1. Ask LLM to generate the Smart Payload for Grammar Tags
    if grammar_tags:
        try:
            project_id = os.environ.get("FIREBASE_PROJECT_ID", "cartorio-meneghel-ai")
            location = os.environ.get("VERTEX_AI_LOCATION", "us-central1")
            client = genai.Client(vertexai=True, project=project_id, location=location)

            from pydantic import create_model, Field

            # Dynamically create Pydantic model for schema
            fields = {
                tag: (str, Field(description=f"Text to inject into the {tag} placeholder."))
                for tag in grammar_tags
            }
            DynamicSchema = create_model('DynamicSchema', **fields)

            prompt = f"""
You are a strict legal grammar engine for a Brazilian Cartório.
Your task is to take raw, verified JSON data representing entities (Buyers, Sellers, Properties) and transform them into grammatically correct Portuguese text blocks to be injected into a legal contract.

Rules:
1. Ensure perfect gender agreement (e.g., "portador" vs "portadora", "brasileiro" vs "brasileira").
2. Ensure perfect pluralization based on the number of entities (e.g., "vendedores" if > 1 seller).
3. Do not invent, hallucinate, or assume any data not present in the raw JSON.
4. Format dates strictly in the DD/MM/YYYY format (e.g., "21/06/2000") to match the extracted ground truth exactly. Do not use extensive formatting like "21 de junho".
5. Do NOT prepend introductory phrases like "portador do documento", "inscrito no CPF", or "residente em" when filling raw values, as the docx template often already contains these introductory words.
6. Explicitly ensure that critical fields such as "estado_civil" and "regime_bens" are included in the generated text if they are present in the JSON data.
7. If a required field is missing from the verified data, output a standard placeholder (e.g., [DADO FALTANTE]).

You must return a JSON object exactly matching the requested schema.

<VERIFIED_JSON_DATA>
{json.dumps(verified_data, ensure_ascii=False, indent=2)}
</VERIFIED_JSON_DATA>
"""
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.0,
                    response_mime_type="application/json",
                    response_schema=DynamicSchema,
                )
            )

            payload_text = response.text.strip()
            grammar_payload = json.loads(payload_text)

            # Merge grammar payload with literal payload
            payload.update(grammar_payload)

        except Exception as e:
            logger.error(f"Error generating LLM payload: {e}")
            raise ValueError(f"Failed to generate document payload from LLM: {str(e)}")

    # 2. Inject payload into .docx template
    try:
        f = io.BytesIO(template_bytes)
        doc = DocxTemplate(f)
        doc.render(payload)

        out_f = io.BytesIO()
        doc.save(out_f)
        return out_f.getvalue()
    except Exception as e:
        logger.error(f"Error rendering docx: {e}")
        raise ValueError(f"Failed to render docx template: {str(e)}")

def extract_tags_from_template(template_bytes: bytes) -> list:
    """
    Extracts Jinja2 tags from a .docx template.
    """
    try:
        f = io.BytesIO(template_bytes)
        doc = DocxTemplate(f)
        tags = doc.get_undeclared_template_variables()
        return list(tags)
    except Exception as e:
        logger.error(f"Error extracting tags from template: {e}")
        raise ValueError(f"Invalid docx template or malformed tags: {str(e)}")
