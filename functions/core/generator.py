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
3. Do not invent, hallucinate, or assume any data not present in the raw JSON. Output ONLY the raw requested values for the schema, without inventing boilerplate context (like "portador do documento").
4. Strictly preserve the exact formatting (especially dates and identifiers) as they appear in the <VERIFIED_JSON_DATA> to ensure a 100% deterministic match during validation.
5. If a required field is missing from the verified data, output a standard placeholder (e.g., [DADO FALTANTE]).

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


def generate_roles_schema_for_template(required_tags: list) -> list:
    """
    Uses Gemini LLM to analyze the Jinja2 tags and deduce logical roles and mapping schema.
    Returns a list of roles, e.g., [{"role": "Outorgante", "expected_entity_type": "Person", "mapping": {"nome": "NOME_OUTORGANTE", "cpf": "CPF_OUTORGANTE"}}]
    """
    if not required_tags:
        return []

    try:
        project_id = os.environ.get("FIREBASE_PROJECT_ID", "cartorio-meneghel-ai")
        location = os.environ.get("VERTEX_AI_LOCATION", "us-central1")
        client = genai.Client(vertexai=True, project=project_id, location=location)

        from pydantic import BaseModel, Field
        from typing import Dict, List

        class RoleSchema(BaseModel):
            role: str = Field(description="The logical name of the role (e.g., 'Outorgante', 'Outorgado', 'Imóvel').")
            expected_entity_type: str = Field(description="The expected type of entity for this role (e.g., 'Person', 'Company', 'Property').")
            mapping: Dict[str, str] = Field(description="A dictionary mapping standard entity attributes (like 'nome', 'cpf', 'cnpj', 'endereco') to the exact required Jinja2 tag from the list.")

        class TemplateSchemaResponse(BaseModel):
            roles: List[RoleSchema]

        prompt = f"""
You are an expert system that analyzes Jinja2 template tags used in Brazilian legal documents (Cartório).
Your task is to group the provided list of individual tags into logical "Roles" (e.g., Outorgante, Procurador, Imóvel).

For each role, define an `expected_entity_type` (like 'Person', 'Company', 'Property') and provide a `mapping` that connects generic entity attributes (like 'nome', 'cpf', 'rg', 'nacionalidade', 'estado_civil', 'profissao', 'endereco') to the specific tags.

List of required tags:
{json.dumps(required_tags)}

Analyze the prefixes, suffixes, and patterns in the tags to deduce the roles. For example, if you see NOME_OUTORGANTE and CPF_OUTORGANTE, group them under an "Outorgante" role. Only map tags that logically belong to an entity role. Do not invent tags that are not in the provided list.
"""

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=TemplateSchemaResponse,
                temperature=0.0
            ),
        )

        parsed_response = json.loads(response.text)
        return parsed_response.get('roles', [])

    except Exception as e:
        logger.error(f"Error calling LLM to generate roles schema: {e}")
        return []

def suggest_field_text_llm(tag: str, context_data: dict) -> str:
    """
    Uses the LLM to auto-suggest a text snippet for a specific form field (tag),
    given the available contextual data.
    """
    try:
        project_id = os.environ.get("FIREBASE_PROJECT_ID", "cartorio-meneghel-ai")
        location = os.environ.get("VERTEX_AI_LOCATION", "us-central1")
        client = genai.Client(vertexai=True, project=project_id, location=location)

        prompt = f"""
You are an expert legal assistant for a Brazilian Cartório.
Your task is to provide an auto-suggestion for a specific text field in a legal document based on the available context.

Field Tag: {tag}

Context Data (JSON):
{json.dumps(context_data, ensure_ascii=False, indent=2)}

Please write a concise, formal, and grammatically correct text snippet suitable for insertion into a document draft.
Output ONLY the suggested text, nothing else. Do not include markdown blocks or introductory phrases.
"""
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        return response.text.strip()
    except Exception as e:
        logger.error(f"Error suggesting field text: {e}")
        raise e
