import os
import json
import logging
import traceback
import threading
from typing import Dict, Any, List
from tenacity import retry, wait_random_exponential, stop_after_attempt, retry_if_exception_type

logger = logging.getLogger(__name__)

_semaphore = threading.Semaphore(3)

class DocumentCorrector:
    """
    Context-Aware Semantic Correction Engine.
    Uses Gemini 2.5 Flash to apply corrections to unstructured text based on discrepancies found.
    """

    def __init__(self) -> None:
        """Initializes the DocumentCorrector."""
        self.project_id = os.environ.get("FIREBASE_PROJECT_ID", "cartorio-meneghel-ai")
        self.location = os.environ.get("VERTEX_AI_LOCATION", "us-central1")

        if not self.project_id:
            raise ValueError("FIREBASE_PROJECT_ID environment variable must be set.")

    def correct_text(self, draft_text: str, validation_errors: List[Dict[str, Any]]) -> str:
        """
        Applies corrections semantically using AI.

        Args:
            draft_text (str): The raw draft text to be corrected.
            validation_errors (List[Dict[str, Any]]): The list of discrepancies found by the validator.

        Returns:
            str: The semantically corrected text.
        """
        if not validation_errors:
            return draft_text

        from google import genai
        from google.genai import types

        client = genai.Client(vertexai=True, project=self.project_id, location=self.location)

        # Build directives from validation errors
        directives_text = ""
        for idx, error in enumerate(validation_errors):
            field = error.get("field", "Unknown")
            expected = error.get("expected", "Unknown")
            found = error.get("found", "Unknown")
            message = error.get("message", "")

            directives_text += f"- Issue {idx + 1}:\n"
            directives_text += f"  Field context: {field}\n"
            directives_text += f"  Expected Truth: {expected}\n"
            directives_text += f"  Found in Draft: {found}\n"
            directives_text += f"  Details: {message}\n"

        prompt = f"""You are a precise legal document editor. Apply the provided Correction Directives to the draft text.
Locate the relevant entity context and update their specific field to match the 'Expected Truth'.
If the text has a typo, fix it. If the field is missing, insert it naturally.

CRITICAL INSTRUCTIONS:
1. STRICT SWAP AND REPLACE: You must completely remove the string found in "Found in Draft" and replace it entirely with "Expected Truth".
2. DO NOT BLEND OR CONCATENATE: Never append the new data to the old data. Never leave parts of the old data behind.
3. Do not alter any other words, formatting, or paragraphs outside of the necessary corrections.
4. Maintain the original document's language (Portuguese) and tone.
5. Return ONLY the fully corrected text. Do not include markdown blocks, explanations, or any other wrapper text.

ANTI-PATTERNS (DO NOT DO THIS):
- Bad Example 1 (Blending Date): changing "08" to "06" in "26/08/2000" and returning "26/086/2000".
- Good Example 1 (Strict Swap): returning "26/06/2000".
- Bad Example 2 (Appending Name): returning "Ideval Suzarte Lago e João Fàbio Dantas PereiraCAMILA FIGUEIREDO ROCHA e JOAO FABIO DANTAS PEREIRA".
- Good Example 2 (Strict Swap): returning "CAMILA FIGUEIREDO ROCHA e JOAO FABIO DANTAS PEREIRA".
- Bad Example 3 (Blending CPF): replacing "702.473.934-45" with "123.456.789-00" and returning "702.4738.934.45-47".
- Good Example 3 (Strict Swap): returning "123.456.789-00".

Correction Directives:
{directives_text}

Draft Text to Correct:
{draft_text}"""

        @retry(wait=wait_random_exponential(min=2, max=15), stop=stop_after_attempt(5), retry=retry_if_exception_type(Exception))
        def _generate():
            with _semaphore:
                return client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[prompt],
                    config=types.GenerateContentConfig(
                        temperature=0.0
                    )
                )

        try:
            response = _generate()

            if not response.text:
                raise ValueError("Empty response received from Vertex AI.")

            corrected_text = response.text.strip()

            # Remove markdown code block if present
            if corrected_text.startswith("```text"):
                corrected_text = corrected_text[7:]
            elif corrected_text.startswith("```"):
                corrected_text = corrected_text[3:]
            if corrected_text.endswith("```"):
                corrected_text = corrected_text[:-3]

            return corrected_text.strip()

        except Exception as e:
            logger.error(f"Error semantically correcting text: {e}", exc_info=True)
            tb_str = traceback.format_exc()
            raise Exception(f"Correction failed: {str(e)}\nTraceback: {tb_str}") from e
