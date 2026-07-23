import os
import json
import logging
import re
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

        blocks = draft_text.split('\n')
        draft_text_with_blocks = "\n".join(f"[Block {i}] {block}" for i, block in enumerate(blocks))

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

        prompt = f"""You are a precise text locator and navigator for legal documents. Your task is to find the exact location in the Draft Text that correspond to the "Found in Draft" values from the Correction Directives.
The Draft Text is provided as a series of blocks, each prefixed with its block index, like "[Block 0] ...".

For each Correction Directive:
1. Identify the block index containing the text to be replaced.
2. Identify a short, literal "prefix" string that occurs immediately *before* the target text in that block.
3. Identify a short, literal "suffix" string that occurs immediately *after* the target text in that block.
4. The prefix and suffix act as anchors to isolate the bad text. They must be exact, literal strings found in the block.
5. Provide the "Expected Truth" as the new value.

Return ONLY a JSON array of objects. Each object must have exactly four keys:
- "block_index": The integer index of the block.
- "prefix": The safe literal text immediately before the error.
- "suffix": The safe literal text immediately after the error.
- "new_value": The "Expected Truth" value that should replace the text between prefix and suffix.

If a directive asks to fix something but you absolutely cannot find it, simply omit that directive from the JSON array. Do not invent text.

Correction Directives:
{directives_text}

Draft Text:
{draft_text_with_blocks}"""

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

            for rep in replacements:
                block_index = rep.get("block_index")
                prefix = rep.get("prefix", "")
                suffix = rep.get("suffix", "")
                new_value = rep.get("new_value")

                if block_index is None or new_value is None:
                    continue

                try:
                    block_index = int(block_index)
                except ValueError:
                    logger.warning(f"Invalid block_index '{block_index}' returned by AI. Skipping replacement.")
                    continue

                if not (0 <= block_index < len(blocks)):
                    logger.warning(f"Block index {block_index} out of bounds. Skipping replacement.")
                    continue

                target_block = blocks[block_index]

                # Construct regex pattern to match prefix + (anything) + suffix
                # We use DOTALL in case there are internal line breaks if blocks weren't split by \n (though they were)
                pattern_str = re.escape(prefix) + r"(.*?)" + re.escape(suffix)
                try:
                    pattern = re.compile(pattern_str, flags=re.DOTALL)
                    match = pattern.search(target_block)
                    if match:
                        start_idx = match.start(1)
                        end_idx = match.end(1)
                        # Splice the new value in
                        blocks[block_index] = target_block[:start_idx] + new_value + target_block[end_idx:]
                    else:
                        logger.warning(f"Could not find prefix/suffix anchors '{prefix}' / '{suffix}' in block {block_index}. Skipping replacement.")
                except re.error as re_err:
                    logger.warning(f"Failed to compile regex pattern for anchors: {re_err}")
                    continue

            corrected_text = "\n".join(blocks)
            return corrected_text

        except Exception as e:
            logger.error(f"Error semantically correcting text: {e}", exc_info=True)
            tb_str = traceback.format_exc()
            raise Exception(f"Correction failed: {str(e)}\nTraceback: {tb_str}") from e
