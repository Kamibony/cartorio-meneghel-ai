from pydantic import BaseModel, field_validator, ValidationError
from typing import List, Optional, Any, Dict
import re

class Attribute(BaseModel):
    key: str
    value: Any
    data_type: str = "STRING"

class EntityModel(BaseModel):
    entity_name: str
    entity_type: str
    attributes: List[Attribute] = []
    _source_document_type: Optional[str] = None
    has_marriage_certificate: Optional[bool] = None
    _conflicts: Optional[Dict[str, Any]] = None
    _resolved_conflicts: Optional[List[str]] = None
    sources: Optional[List[str]] = None
    _extraction_errors: Optional[List[Dict[str, str]]] = None

    class Config:
        extra = 'allow'

class PessoaFisica(EntityModel):
    @field_validator('attributes')
    def validate_cpf_rg_date(cls, v):
        for attr in v:
            if attr.key == 'cpf':
                val = str(attr.value)
                # Ensure it's exactly 11 digits (after removing non-digits)
                digits = re.sub(r'[^0-9]', '', val)
                if len(digits) != 11:
                    raise ValueError("CPF must be 11 digits.")
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

        return validated.model_dump(exclude_unset=True)

    except ValidationError as e:
        # Instead of rejecting the whole entity, we will flag the error and return the dict
        # with _extraction_errors populated.
        errors = []
        for error in e.errors():
            errors.append({"loc": str(error.get('loc')), "msg": error.get('msg'), "type": error.get('type')})

        entity_dict["_extraction_errors"] = errors
        return entity_dict
