from pydantic import BaseModel, field_validator, ValidationError, Field, ConfigDict, model_validator
from typing import List, Optional, Any, Dict
import re

class Attribute(BaseModel):
    key: str
    value: Any
    data_type: str = "STRING"

class EntityModel(BaseModel):
    model_config = ConfigDict(extra='allow', populate_by_name=True)

    entity_name: str
    entity_type: str
    attributes: List[Attribute] = []
    source_document_type: Optional[str] = Field(default=None, alias='_source_document_type')
    has_marriage_certificate: Optional[bool] = None
    conflicts: Optional[Dict[str, Any]] = Field(default=None, alias='_conflicts')
    resolved_conflicts: Optional[List[str]] = Field(default=None, alias='_resolved_conflicts')
    sources: Optional[List[str]] = None
    extraction_errors: Optional[List[Dict[str, str]]] = Field(default=None, alias='_extraction_errors')

class PessoaFisica(EntityModel):
    @model_validator(mode='after')
    def apply_domain_rules(self) -> 'PessoaFisica':
        # Domain rule: If the entity comes from a Marriage Certificate, its legal status is strictly "Casado(a)"
        doc_type = self.source_document_type or ""
        sources = self.sources or []
        has_cert = self.has_marriage_certificate or any("casamento" in s.lower() for s in sources) or "casamento" in doc_type.lower()
        if has_cert:
            found = False
            for attr in self.attributes:
                if attr.key == "estado_civil":
                    attr.value = "Casado(a)"
                    found = True
                    break
            if not found:
                self.attributes.append(Attribute(key="estado_civil", value="Casado(a)", data_type="STRING"))

            if self.resolved_conflicts is None:
                self.resolved_conflicts = []
            if "estado_civil" not in self.resolved_conflicts:
                self.resolved_conflicts.append("estado_civil")

            if self.conflicts and "estado_civil" in self.conflicts:
                del self.conflicts["estado_civil"]
                if not self.conflicts:
                    self.conflicts = None

        return self

    @field_validator('attributes')
    def validate_cpf_rg_date(cls, v):
        for attr in v:
            if attr.key == 'cpf':
                val = str(attr.value)
                # Ensure it's exactly 11 digits (after removing non-digits)
                digits = re.sub(r'[^0-9]', '', val)
                if len(digits) != 11:
                    raise ValueError("CPF must be 11 digits.")
            elif attr.key == 'rg':
                val = str(attr.value)
                # Permissive alphanumeric cast, stripping common formatting characters like . and -
                sanitized = re.sub(r'[\.\-]', '', val)
                attr.value = sanitized
            elif attr.key == 'data_nascimento' or attr.key == 'data_obito':
                val = str(attr.value)
                # Expecting basic date formats
                if not re.match(r'^(\d{1,2}[/-]\d{1,2}[/-]\d{4})|(\d{4}[/-]\d{1,2}[/-]\d{1,2})$', val):
                    pass # We will allow standard dates and let normalization handle it
        return v

class PessoaJuridica(EntityModel):
    @field_validator('attributes')
    def validate_cnpj(cls, v):
        for attr in v:
            if attr.key == 'cnpj':
                val = str(attr.value)
                digits = re.sub(r'[^0-9]', '', val)
                if len(digits) != 14:
                    raise ValueError("CNPJ must be 14 digits.")
        return v

class Imovel(EntityModel):
    pass

class Veiculo(EntityModel):
    pass

def validate_entity(entity_dict: dict) -> dict:
    entity_type = entity_dict.get("entity_type")

    try:
        if entity_type == "PESSOA_FISICA":
            validated = PessoaFisica(**entity_dict)
        elif entity_type == "PESSOA_JURIDICA":
            validated = PessoaJuridica(**entity_dict)
        elif entity_type == "IMOVEL":
            validated = Imovel(**entity_dict)
        elif entity_type == "VEICULO":
            validated = Veiculo(**entity_dict)
        else:
            validated = EntityModel(**entity_dict)

        return validated.model_dump(by_alias=True, exclude_unset=True)

    except ValidationError as e:
        # Instead of rejecting the whole entity, we will flag the error and return the dict
        # with _extraction_errors populated.
        errors = []
        for error in e.errors():
            errors.append({"loc": str(error.get('loc')), "msg": error.get('msg'), "type": error.get('type')})

        entity_dict["_extraction_errors"] = errors
        return entity_dict
