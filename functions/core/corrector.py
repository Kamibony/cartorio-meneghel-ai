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

        prompt = f"""You are a precise text locator for legal documents. Your task is to find the exact substrings in the Draft Text that correspond to the "Found in Draft" values from the Correction Directives.

For each Correction Directive:
1. Locate the exact literal matching string in the Draft Text.
2. The match must be exact, character-for-character, including any surrounding context if necessary to be unique, but ideally just the target phrase.
3. Map this exact found text to its corresponding "Expected Truth".

Return ONLY a JSON array of objects. Each object must have exactly two keys:
- "exact_text_to_replace": The literal substring found in the Draft Text.
- "new_value": The "Expected Truth" value that should replace it.

If a directive asks to fix something but you absolutely cannot find the text, simply omit that directive from the JSON array. Do not invent text.

Correction Directives:
{directives_text}

Draft Text:
{draft_text}"""

        @retry(wait=wait_random_exponential(min=2, max=15), stop=stop_after_attempt(5), retry=retry_if_exception_type(Exception))
        def _generate():
            with _semaphore:
                return client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[prompt],
                    config=types.GenerateContentConfig(
                        temperature=0.0,
                        response_mime_type="application/json"
                    )
                )

        try:
            response = _generate()

            if not response.text:
                raise ValueError("Empty response received from Vertex AI.")

            raw_text = response.text.strip()

            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]

            raw_text = raw_text.strip()

            try:
                replacements = json.loads(raw_text)
            except json.JSONDecodeError as je:
                raise ValueError(f"Failed to parse JSON response from AI model. Raw text: {raw_text[:200]}...") from je

            if not isinstance(replacements, list):
                raise ValueError("AI response is not a JSON array.")

            corrected_text = draft_text
            for rep in replacements:
                exact_text = rep.get("exact_text_to_replace")
                new_value = rep.get("new_value")

                if not exact_text or new_value is None:
                    continue

                if exact_text in corrected_text:
                    # Using replace with count=1 to be safe, or just let it replace all occurrences if identical
                    # Replacing 1 occurrence is usually safer for names/dates to avoid collateral if it's duplicated,
                    # but if there are multiple occurrences of the EXACT same error, we might want to replace all.
                    # Let's replace all occurrences of this exact text.
                    corrected_text = corrected_text.replace(exact_text, new_value)
                else:
                    logger.warning(f"Could not find exact text '{exact_text}' in draft text. Skipping replacement.")

            return corrected_text

        except Exception as e:
            logger.error(f"Error semantically correcting text: {e}", exc_info=True)
            tb_str = traceback.format_exc()
            raise Exception(f"Correction failed: {str(e)}\nTraceback: {tb_str}") from e
