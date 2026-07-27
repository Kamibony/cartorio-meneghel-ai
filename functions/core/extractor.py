import copy
import os
import json
import logging
import traceback
import threading
from typing import Dict, Any
from tenacity import retry, wait_random_exponential, stop_after_attempt, retry_if_exception_type

logger = logging.getLogger(__name__)

_semaphore = threading.Semaphore(3)

def normalize_attribute_key(key: str) -> str:
    if not key:
        return ""
    key = key.lower().strip()
    aliases = {
        "nome_mae": "filiacao_mae",
        "nome_pai": "filiacao_pai",
        "data_nasc": "data_nascimento",
        "nascimento": "data_nascimento",
        "dt_nascimento": "data_nascimento",
        "dt_nasc": "data_nascimento",
        "doc_identidade": "rg",
        "identidade": "rg",
        "registro_geral": "rg",
        "cadastro_pessoa_fisica": "cpf"
    }
    return aliases.get(key, key)

def get_entity_attr(entity: dict, key: str) -> str:
    for attr in entity.get("attributes", []):
        if attr.get("key") == key:
            return attr.get("value")
    return None

def merge_into_master_profile(existing_entity: dict, incoming_entity: dict) -> dict:
    from core.validator import DataNormalizer

    hierarchy = {
        "Certidão de Casamento": 100,
        "Certidão de Nascimento": 90,
        "CIN": 60,
        "Carteira de Identidade Nacional": 60,
        "CNH": 50,
        "RG": 40,
        "Desconhecido": 0
    }

    incoming_type = incoming_entity.get("_source_document_type", "Desconhecido")
    base_incoming_type = "Desconhecido"
    for h_key in hierarchy:
        if h_key.lower() in incoming_type.lower():
            base_incoming_type = h_key
            break

    incoming_weight = hierarchy.get(base_incoming_type, 0)

    existing_sources = existing_entity.get("sources", [])
    max_existing_weight = 0
    primary_existing_source = "Desconhecido"

    for src in existing_sources:
        for h_key in hierarchy:
            if h_key.lower() in src.lower():
                weight = hierarchy.get(h_key, 0)
                if weight > max_existing_weight:
                    max_existing_weight = weight
                    primary_existing_source = src

    existing_attrs = {attr["key"]: attr for attr in existing_entity.get("attributes", [])}

    for incoming_attr in incoming_entity.get("attributes", []):
        key = incoming_attr.get("key", "")
        if not key:
            continue

        key = normalize_attribute_key(key)
        incoming_attr["key"] = key

        incoming_val = incoming_attr.get("value")
        data_type = incoming_attr.get("data_type", "STRING")

        if incoming_val in (None, ""):
            continue

        if key not in existing_attrs:
            existing_attrs[key] = incoming_attr
            continue

        existing_attr = existing_attrs[key]
        existing_val = existing_attr.get("value")

        if existing_val in (None, ""):
            existing_attrs[key] = incoming_attr
            continue

        if data_type == "IDENTIFIER" or key in ["cpf", "cnpj", "rg", "cep", "matricula"]:
            norm_incoming = DataNormalizer.normalize_digits(incoming_val)
            norm_existing = DataNormalizer.normalize_digits(existing_val)
        elif data_type == "DATE" or "data" in key:
            norm_incoming = DataNormalizer.normalize_date(incoming_val)
            norm_existing = DataNormalizer.normalize_date(existing_val)
        elif data_type == "ALPHANUMERIC":
            norm_incoming = DataNormalizer.normalize_string(incoming_val)
            norm_existing = DataNormalizer.normalize_string(existing_val)
        else:
            norm_incoming = DataNormalizer.normalize_string(incoming_val)
            norm_existing = DataNormalizer.normalize_string(existing_val)

        if norm_incoming != norm_existing:
            if key == "nome" and (norm_incoming in norm_existing or norm_existing in norm_incoming):
                if len(str(incoming_val)) > len(str(existing_val)):
                    existing_attrs[key] = incoming_attr
                continue

            immutable_fields = {"cpf", "cnpj", "data_nascimento", "filiacao_mae", "filiacao_pai"}

            if key not in immutable_fields:
                if incoming_weight > max_existing_weight:
                    existing_attrs[key] = incoming_attr
                    if "_resolved_conflicts" not in existing_entity:
                        existing_entity["_resolved_conflicts"] = []
                    if key not in existing_entity["_resolved_conflicts"]:
                        existing_entity["_resolved_conflicts"].append(key)
                    continue

                elif max_existing_weight > incoming_weight:
                    if "_resolved_conflicts" not in existing_entity:
                        existing_entity["_resolved_conflicts"] = []
                    if key not in existing_entity["_resolved_conflicts"]:
                        existing_entity["_resolved_conflicts"].append(key)
                    continue

            if "_conflicts" not in existing_entity:
                existing_entity["_conflicts"] = {}

            if key not in existing_entity["_conflicts"]:
                existing_entity["_conflicts"][key] = {
                    "options": [
                        {"value": existing_val, "source": primary_existing_source},
                        {"value": incoming_val, "source": incoming_type}
                    ]
                }
            else:
                options = existing_entity["_conflicts"][key]["options"]
                if not any(opt.get("value") == incoming_val for opt in options):
                    options.append({"value": incoming_val, "source": incoming_type})

    existing_entity["attributes"] = list(existing_attrs.values())

    if incoming_entity.get("entity_name") and existing_entity.get("entity_name"):
        norm_inc_name = DataNormalizer.normalize_string(incoming_entity["entity_name"])
        norm_ex_name = DataNormalizer.normalize_string(existing_entity["entity_name"])
        if (norm_inc_name in norm_ex_name or norm_ex_name in norm_inc_name):
             if len(str(incoming_entity["entity_name"])) > len(str(existing_entity["entity_name"])):
                 existing_entity["entity_name"] = incoming_entity["entity_name"]

    if incoming_type and incoming_type not in existing_sources:
        existing_sources.append(incoming_type)
        existing_entity["sources"] = existing_sources

    return existing_entity

