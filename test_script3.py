from functions.core.extractor import deduplicate_entities

entities = [
    {"cpf": "123", "nome": "Bianca", "estado_civil": "Solteira", "_source_document_type": "Certidão de Casamento"},
    {"cpf": "123", "nome": "Bianca", "estado_civil": "Solteira", "_source_document_type": "RG"},
    {"cpf": "123", "nome": "Bianca", "estado_civil": "Solteira", "_source_document_type": "CNH"}
]

print(deduplicate_entities(entities))
