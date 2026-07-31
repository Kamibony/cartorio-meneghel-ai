import os
import sys
import unittest
import json

# Adjust imports based on the functions directory structure
script_dir = os.path.dirname(os.path.abspath(__file__))
functions_dir = os.path.dirname(script_dir)
if functions_dir not in sys.path:
    sys.path.insert(0, functions_dir)

from core.extractor import DocumentExtractor, get_entity_attr
from core.validator import DataNormalizer

@unittest.skipIf(not os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'), "Skipping LLM evals because GOOGLE_APPLICATION_CREDENTIALS is not set.")
class TestLLMEvals(unittest.TestCase):
    """
    Automated LLM Evaluation Pipeline.
    Runs Vertex AI extraction directly on real PDFs and asserts outputs against a Golden Dataset JSON.
    """

    def setUp(self):
        self.extractor = DocumentExtractor()

        # Test paths based on where GitHub Actions or local environment will run it from
        # It could be run from the root or from `functions/`.
        self.project_root = os.path.abspath(os.path.join(functions_dir, '..'))
        self.pdf_folder = os.path.join(self.project_root, "test_data", "pdfs")
        self.golden_json_path = os.path.join(self.project_root, "test_data", "goldens", "test_golden.json")

    def test_llm_evaluations(self):
        # We only run if test_data exists
        if not os.path.isdir(self.pdf_folder):
            self.skipTest(f"PDF folder '{self.pdf_folder}' not found.")
        if not os.path.isfile(self.golden_json_path):
            self.skipTest(f"Golden JSON file '{self.golden_json_path}' not found.")

        with open(self.golden_json_path, "r", encoding="utf-8") as f:
            golden_data = json.load(f)

        total_files = len(golden_data)
        self.assertGreater(total_files, 0, "No golden entries to evaluate.")

        for filename, expected_data in golden_data.items():
            pdf_path = os.path.join(self.pdf_folder, filename)

            # Since our setup might not have all PDFs, we skip missing ones.
            if not os.path.exists(pdf_path):
                print(f"Warning: File {pdf_path} not found. Skipping.")
                continue

            print(f"\nEvaluating: {filename}...")

            # Extract via Vertex API
            # As per memory: The DocumentExtractor.extract method supports processing local files by reading them as bytes and using types.Part.from_bytes()
            extracted = self.extractor.extract(gcs_uri=pdf_path) # Extractor will handle local files if it is a local path
            extracted_entities = extracted.get("entities", [])

            expected_entities = expected_data.get("entities", [])
            for i, expected_entity in enumerate(expected_entities):
                expected_type = expected_entity.get("entity_type")

                # Simple matching strategy
                matched_extracted = None

                for ext_ent in extracted_entities:
                    if ext_ent.get("entity_type") == expected_type:
                        # Try to match by CPF/CNPJ or Matricula if available
                        expected_cpf = DataNormalizer.normalize_digits(get_entity_attr(expected_entity, "cpf") or "")
                        ext_cpf = DataNormalizer.normalize_digits(get_entity_attr(ext_ent, "cpf") or "")
                        if expected_cpf and ext_cpf and expected_cpf == ext_cpf:
                            matched_extracted = ext_ent
                            break

                        expected_cnpj = DataNormalizer.normalize_digits(get_entity_attr(expected_entity, "cnpj") or "")
                        ext_cnpj = DataNormalizer.normalize_digits(get_entity_attr(ext_ent, "cnpj") or "")
                        if expected_cnpj and ext_cnpj and expected_cnpj == ext_cnpj:
                            matched_extracted = ext_ent
                            break

                        expected_mat = DataNormalizer.normalize_digits(get_entity_attr(expected_entity, "matricula") or "")
                        ext_mat = DataNormalizer.normalize_digits(get_entity_attr(ext_ent, "matricula") or "")
                        if expected_mat and ext_mat and expected_mat == ext_mat:
                            matched_extracted = ext_ent
                            break

                        # Fallback to name match
                        expected_name = DataNormalizer.normalize_string(expected_entity.get("entity_name") or get_entity_attr(expected_entity, "nome") or "")
                        ext_name = DataNormalizer.normalize_string(ext_ent.get("entity_name") or get_entity_attr(ext_ent, "nome") or "")
                        if expected_name and ext_name and (expected_name in ext_name or ext_name in expected_name):
                            matched_extracted = ext_ent
                            break

                self.assertIsNotNone(
                    matched_extracted,
                    f"Entity '{expected_entity.get('entity_name')}' missing from extracted outputs for {filename}."
                )

                # Compare attributes
                for attr in expected_entity.get("attributes", []):
                    key = attr.get("key")
                    expected_val = attr.get("value")
                    data_type = attr.get("data_type", "STRING")

                    if not key or expected_val in (None, ""):
                        continue

                    ext_val = get_entity_attr(matched_extracted, key)
                    self.assertTrue(
                        ext_val not in (None, ""),
                        f"Attribute '{key}' missing on entity '{expected_entity.get('entity_name')}'. Expected: '{expected_val}'."
                    )

                    # Normalize based on data type
                    if data_type == "IDENTIFIER" or key in ["cpf", "cnpj", "rg", "cep", "matricula"]:
                        norm_expected = DataNormalizer.normalize_cpf_cnpj(str(expected_val)) if key in ["cpf", "cnpj"] else DataNormalizer.normalize_digits(str(expected_val))
                        norm_ext = DataNormalizer.normalize_cpf_cnpj(str(ext_val)) if key in ["cpf", "cnpj"] else DataNormalizer.normalize_digits(str(ext_val))
                    elif data_type == "DATE" or "data" in key:
                        norm_expected = DataNormalizer.normalize_date(str(expected_val))
                        norm_ext = DataNormalizer.normalize_date(str(ext_val))
                    elif data_type == "ALPHANUMERIC":
                        norm_expected = DataNormalizer.normalize_string(str(expected_val))
                        norm_ext = DataNormalizer.normalize_string(str(ext_val))
                    else:
                        norm_expected = DataNormalizer.normalize_string(str(expected_val))
                        norm_ext = DataNormalizer.normalize_string(str(ext_val))

                    self.assertEqual(
                        norm_expected,
                        norm_ext,
                        f"Value mismatch for '{key}' on entity '{expected_entity.get('entity_name')}'. "
                        f"Expected: '{expected_val}' ({norm_expected}), Got: '{ext_val}' ({norm_ext})."
                    )

if __name__ == '__main__':
    unittest.main()
