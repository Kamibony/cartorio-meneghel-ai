from functions.core.extractor import deduplicate_entities

entities = [
    {"cpf": "123", "nome": "Bianca", "estado_civil": "Solteira", "_source_document_type": "RG"},
    {"cpf": "123", "nome": "Bianca", "estado_civil": "Casada", "_source_document_type": "Certidão de Casamento"}
]

print(deduplicate_entities(entities))