def deduplicate_entities(entities: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    """
    Deterministically deduplicates and merges entities across documents to build a Master Truth Profile.
    Uses O(N^2) pairwise comparison to allow matching when CPFs are missing (e.g. Certidoes vs RG).
    """
    from core.validator import DataNormalizer

    def is_name_compatible(n1, n2):
        if not n1 or not n2:
            return False
        if n1 in n2 or n2 in n1:
            return True
        stopwords = {"DE", "DA", "DO", "DAS", "DOS", "E"}
        t1 = {w for w in n1.split() if w not in stopwords}
        t2 = {w for w in n2.split() if w not in stopwords}
        if t1 and t2 and (t1.issubset(t2) or t2.issubset(t1)):
            return True
        return False

    def do_entities_match(ent1, ent2):
        if ent1.get("entity_type") != ent2.get("entity_type"):
            return False

        entity_type = ent1.get("entity_type")

        if entity_type == "PESSOA_FISICA":
            cpf1 = DataNormalizer.normalize_digits(get_entity_attr(ent1, "cpf") or "")
            cpf2 = DataNormalizer.normalize_digits(get_entity_attr(ent2, "cpf") or "")

            if cpf1 and cpf2 and cpf1 == cpf2:
                return True

            nome1 = DataNormalizer.normalize_string(ent1.get("entity_name") or get_entity_attr(ent1, "nome") or "")
            nome2 = DataNormalizer.normalize_string(ent2.get("entity_name") or get_entity_attr(ent2, "nome") or "")

            if (not cpf1 or not cpf2) and nome1 and nome2:
                if is_name_compatible(nome1, nome2):
                    mae1 = DataNormalizer.normalize_string(get_entity_attr(ent1, "filiacao_mae") or "")
                    mae2 = DataNormalizer.normalize_string(get_entity_attr(ent2, "filiacao_mae") or "")

                    if mae1 and mae2:
                        if is_name_compatible(mae1, mae2):
                            return True
                        else:
                            return False

                    return True
            return False

        elif entity_type == "PESSOA_JURIDICA":
            cnpj1 = DataNormalizer.normalize_digits(get_entity_attr(ent1, "cnpj") or "")
            cnpj2 = DataNormalizer.normalize_digits(get_entity_attr(ent2, "cnpj") or "")
            if cnpj1 and cnpj2 and cnpj1 == cnpj2:
                return True
            nome1 = DataNormalizer.normalize_string(ent1.get("entity_name") or get_entity_attr(ent1, "razao_social") or "")
            nome2 = DataNormalizer.normalize_string(ent2.get("entity_name") or get_entity_attr(ent2, "razao_social") or "")
            if (not cnpj1 or not cnpj2) and nome1 and nome2:
                if is_name_compatible(nome1, nome2):
                    return True
            return False

        elif entity_type == "IMOVEL":
            mat1 = DataNormalizer.normalize_digits(get_entity_attr(ent1, "matricula") or "")
            mat2 = DataNormalizer.normalize_digits(get_entity_attr(ent2, "matricula") or "")
            if mat1 and mat2 and mat1 == mat2:
                return True
            return False

        elif entity_type == "VEICULO":
            chassi1 = DataNormalizer.normalize_string(get_entity_attr(ent1, "chassi") or "")
            chassi2 = DataNormalizer.normalize_string(get_entity_attr(ent2, "chassi") or "")
            placa1 = DataNormalizer.normalize_string(get_entity_attr(ent1, "placa") or "")
            placa2 = DataNormalizer.normalize_string(get_entity_attr(ent2, "placa") or "")
            if chassi1 and chassi2 and chassi1 == chassi2:
                return True
            if placa1 and placa2 and placa1 == placa2:
                return True
            return False

        else:
            nome1 = DataNormalizer.normalize_string(ent1.get("entity_name") or "")
            nome2 = DataNormalizer.normalize_string(ent2.get("entity_name") or "")
            if nome1 and nome2 and nome1 == nome2:
                return True
            return False

    merged_entities = []

    for entity in entities:
        if "attributes" in entity:
            for attr in entity["attributes"]:
                if "key" in attr:
                    attr["key"] = normalize_attribute_key(attr["key"])

        matched_idx = -1
        for i, merged_ent in enumerate(merged_entities):
            if do_entities_match(entity, merged_ent):
                matched_idx = i
                break

        if matched_idx == -1:
            new_ent = copy.deepcopy(entity)
            doc_type = new_ent.pop("_source_document_type", "")

            current_sources = new_ent.get("sources", [])
            if not isinstance(current_sources, list):
                current_sources = []

            if doc_type and doc_type not in current_sources:
                current_sources.append(doc_type)

            new_ent["sources"] = current_sources
            merged_entities.append(new_ent)
        else:
            existing = merged_entities[matched_idx]
            incoming_type = entity.get("_source_document_type", "")
            if incoming_type:
                entity["_source_document_type"] = incoming_type

            merged_entities[matched_idx] = merge_into_master_profile(existing, entity)

    for existing in merged_entities:
        has_marriage_cert = any("casamento" in src.lower() for src in existing.get("sources", []))
        if existing.get("has_marriage_certificate") or has_marriage_cert:
            resolved_conflicts = existing.get("_resolved_conflicts", [])
            if "estado_civil" not in resolved_conflicts:
                existing_civil = get_entity_attr(existing, "estado_civil")
                if DataNormalizer.normalize_string(str(existing_civil)) != DataNormalizer.normalize_string("Casado(a)"):
                    attrs = existing.get("attributes", [])
                    found = False
                    for attr in attrs:
                        if attr.get("key") == "estado_civil":
                            attr["value"] = "Casado(a)"
                            found = True
                            break
                    if not found:
                        attrs.append({"key": "estado_civil", "value": "Casado(a)", "data_type": "STRING"})
                        existing["attributes"] = attrs

                    if "_resolved_conflicts" not in existing:
                        existing["_resolved_conflicts"] = []
                    existing["_resolved_conflicts"].append("estado_civil")

                    if "_conflicts" in existing and "estado_civil" in existing["_conflicts"]:
                        del existing["_conflicts"]["estado_civil"]
                        if not existing["_conflicts"]:
                            del existing["_conflicts"]

    return merged_entities


class DocumentExtractor:
    """
    Unified extractor for all document types using Vertex AI with Gemini 2.5 Flash.
    Autonomous processing without hardcoded routing maps.
    """

    def __init__(self) -> None:
        """Initializes the DocumentExtractor."""
        self.project_id = os.environ.get("FIREBASE_PROJECT_ID", "cartorio-meneghel-ai")
        self.location = os.environ.get("VERTEX_AI_LOCATION", "us-central1")

        if not self.project_id:
            raise ValueError("FIREBASE_PROJECT_ID environment variable must be set.")

    def extract(self, gcs_uri: str, document_type: str = None) -> Dict[str, Any]:
        """
        Extracts data autonomously using Vertex AI Gemini model.

        Args:
            gcs_uri (str): The GCS URI of the document.
            document_type (str, optional): The type of the document (e.g., "DRAFT").

        Returns:
            Dict[str, Any]: The extracted structured data.
        """
        from google import genai
        from google.genai import types

        client = genai.Client(vertexai=True, project=self.project_id, location=self.location)

        mime_type = "application/pdf"
        if gcs_uri.lower().endswith(".jpg") or gcs_uri.lower().endswith(".jpeg"):
            mime_type = "image/jpeg"
        elif gcs_uri.lower().endswith(".png"):
            mime_type = "image/png"
        elif gcs_uri.lower().endswith(".doc") or gcs_uri.lower().endswith(".docx"):
            mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" if gcs_uri.lower().endswith(".docx") else "application/msword"

        file_part = types.Part.from_uri(file_uri=gcs_uri, mime_type=mime_type)

        sys_instruct = (
            "You are a legal document extractor. "
            "You must STRICTLY adhere to the requested JSON schema. "
            "Do not hallucinate or invent data. If a field is not in the text, omit it or return null. "
            "Do not include markdown blocks or any other text outside the JSON."
        )

        if document_type == 'DRAFT':
            prompt = (
                "<TASK>\nExtract the entire text verbatim from this document.\n</TASK>\n"
                "<OUTPUT_SCHEMA>\nReturn the data strictly as a valid JSON object with a single key 'text' containing the extracted text.\n</OUTPUT_SCHEMA>"
            )
        else:
            # Profile A: Source Identities (Ground Truth)
            prompt = (
                "<TASK>\n"
                "Analyze this identity document (e.g., CNH, RG, Certidão, Imóvel). Extract a pure 'Identity Profile' identifying entities and their core attributes.\n"
                "</TASK>\n"
                "<BUSINESS_RULES>\n"
                "1. Extract the primary subjects (People, Companies, Properties, Vehicles) as top-level objects.\n"
                "2. AGGRESSIVELY extract Property Data (e.g., Matrículas), Critical Dates (e.g., data_obito), and Financial/Tax Data (e.g., aliquota_itcd, valores) as standalone attributes.\n"
                "3. Secondary individuals (e.g., parents) MUST be strictly nested as 'filiacao_mae' and 'filiacao_pai' string attributes within the primary subject's object. NEVER create standalone entities for parents.\n"
                "4. All extracted attribute values MUST be flat strings.\n"
                "5. Translate all keys and values into Brazilian Portuguese (pt-BR).\n"
                "6. Identify the document type and set it at the top-level 'document_type' field (e.g., 'Certidão de Casamento', 'RG', 'CNH', 'Matrícula').\n"
                "</BUSINESS_RULES>\n"
                "<OUTPUT_SCHEMA>\n"
                "Return a JSON object with two top-level keys:\n"
                "- 'document_type': string\n"
                "- 'entities': array of objects, where each object has:\n"
                "  - 'entity_name': string (the primary name/title)\n"
                "  - 'entity_type': string (strictly one of: PESSOA_FISICA, PESSOA_JURIDICA, IMOVEL, VEICULO)\n"
                "  - 'attributes': array of objects, each containing:\n"
                "      - 'key': string (e.g., 'cpf', 'nome', 'matricula', 'data_obito', 'aliquota_itcd')\n"
                "      - 'value': string (the extracted value)\n"
                "      - 'data_type': string (strictly one of: STRING, DATE, IDENTIFIER, ALPHANUMERIC)\n"
                "</OUTPUT_SCHEMA>"
            )

        @retry(wait=wait_random_exponential(min=2, max=15), stop=stop_after_attempt(5), retry=retry_if_exception_type(Exception))
        def _generate():
            with _semaphore:
                return client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[file_part, prompt],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.0,
                        system_instruction=sys_instruct
                    )
                )

        try:
            response = _generate()

            if not response.text:
                raise ValueError("Empty response received from Vertex AI.")

            raw_text = response.text.strip()

            try:
                data = json.loads(raw_text)
                doc_type = data.get("document_type", "Desconhecido")
                is_casamento = "casamento" in str(doc_type).lower()
                if "entities" in data and isinstance(data["entities"], list):
                    for ent in data["entities"]:
                        ent["_source_document_type"] = doc_type
                        if is_casamento:
                            ent["has_marriage_certificate"] = True
                return data
            except json.JSONDecodeError as je:
                raise ValueError(f"Failed to parse JSON response from AI model. Raw text: {raw_text[:200]}...") from je
        except Exception as e:
            logger.error(f"Error extracting document data: {e}", exc_info=True)
            tb_str = traceback.format_exc()
            raise Exception(f"Extraction failed: {str(e)}\nTraceback: {tb_str}") from e

    def extract_batch(self, gcs_uris: list[str]) -> Dict[str, Any]:
        """
        Extracts data from a batch of documents by iterating over each file atomically,
        then merges the extracted entities deterministically using Python code.

        Args:
            gcs_uris (list[str]): A list of GCS URIs of the documents for a single session.

        Returns:
            Dict[str, Any]: The unified extracted structured data with a single 'entities' array.
        """
        all_entities = []

        for uri in gcs_uris:
            try:
                # Process each document atomically to avoid LLM cognitive overload
                extracted_data = self.extract(uri)

                # Tag the document type onto each entity for later merging rules
                doc_type = extracted_data.get("document_type", "Desconhecido")
                is_casamento = "casamento" in str(doc_type).lower()
                entities = extracted_data.get("entities", [])

                for entity in entities:
                    entity["_source_document_type"] = doc_type
                    if is_casamento:
                        entity["has_marriage_certificate"] = True
                    all_entities.append(entity)

            except Exception as e:
                logger.error(f"Error extracting batch document data for URI {uri}: {e}", exc_info=True)
                raise

        # Now deterministically merge the entities
        merged_entities = deduplicate_entities(all_entities)

        # Do not enforce whitelist or clean up tags yet
        # The raw dictionaries must flow completely through to audit_draft
        return {"entities": merged_entities}

    def extract_from_text(self, text: str) -> Dict[str, Any]:
        """
        Extracts structured data from raw text using Gemini 2.5 Flash, returning
        a JSON object for the drafted document.
        Uses temperature=0.0 to reduce hallucinations.

        Args:
            text (str): The raw draft text to analyze.

        Returns:
            Dict[str, Any]: The extracted structured data.
        """
        from google import genai
        from google.genai import types

        client = genai.Client(vertexai=True, project=self.project_id, location=self.location)

        sys_instruct = (
            "You are a legal document extractor. "
            "You must STRICTLY adhere to the requested JSON schema. "
            "Do not hallucinate or invent data. If a field is not in the text, omit it or return null. "
            "Do not include markdown blocks or any other text outside the JSON."
        )

        # Profile B: Legal Drafts
        prompt = (
            "<TASK>\n"
            "Analyze the following legal draft text and extract all relevant structured data identifying entities and their core attributes.\n"
            "</TASK>\n"
            "<BUSINESS_RULES>\n"
            "1. Extract document-level properties (e.g., instrument type) into a 'document_metadata' object.\n"
            "2. Extract the primary subjects (People, Companies, Properties, Vehicles) as top-level objects in the 'entities' array.\n"
            "3. AGGRESSIVELY extract Property Data (e.g., Matrículas), Critical Dates (e.g., data_obito), and Financial/Tax Data (e.g., aliquota_itcd, valores) as standalone attributes.\n"
            "4. Each object in this array MUST include their assigned legal 'role' (e.g., 'OUTORGANTE', 'OUTORGADO', 'VENDEDOR') as a string attribute if applicable.\n"
            "5. Secondary individuals (e.g., parents) MUST be strictly nested as 'filiacao_mae' and 'filiacao_pai' string attributes within the primary subject's object. NEVER create standalone entities for parents.\n"
            "6. All extracted attribute values MUST be flat strings.\n"
            "7. Translate all keys and values into Brazilian Portuguese (pt-BR).\n"
            "</BUSINESS_RULES>\n"
            "<OUTPUT_SCHEMA>\n"
            "Return a strictly valid JSON object with:\n"
            "- 'document_metadata': object\n"
            "- 'entities': array of objects, where each object has:\n"
            "  - 'entity_name': string (the primary name/title)\n"
            "  - 'entity_type': string (strictly one of: PESSOA_FISICA, PESSOA_JURIDICA, IMOVEL, VEICULO)\n"
            "  - 'attributes': array of objects, each containing:\n"
            "      - 'key': string (e.g., 'cpf', 'nome', 'matricula', 'data_obito', 'aliquota_itcd')\n"
            "      - 'value': string (the extracted value)\n"
            "      - 'data_type': string (strictly one of: STRING, DATE, IDENTIFIER, ALPHANUMERIC)\n"
            "</OUTPUT_SCHEMA>"
        )

        @retry(wait=wait_random_exponential(min=2, max=15), stop=stop_after_attempt(5), retry=retry_if_exception_type(Exception))
        def _generate():
            with _semaphore:
                return client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[prompt, text],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.0,
                        system_instruction=sys_instruct
                    )
                )

        try:
            response = _generate()

            if not response.text:
                raise ValueError("Empty response received from Vertex AI.")

            raw_text = response.text.strip()

            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]

            raw_text = raw_text.strip()

            try:
                data = json.loads(raw_text)
                doc_type = data.get("document_type", "Desconhecido")
                is_casamento = "casamento" in str(doc_type).lower()
                if "entities" in data and isinstance(data["entities"], list):
                    for ent in data["entities"]:
                        ent["_source_document_type"] = doc_type
                        if is_casamento:
                            ent["has_marriage_certificate"] = True
                    data["entities"] = deduplicate_entities(data["entities"])
                return data
            except json.JSONDecodeError as je:
                raise ValueError(f"Failed to parse JSON response from AI model. Raw text: {raw_text[:200]}...") from je
        except Exception as e:
            logger.error(f"Error extracting from text: {e}", exc_info=True)
            tb_str = traceback.format_exc()
            raise Exception(f"Extraction from text failed: {str(e)}\nTraceback: {tb_str}") from e

    def audit_draft(self, ground_truth: Dict[str, Any], draft_text: str) -> list[Dict[str, Any]]:
        """
        Deterministically compares ground truth against the unstructured draft text.
        First extracts structured data from the draft text using an LLM,
        then performs a deterministic Python diff against the ground truth to find discrepancies.
        """
        import re
        from core.validator import DataNormalizer

        try:
            # 1. Extract structured data from the draft text
            draft_data = self.extract_from_text(draft_text)
            draft_entities = draft_data.get("entities", [])

            # Run ground truth through the deduplication engine to enforce Universal Legal Hierarchy Rule
            # and `estado_civil` domain logic ("Casado(a)") before deterministic diffing occurs.
            raw_gt_entities = ground_truth.get("entities", [])
            merged_gt_entities = deduplicate_entities(raw_gt_entities)

            # Store sources for CIN check (using get_entity_attr)
            gt_sources_by_cpf = {}
            for entity in merged_gt_entities:
                cpf = DataNormalizer.normalize_digits(get_entity_attr(entity, "cpf") or "")
                if cpf:
                    gt_sources_by_cpf[cpf] = entity.get("sources", [])

            field_labels = {
                "nome": "Nome",
                "cpf": "CPF",
                "rg": "RG",
                "orgao_emissor_rg": "Órgão Emissor do RG",
                "data_nascimento": "Data de Nascimento",
                "estado_civil": "Estado Civil",
                "filiacao_mae": "Filiação (Mãe)",
                "filiacao_pai": "Filiação (Pai)",
                "naturalidade": "Naturalidade",
                "nacionalidade": "Nacionalidade",
                "profissao": "Profissão",
                "endereco": "Endereço",
                "regime_bens": "Regime de Bens",
                "matricula": "Matrícula",
                "chassi": "Chassi",
                "placa": "Placa",
                "cnpj": "CNPJ",
                "razao_social": "Razão Social"
            }

            def format_label(key):
                return field_labels.get(key, key.replace("_", " ").title())

            discrepancies = []

            # 2. Deterministic Diffing
            for i, gt_ent in enumerate(merged_gt_entities):
                gt_entity_type = gt_ent.get("entity_type", "UNKNOWN")

                # Find matching entity in draft
                matched_draft_ent = None

                # We need to find the draft entity that matches this gt_ent
                for draft_ent in draft_entities:
                    draft_entity_type = draft_ent.get("entity_type")

                    # Loosen strict type check to handle LLM misclassification, matching mainly by identifiers
                    if gt_entity_type == "PESSOA_FISICA" and draft_entity_type in ["PESSOA_FISICA", None, "UNKNOWN"]:
                        gt_cpf = DataNormalizer.normalize_digits(get_entity_attr(gt_ent, "cpf") or "")
                        draft_cpf = DataNormalizer.normalize_digits(get_entity_attr(draft_ent, "cpf") or "")
                        if gt_cpf and draft_cpf and gt_cpf == draft_cpf:
                            matched_draft_ent = draft_ent
                            break
                        gt_nome = DataNormalizer.normalize_string(gt_ent.get("entity_name") or get_entity_attr(gt_ent, "nome") or "")
                        draft_nome = DataNormalizer.normalize_string(draft_ent.get("entity_name") or get_entity_attr(draft_ent, "nome") or "")
                        if draft_nome and gt_nome and (draft_nome in gt_nome or gt_nome in draft_nome):
                            matched_draft_ent = draft_ent
                            break
                    elif gt_entity_type == "PESSOA_JURIDICA" and draft_entity_type in ["PESSOA_JURIDICA", None, "UNKNOWN"]:
                        gt_cnpj = DataNormalizer.normalize_digits(get_entity_attr(gt_ent, "cnpj") or "")
                        draft_cnpj = DataNormalizer.normalize_digits(get_entity_attr(draft_ent, "cnpj") or "")
                        if gt_cnpj and draft_cnpj and gt_cnpj == draft_cnpj:
                            matched_draft_ent = draft_ent
                            break
                        gt_nome = DataNormalizer.normalize_string(gt_ent.get("entity_name") or get_entity_attr(gt_ent, "razao_social") or "")
                        draft_nome = DataNormalizer.normalize_string(draft_ent.get("entity_name") or get_entity_attr(draft_ent, "razao_social") or "")
                        if draft_nome and gt_nome and (draft_nome in gt_nome or gt_nome in draft_nome):
                            matched_draft_ent = draft_ent
                            break
                    elif gt_entity_type == "IMOVEL" and draft_entity_type in ["IMOVEL", None, "UNKNOWN"]:
                        gt_mat = DataNormalizer.normalize_digits(get_entity_attr(gt_ent, "matricula") or "")
                        draft_mat = DataNormalizer.normalize_digits(get_entity_attr(draft_ent, "matricula") or "")
                        if gt_mat and draft_mat and gt_mat == draft_mat:
                            matched_draft_ent = draft_ent
                            break
                        gt_nome = DataNormalizer.normalize_string(gt_ent.get("entity_name") or "")
                        draft_nome = DataNormalizer.normalize_string(draft_ent.get("entity_name") or "")
                        if draft_nome and gt_nome and (draft_nome in gt_nome or gt_nome in draft_nome):
                            matched_draft_ent = draft_ent
                            break

                        import difflib
                        if gt_mat and draft_mat and difflib.SequenceMatcher(None, gt_mat, draft_mat).ratio() >= 0.7:
                            matched_draft_ent = draft_ent
                            break

                        gt_imoveis = [e for e in merged_gt_entities if e.get("entity_type") == "IMOVEL"]
                        draft_imoveis = [e for e in draft_entities if e.get("entity_type") == "IMOVEL"]
                        if len(gt_imoveis) == 1 and len(draft_imoveis) == 1 and draft_entity_type == "IMOVEL":
                            matched_draft_ent = draft_ent
                            break
                    elif gt_entity_type == "VEICULO":
                        gt_chassi = DataNormalizer.normalize_string(get_entity_attr(gt_ent, "chassi") or "")
                        draft_chassi = DataNormalizer.normalize_string(get_entity_attr(draft_ent, "chassi") or "")
                        if gt_chassi and draft_chassi and gt_chassi == draft_chassi:
                            matched_draft_ent = draft_ent
                            break
                        gt_placa = DataNormalizer.normalize_string(get_entity_attr(gt_ent, "placa") or "")
                        draft_placa = DataNormalizer.normalize_string(get_entity_attr(draft_ent, "placa") or "")
                        if gt_placa and draft_placa and gt_placa == draft_placa:
                            matched_draft_ent = draft_ent
                            break
                    else:
                        gt_nome = DataNormalizer.normalize_string(gt_ent.get("entity_name") or "")
                        draft_nome = DataNormalizer.normalize_string(draft_ent.get("entity_name") or "")
                        if draft_nome and gt_nome and gt_nome == draft_nome:
                            matched_draft_ent = draft_ent
                            break

                nome_entidade = gt_ent.get("entity_name") or get_entity_attr(gt_ent, "nome") or get_entity_attr(gt_ent, "razao_social") or "Desconhecido"

                if not matched_draft_ent:
                    # Entity entirely missing from draft
                    discrepancies.append({
                        "field": f"entities[{i}]",
                        "category": "UNMATCHED_ENTITY",
                        "message": f"Entidade '{nome_entidade}' não encontrada na minuta do documento.",
                        "expected": nome_entidade,
                        "found_in_text": None,
                        "requires_human_review": False,
                        "entity_name": nome_entidade
                    })
                    continue

                # Intersection Diffing: only check attributes that exist in Ground Truth
                # (And ensure we don't leak 'sources', '_source_document_type', etc. - which aren't in attributes anyway)
                for gt_attr in gt_ent.get("attributes", []):
                    key = gt_attr.get("key")
                    if not key:
                        continue

                    expected_val = gt_attr.get("value")
                    data_type = gt_attr.get("data_type", "STRING")

                    if expected_val in (None, ""):
                        continue

                    # CIN Pruning Logic:
                    if gt_entity_type == "PESSOA_FISICA" and key in ["rg", "orgao_emissor_rg"]:
                        gt_cpf = DataNormalizer.normalize_digits(get_entity_attr(gt_ent, "cpf") or "")
                        gt_rg = DataNormalizer.normalize_digits(get_entity_attr(gt_ent, "rg") or "")
                        if gt_cpf and gt_rg and gt_cpf == gt_rg:
                            continue # Skip validating RG if it is same as CPF (CIN)

                    draft_val = get_entity_attr(matched_draft_ent, key)
                    field_path = f"entities[{i}].{key}"
                    label_key = format_label(key)

                    if draft_val in (None, ""):
                        discrepancies.append({
                            "field": field_path,
                            "category": "MISSING_FIELD",
                            "message": f"O campo esperado '{label_key}' está ausente na minuta.",
                            "expected": str(expected_val),
                            "found_in_text": None,
                            "requires_human_review": False,
                            "entity_name": nome_entidade
                        })
                    else:
                        if data_type == "IDENTIFIER" or key in ["cpf", "cnpj", "rg", "cep", "matricula"]:
                            norm_expected = DataNormalizer.normalize_cpf_cnpj(str(expected_val)) if key in ["cpf", "cnpj"] else DataNormalizer.normalize_digits(str(expected_val))
                            norm_draft = DataNormalizer.normalize_cpf_cnpj(str(draft_val)) if key in ["cpf", "cnpj"] else DataNormalizer.normalize_digits(str(draft_val))
                        elif data_type == "DATE" or "data" in key:
                            norm_expected = DataNormalizer.normalize_date(str(expected_val))
                            norm_draft = DataNormalizer.normalize_date(str(draft_val))
                        elif data_type == "ALPHANUMERIC":
                            norm_expected = DataNormalizer.normalize_string(str(expected_val))
                            norm_draft = DataNormalizer.normalize_string(str(draft_val))
                        else:
                            norm_expected = DataNormalizer.normalize_string(str(expected_val))
                            norm_draft = DataNormalizer.normalize_string(str(draft_val))

                        if norm_expected != norm_draft:
                            exact_substring = str(draft_val)
                            try:
                                escaped_val = re.escape(str(draft_val))
                                match = re.search(escaped_val, draft_text, re.IGNORECASE)
                                if match:
                                    exact_substring = match.group(0)
                            except Exception:
                                pass

                            discrepancies.append({
                                "field": field_path,
                                "category": "VALUE_MISMATCH",
                                "message": f"Divergência de valor para '{label_key}'. Esperado '{expected_val}', encontrado '{draft_val}'.",
                                "expected": str(expected_val),
                                "found": str(draft_val),
                                "found_in_text": exact_substring,
                                "requires_human_review": False,
                                "entity_name": nome_entidade
                            })

            return discrepancies

        except Exception as e:
            logger.error(f"Error in deterministic audit_draft: {e}", exc_info=True)
            return []
