import os
import json
from google import genai
from core.firebase_utils import _init_firebase
from firebase_admin import firestore
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# The template provided by the user
TEMPLATE_TEXT = """PROCURAÇÃO MODELO CAIXA ECONÓMICA FEDERAL

OUTORGANTE: [NOME_OUTORGANTE], [NACIONALIDADE], [ESTADO_CIVIL], [PROFISSAO], portador da Cédula de Identidade RG nº [RG_OUTORGANTE], inscrito no CPF/MF sob o nº [CPF_OUTORGANTE], residente e domiciliado na [ENDERECO_OUTORGANTE].

OUTORGADO: [NOME_OUTORGADO], [NACIONALIDADE], [ESTADO_CIVIL], [PROFISSAO], portador da Cédula de Identidade RG nº [RG_OUTORGADO], inscrito no CPF/MF sob o nº [CPF_OUTORGADO], residente e domiciliado na [ENDERECO_OUTORGADO].

PODERES: Pelo presente instrumento público, o(a) OUTORGANTE nomeia e constitui seu bastante procurador o(a) OUTORGADO(A), conferindo-lhe poderes amplos, gerais e ilimitados para tratar de todos os assuntos referentes à aquisição do imóvel situado na [ENDERECO_IMOVEL], podendo para tanto:

1. Representar o(a) OUTORGANTE perante a CAIXA ECONÔMICA FEDERAL - CEF, podendo assinar contratos de compra e venda, mútuo com obrigações e alienação fiduciária em garantia;
2. Pagar o preço ou parte dele, com recursos próprios ou da conta vinculada do FGTS;
3. Assinar formulários, propostas, contratos, aditivos, distratos e demais documentos exigidos pela CEF;
4. Prestar declarações sobre o estado civil e sobre a não propriedade de outros imóveis (requisitos do SFH/FGTS);
5. Abrir, movimentar e encerrar contas bancárias na CEF em nome do(a) OUTORGANTE, para os fins específicos deste contrato;
6. Assinar guias de ITBI (Imposto de Transmissão de Bens Imóveis) e solicitar isenções ou reduções, se aplicável;
7. Representar perante Cartórios de Notas e Registro de Imóveis, Prefeitura Municipal e Receita Federal.

OBSERVAÇÕES: Esta procuração é válida pelo prazo de [PRAZO_VALIDADE_MESES] meses a contar da data de sua lavratura.
"""

TEMPLATE_DESCRIPTION = "Procuração pública para compra e venda de imóvel envolvendo financiamento e uso do FGTS junto à Caixa Econômica Federal."

def vectorize_text(text: str) -> list[float]:
    """Generates text embedding using Vertex AI text-embedding-004 or a mock local version."""
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "cartorio-meneghel-ai")
    location = os.environ.get("VERTEX_AI_LOCATION", "us-central1")

    # Use mock embeddings in local/CI environments where real Google Auth isn't present
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") and os.environ.get("FIRESTORE_EMULATOR_HOST"):
        logger.warning("Using mock embeddings because local environment without real credentials detected.")
        return [0.1] * 768

    try:
        client = genai.Client(vertexai=True, project=project_id, location=location)
        response = client.models.embed_content(
            model='text-embedding-004',
            contents=text,
            config={'task_type': 'RETRIEVAL_DOCUMENT'}
        )
        return response.embeddings[0].values
    except Exception as e:
        logger.error(f"Failed to vectorize text: {e}")
        return []

def main():
    logger.info("Initializing Firebase...")
    _init_firebase()
    db = firestore.client()

    logger.info(f"Generating embedding for template description: '{TEMPLATE_DESCRIPTION}'")
    embedding = vectorize_text(TEMPLATE_DESCRIPTION)

    if not embedding:
        logger.error("Failed to generate embedding. Aborting.")
        return

    doc_id = "TEMPLATE_COMPRA_VENDA_CAIXA"

    data = {
        "content": TEMPLATE_TEXT,
        "description": TEMPLATE_DESCRIPTION,
        "embedding": embedding,
        "updatedAt": firestore.SERVER_TIMESTAMP
    }

    logger.info(f"Saving template {doc_id} to 'rag_templates' collection...")
    db.collection("rag_templates").document(doc_id).set(data)
    logger.info("Template successfully seeded!")

if __name__ == "__main__":
    import sys
    sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'functions'))
    main()
