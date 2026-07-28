from typing import Dict, Any, List
import copy
import difflib
from core.validator import DataNormalizer

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

class MasterProfileConsolidator:
    DOCUMENT_HIERARCHY = {
        "Certidão de Casamento": 100,
        "Certidão de Nascimento": 90,
        "CIN": 60,
        "Carteira de Identidade Nacional": 60,
        "CNH": 50,
        "RG": 40,
        "Desconhecido": 0
    }

    @classmethod
    def merge_into_master_profile(cls, existing_entity: dict, incoming_entity: dict) -> dict:
        hierarchy = cls.DOCUMENT_HIERARCHY

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

    @classmethod
    def is_name_compatible(cls, n1, n2):
        if not n1 or not n2:
            return False
        if n1 in n2 or n2 in n1:
            return True
        stopwords = {"DE", "DA", "DO", "DAS", "DOS", "E"}
        t1 = {w for w in n1.split() if w not in stopwords}
        t2 = {w for w in n2.split() if w not in stopwords}
        if t1 and t2 and (t1.issubset(t2) or t2.issubset(t1)):
            return True

        ratio = difflib.SequenceMatcher(None, n1, n2).ratio()
        if ratio >= 0.8:
            return True

        return False

    @classmethod
    def do_entities_match(cls, ent1, ent2):
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
                if cls.is_name_compatible(nome1, nome2):
                    mae1 = DataNormalizer.normalize_string(get_entity_attr(ent1, "filiacao_mae") or "")
                    mae2 = DataNormalizer.normalize_string(get_entity_attr(ent2, "filiacao_mae") or "")

                    if mae1 and mae2:
                        if cls.is_name_compatible(mae1, mae2):
                            return True
                        else:
                            return False

                    nasc1 = DataNormalizer.normalize_string(get_entity_attr(ent1, "data_nascimento") or "")
                    nasc2 = DataNormalizer.normalize_string(get_entity_attr(ent2, "data_nascimento") or "")

                    if nasc1 and nasc2 and nasc1 == nasc2:
                        return True

                    return "POTENTIAL_DUPLICATE"
            return False

        elif entity_type == "PESSOA_JURIDICA":
            cnpj1 = DataNormalizer.normalize_digits(get_entity_attr(ent1, "cnpj") or "")
            cnpj2 = DataNormalizer.normalize_digits(get_entity_attr(ent2, "cnpj") or "")
            if cnpj1 and cnpj2 and cnpj1 == cnpj2:
                return True
            nome1 = DataNormalizer.normalize_string(ent1.get("entity_name") or get_entity_attr(ent1, "razao_social") or "")
            nome2 = DataNormalizer.normalize_string(ent2.get("entity_name") or get_entity_attr(ent2, "razao_social") or "")
            if (not cnpj1 or not cnpj2) and nome1 and nome2:
                if cls.is_name_compatible(nome1, nome2):
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

    @classmethod
    def deduplicate_entities(cls, entities: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
        merged_entities = []

        for entity in entities:
            if "attributes" in entity:
                for attr in entity["attributes"]:
                    if "key" in attr:
                        attr["key"] = normalize_attribute_key(attr["key"])

            matched_idx = -1
            potential_duplicate_idx = -1
            for i, merged_ent in enumerate(merged_entities):
                match_result = cls.do_entities_match(entity, merged_ent)
                if match_result is True:
                    matched_idx = i
                    break
                elif match_result == "POTENTIAL_DUPLICATE":
                    potential_duplicate_idx = i

            if matched_idx == -1:
                new_ent = copy.deepcopy(entity)
                doc_type = new_ent.pop("_source_document_type", "")

                current_sources = new_ent.get("sources", [])
                if not isinstance(current_sources, list):
                    current_sources = []

                if doc_type and doc_type not in current_sources:
                    current_sources.append(doc_type)

                new_ent["sources"] = current_sources

                if potential_duplicate_idx != -1:
                    existing_potential = merged_entities[potential_duplicate_idx]

                    if "_potential_duplicates" not in new_ent:
                        new_ent["_potential_duplicates"] = []
                    new_ent["_potential_duplicates"].append(existing_potential.get("entity_name", "Unknown Entity"))

                    if "_potential_duplicates" not in existing_potential:
                        existing_potential["_potential_duplicates"] = []
                    existing_potential["_potential_duplicates"].append(new_ent.get("entity_name", "Unknown Entity"))

                merged_entities.append(new_ent)
            else:
                existing = merged_entities[matched_idx]
                incoming_type = entity.get("_source_document_type", "")
                if incoming_type:
                    entity["_source_document_type"] = incoming_type

                merged_entities[matched_idx] = cls.merge_into_master_profile(existing, entity)

        return merged_entities
