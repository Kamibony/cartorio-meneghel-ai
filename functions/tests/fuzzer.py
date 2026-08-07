import random
import copy
import string
from typing import Dict, Any, Tuple
from faker import Faker
from deepdiff import DeepDiff
import sys
import os
from unittest.mock import MagicMock

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.models import PessoaFisica, Imovel, Attribute, EntityModel, validate_entity
from core.validator import DocumentValidator
from core.extractor import DocumentExtractor

fake = Faker('pt_BR')

class FuzzerMetrics:
    def __init__(self):
        self.stats = {
            "Compra e Venda": {"total": 0, "pass": 0, "fail": 0},
            "Doacao": {"total": 0, "pass": 0, "fail": 0},
            "Inventario": {"total": 0, "pass": 0, "fail": 0},
            "Procuracao": {"total": 0, "pass": 0, "fail": 0}
        }

    def log(self, act: str, passed: bool):
        self.stats[act]["total"] += 1
        if passed:
            self.stats[act]["pass"] += 1
        else:
            self.stats[act]["fail"] += 1

    def report(self):
        print("\n--- FUZZER METRICS REPORT ---")
        for act, metrics in self.stats.items():
            total = metrics["total"]
            if total == 0:
                continue
            pass_rate = (metrics["pass"] / total) * 100
            print(f"[{act}] Total: {total} | Pass: {metrics['pass']} ({pass_rate:.2f}%) | Fail: {metrics['fail']}")
        print("-----------------------------\n")

def mutate_string(value: str) -> tuple[str, str]:
    if not value or len(value) < 3:
        return value, "NONE"
    chars = list(value)
    mutation_type = random.choice(['swap', 'drop', 'lower'])
    if mutation_type == 'swap':
        idx = random.randint(0, len(chars) - 2)
        chars[idx], chars[idx+1] = chars[idx+1], chars[idx]
        return "".join(chars), "TYPO"
    elif mutation_type == 'drop':
        idx = random.randint(0, len(chars) - 1)
        chars.pop(idx)
        return "".join(chars), "TYPO"
    elif mutation_type == 'lower':
        return value.lower(), "FORMATTING"
    return "".join(chars), "TYPO"

def create_pydantic_entity(entity_type: str, name: str, attrs: dict) -> dict:
    attributes = [Attribute(key=k, value=v, data_type="STRING") for k, v in attrs.items()]

    if entity_type == "PESSOA_FISICA":
        ent = PessoaFisica(entity_name=name, entity_type=entity_type, attributes=attributes)
    elif entity_type == "IMOVEL":
        ent = Imovel(entity_name=name, entity_type=entity_type, attributes=attributes)
    else:
        ent = EntityModel(entity_name=name, entity_type=entity_type, attributes=attributes)

    return validate_entity(ent.model_dump(by_alias=True))

def generate_compra_venda() -> Tuple[dict, dict]:
    comprador = create_pydantic_entity("PESSOA_FISICA", fake.name(), {
        "cpf": fake.cpf(),
        "rg": fake.rg(),
        "endereco": fake.address(),
        "papel": "Comprador"
    })
    vendedor = create_pydantic_entity("PESSOA_FISICA", fake.name(), {
        "cpf": fake.cpf(),
        "rg": fake.rg(),
        "endereco": fake.address(),
        "papel": "Vendedor"
    })
    imovel = create_pydantic_entity("IMOVEL", "Imovel", {
        "matricula": str(fake.random_int(min=1000, max=99999)),
        "endereco": fake.address(),
        "itbi_valor": f"R$ {fake.random_int(min=1000, max=50000)},00"
    })
    ground_truth = {"entities": [comprador, vendedor, imovel], "act_type": "Compra e Venda"}
    return ground_truth, copy.deepcopy(ground_truth)

def generate_doacao() -> Tuple[dict, dict]:
    doador = create_pydantic_entity("PESSOA_FISICA", fake.name(), {
        "cpf": fake.cpf(),
        "rg": fake.rg(),
        "papel": "Doador"
    })
    donatario = create_pydantic_entity("PESSOA_FISICA", fake.name(), {
        "cpf": fake.cpf(),
        "rg": fake.rg(),
        "papel": "Donatario"
    })
    imovel = create_pydantic_entity("IMOVEL", "Imovel Doado", {
        "matricula": str(fake.random_int(min=1000, max=99999)),
        "itcd_valor": f"R$ {fake.random_int(min=500, max=20000)},00"
    })
    ground_truth = {"entities": [doador, donatario, imovel], "act_type": "Doacao"}
    return ground_truth, copy.deepcopy(ground_truth)

def generate_inventario() -> Tuple[dict, dict]:
    de_cujus = create_pydantic_entity("PESSOA_FISICA", fake.name(), {
        "cpf": fake.cpf(),
        "data_obito": fake.date(pattern="%d/%m/%Y"),
        "papel": "De Cujus"
    })
    herdeiro = create_pydantic_entity("PESSOA_FISICA", fake.name(), {
        "cpf": fake.cpf(),
        "papel": "Herdeiro"
    })
    ground_truth = {"entities": [de_cujus, herdeiro], "act_type": "Inventario"}
    return ground_truth, copy.deepcopy(ground_truth)

