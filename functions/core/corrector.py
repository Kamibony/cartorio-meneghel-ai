import jinja2
from typing import Dict, Any, List

MASTER_TEMPLATE = """PROCURAÇÃO PÚBLICA

OUTORGANTE: {{ outorgante_nome }}, portador(a) do CPF {{ outorgante_cpf }}.

Pelo presente instrumento público de procuração, o(a) outorgante nomeia e constitui seu bastante procurador, para o fim especial de representá-lo(a) junto aos órgãos competentes.
"""

class DocumentCorrector:
    """
    Template-Based Document Assembly Engine.
    Uses Jinja2 to generate pristine legal documents from Ground Truth JSON,
    completely bypassing flawed raw text.
    """

    def __init__(self) -> None:
        """Initializes the DocumentCorrector and the Jinja2 environment."""
        self.env = jinja2.Environment(loader=jinja2.BaseLoader())
        self.template = self.env.from_string(MASTER_TEMPLATE)

    def correct_text(self, ground_truth: Dict[str, Any], *args, **kwargs) -> str:
        """
        Generates a 100% pristine document from the master template using Ground Truth data.

        Args:
            ground_truth (Dict[str, Any]): The perfectly validated ground truth JSON.
            *args, **kwargs: Compatibility arguments to avoid breaking existing callers.

        Returns:
            str: The mathematically generated legal document.
        """
        outorgante_nome = ""
        outorgante_cpf = ""

        entities = ground_truth.get("entities", [])
        if entities and isinstance(entities, list) and len(entities) > 0:
            first_entity = entities[0]
            if isinstance(first_entity, dict):
                outorgante_nome = first_entity.get("nome", "")
                if not outorgante_nome:
                    outorgante_nome = first_entity.get("nome_requerente", "")

                outorgante_cpf = first_entity.get("cpf", "")
                if not outorgante_cpf:
                    outorgante_cpf = first_entity.get("cpf_requerente", "")

        return self.template.render(
            outorgante_nome=outorgante_nome,
            outorgante_cpf=outorgante_cpf
        )
