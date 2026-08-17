import os
import json
import google.generativeai as genai

class LLMGenerationService:
    def __init__(self):
        # Initialize Gemini API
        api_key = os.environ.get("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
            # Using standard recommended text model
            self.model = genai.GenerativeModel('gemini-1.5-pro')
        else:
            print("Warning: GEMINI_API_KEY not found in environment. Generation will fail.")
            self.model = None

    def generate_document(self, intent: str, template: dict, ground_truth_data: dict) -> str:
        """
        Generates the final legal document by injecting Ground Truth data into the RAG template 
        using the Gemini API, strictly guided by the Escrevente's intent.
        """
        if not self.model:
            raise RuntimeError("Gemini model not initialized. Missing API Key.")
            
        if not template or 'content' not in template:
            raise ValueError("Invalid RAG template provided.")

        system_prompt = (
            "You are an Escrevente (Notary Public Assistant) responsible for compiling a final legal document.\n"
            "Your task is to precisely recreate the provided RAG Template, maintaining the EXACT boilerplate, "
            "tone, legal structure, and specific endings (such as CNIB, LGPD, and notary certifications).\n\n"
            "INSTRUCTIONS:\n"
            "1. Inject the provided verified 'Ground Truth Data' (JSON) seamlessly into the text, replacing "
            "placeholders like [OUTORGANTE_NOME], [RG_NUMERO], etc., with the exact values from the JSON.\n"
            "2. Adapt the specific scope of the document (e.g., property or vehicle details) ONLY based on "
            "the 'Escrevente Intent' string and the Ground Truth Data.\n"
            "3. DO NOT hallucinate new powers, names, or document numbers. Use ONLY the data provided.\n"
            "4. Return ONLY the final generated plain text document. Do not include markdown formatting, "
            "explanations, or conversational filler."
        )

        user_prompt = (
            f"=== ESCREVENTE INTENT ===\n{intent}\n\n"
            f"=== GROUND TRUTH DATA (JSON) ===\n{json.dumps(ground_truth_data, indent=2, ensure_ascii=False)}\n\n"
            f"=== RAG TEMPLATE ===\n{template['content']}\n"
        )

        try:
            response = self.model.generate_content(
                contents=[
                    {"role": "user", "parts": [{"text": system_prompt}]},
                    {"role": "user", "parts": [{"text": user_prompt}]}
                ],
                generation_config=genai.types.GenerationConfig(
                    temperature=0.1, # Low temperature for highly deterministic, factual output
                )
            )
            return response.text.strip()
        except Exception as e:
            print(f"Error during LLM generation: {e}")
            raise e