def generate_procuracao() -> Tuple[dict, dict]:
    outorgante = create_pydantic_entity("PESSOA_FISICA", fake.name(), {
        "cpf": fake.cpf(),
        "rg": fake.rg(),
        "papel": "Outorgante"
    })
    outorgado = create_pydantic_entity("PESSOA_FISICA", fake.name(), {
        "cpf": fake.cpf(),
        "rg": fake.rg(),
        "papel": "Outorgado"
    })
    ground_truth = {"entities": [outorgante, outorgado], "act_type": "Procuracao"}
    return ground_truth, copy.deepcopy(ground_truth)


def mutate_draft(draft: dict) -> list[str]:
    """
    Applies variations and typos to the draft data.
    Returns a list of mutation types applied (either 'FORMATTING' or 'TYPO').
    """
    mutation_types = set()
    for entity in draft.get("entities", []):
        # 30% chance to mutate the entity name
        if random.random() < 0.3:
            mutated_val, mut_type = mutate_string(entity["entity_name"])
            if mut_type != "NONE":
                entity["entity_name"] = mutated_val
                mutation_types.add(mut_type)

        for attr in entity.get("attributes", []):
            if random.random() < 0.3:
                val = str(attr["value"])
                mutation_chance = random.random()

                if attr["key"] == "cpf" and mutation_chance < 0.5:
                    attr["value"] = val.replace(".", "").replace("-", "")
                    mutation_types.add("FORMATTING")
                elif attr["key"] == "rg" and mutation_chance < 0.5:
                    attr["value"] = val.replace(".", "").replace("-", "")
                    mutation_types.add("FORMATTING")
                elif "data" in attr["key"] and mutation_chance < 0.5:
                    if "/" in val:
                        attr["value"] = val.replace("/", "-")
                        mutation_types.add("FORMATTING")
                else:
                    mutated_val, mut_type = mutate_string(val)
                    if mut_type != "NONE":
                        attr["value"] = mutated_val
                        mutation_types.add(mut_type)

    return list(mutation_types)

def mock_extract_from_text(self, text: str) -> dict:
    import json
    return json.loads(text)

def run_fuzzer(iterations: int = 100):
    metrics = FuzzerMetrics()
    generators = [
        ("Compra e Venda", generate_compra_venda),
        ("Doacao", generate_doacao),
        ("Inventario", generate_inventario),
        ("Procuracao", generate_procuracao)
    ]

    print(f"Starting fuzzer with {iterations} iterations...")

    import json
    DocumentExtractor.extract_from_text = mock_extract_from_text

    for i in range(iterations):
        act_name, generator = random.choice(generators)
        ground_truth, draft = generator()

        # We need a plain draft_text for the DocumentValidator to read and "parse" (via our mock)
        # But we also need the text to pass the "reverse hallucination check" in Validator (where it checks if found_in_text is in typed_text)
        mutation_types = mutate_draft(draft)

        # Serialize mutated draft to a string.
        # The mocked extractor will just deserialize this JSON back into dicts.
        draft_text = json.dumps(draft)

        validator = DocumentValidator(ground_truth, draft_text)
        errors = validator.validate()

        passed = True

        if "TYPO" in mutation_types:
            # If we introduced a real typo, we EXPECT errors (False Negative check)
            if len(errors) == 0:
                diff = DeepDiff(ground_truth, draft, ignore_order=True)
                print(f"Failed on {act_name} #{i} (False Negative): Typo introduced but Normalizer bypassed it. Diff: {diff}")
                passed = False
        elif "FORMATTING" in mutation_types and "TYPO" not in mutation_types:
            # If we only introduced formatting changes, we expect NO errors (False Positive check)
            if len(errors) > 0:
                diff = DeepDiff(ground_truth, draft, ignore_order=True)
                print(f"Failed on {act_name} #{i} (False Positive): Format changed, but Normalizer flagged it as an error: {errors}. Diff: {diff}")
                passed = False
        elif len(mutation_types) == 0:
            # Baseline exactly matches
            if len(errors) > 0:
                 diff = DeepDiff(ground_truth, draft, ignore_order=True)
                 print(f"Failed on {act_name} #{i} (Baseline Failure): No mutations, but errors found: {errors}. Diff: {diff}")
                 passed = False

        metrics.log(act_name, passed)

    metrics.report()

if __name__ == "__main__":
    run_fuzzer(iterations=100)

# Adding analytical diffs back to output the False Negative / False Positive contexts as requested.
# I'll update the run_fuzzer print statements in-place.

from unittest.mock import patch

@patch('firebase_admin.initialize_app')
@patch('google.genai.Client')
def test_fuzzer(mock_genai_client, mock_firebase_init):
    run_fuzzer(iterations=100)
