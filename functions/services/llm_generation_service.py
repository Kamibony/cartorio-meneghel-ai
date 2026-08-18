import os
import json
import logging
from google import genai
from google.genai import types
from core.config import GEMINI_MODEL

logger = logging.getLogger(__name__)

class LLMGenerationService:
    def __init__(self):
        # Inicializácia klienta cez nové moderné SDK (google-genai)
        project_id = os.environ.get("FIREBASE_PROJECT_ID", "cartorio-meneghel-ai")
        location = os.environ.get("VERTEX_AI_LOCATION", "us-central1")
        self.client = genai.Client(vertexai=True, project=project_id, location=location)

    def generate_document(self, intent: str, template: str, ground_truth_data: dict) -> str:
        """
        Syntetizuje finálny dokument spojením RAG šablóny, Ground Truth dát a intencie.
        """
        prompt = f"""
        Você é um Escrevente de um Cartório no Brasil.
        Sua tarefa é gerar o texto final de um documento legal baseado estritamente no template fornecido,
        preenchendo-o com os dados do 'Ground Truth' e adaptando-o conforme a 'Intenção' do usuário.

        <REGRAS_CRITICAS>
        1. Mantenha a estrutura legal, tom e boilerplate do template (especialmente cláusulas de CNIB, LGPD).
        2. Injete os dados do <GROUND_TRUTH> de forma natural e com a gramática correta (concordância de gênero/número).
        3. Adapte os poderes/escopo do documento APENAS com base na <INTENCAO>. Não alucine poderes extras.
        4. Se um dado essencial estiver faltando no Ground Truth, não use [DADO FALTANTE]. Adapte a frase para fluir naturalmente sem ele.
        5. Retorne APENAS o texto final gerado, sem formatação markdown e sem explicações.
        </REGRAS_CRITICAS>

        <INTENCAO>
        {intent}
        </INTENCAO>

        <GROUND_TRUTH>
        {json.dumps(ground_truth_data, ensure_ascii=False, indent=2)}
        </GROUND_TRUTH>

        <TEMPLATE_BASE>
        {template}
        </TEMPLATE_BASE>
        """

        try:
            # Volanie Gemini cez novú knižnicu
            response = self.client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.1 # Nízka teplota pre faktickú právnu presnosť
                )
            )
            
            final_text = response.text.strip()
            
            # Bezpečnostná poistka na odstránenie markdown blokov, ak by ich model pridal
            if final_text.startswith("```"):
                lines = final_text.split('\n')
                if len(lines) > 2:
                    final_text = '\n'.join(lines[1:-1])
            
            return final_text
            
        except Exception as e:
            logger.error(f"Failed to generate document via LLM API: {e}")
            raise
