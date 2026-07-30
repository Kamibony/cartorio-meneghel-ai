import argparse
import json
import os
import sys

def main():
    parser = argparse.ArgumentParser(description="Run evaluation on a folder of PDFs using Vertex AI extraction.")
    parser.add_argument("--pdf-folder", type=str, required=True, help="Folder containing raw PDFs")
    parser.add_argument("--golden-json", type=str, required=True, help="Path to golden dataset JSON (maps filename to expected entities)")

    args = parser.parse_args()

    pdf_folder = args.pdf_folder
    golden_json_path = args.golden_json

    if not os.path.isdir(pdf_folder):
        print(f"Error: PDF folder '{pdf_folder}' does not exist.", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(golden_json_path):
        print(f"Error: Golden JSON file '{golden_json_path}' does not exist.", file=sys.stderr)
        sys.exit(1)

    with open(golden_json_path, "r", encoding="utf-8") as f:
        golden_data = json.load(f)

    print(f"Loaded {len(golden_data)} golden entries.")

    # We must append the functions directory to sys.path to import modules correctly
    script_dir = os.path.dirname(os.path.abspath(__file__))
    functions_dir = os.path.join(script_dir, "functions")
    if functions_dir not in sys.path:
        sys.path.insert(0, functions_dir)

    from core.extractor import DocumentExtractor
    from core.validator import DataNormalizer
    from core.extractor import get_entity_attr

    extractor = DocumentExtractor()

    total_files = 0
    passed_files = 0
    failed_files = 0

    for filename, expected_data in golden_data.items():
        pdf_path = os.path.join(pdf_folder, filename)
        if not os.path.exists(pdf_path):
            print(f"Warning: File {pdf_path} not found. Skipping.")
            continue

        print(f"\nEvaluating: {filename}...")
        total_files += 1

        try:
            # We hit the live Vertex API here
            extracted = extractor.extract(gcs_uri=pdf_path)
            extracted_entities = extracted.get("entities", [])

            file_passed = True

            # Basic validation
            # For each expected entity, try to find a matching one and compare attributes
            expected_entities = expected_data.get("entities", [])
            for i, expected_entity in enumerate(expected_entities):
                expected_type = expected_entity.get("entity_type")

                # Simple matching strategy
                matched_extracted = None

                # Same fuzzy match approach as in audit.py
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

                if not matched_extracted:
                    print(f"  ❌ FAIL: Entity '{expected_entity.get('entity_name')}' missing.")
                    file_passed = False
                    continue

                # Compare attributes
                for attr in expected_entity.get("attributes", []):
                    key = attr.get("key")
                    expected_val = attr.get("value")
                    data_type = attr.get("data_type", "STRING")

                    if not key or expected_val in (None, ""):
                        continue

                    ext_val = get_entity_attr(matched_extracted, key)
                    if ext_val in (None, ""):
                        print(f"  ❌ FAIL: Attribute '{key}' missing on entity '{expected_entity.get('entity_name')}'. Expected: '{expected_val}'.")
                        file_passed = False
                        continue

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

                    if norm_expected != norm_ext:
                        print(f"  ❌ FAIL: Value mismatch for '{key}' on entity '{expected_entity.get('entity_name')}'. Expected: '{expected_val}' ({norm_expected}), Got: '{ext_val}' ({norm_ext}).")
                        file_passed = False

            if file_passed:
                print(f"  ✅ PASS")
                passed_files += 1
            else:
                failed_files += 1

        except Exception as e:
            print(f"  ❌ FAIL: Extraction threw an exception: {e}")
            file_passed = False
            failed_files += 1

    print("\n--- Evaluation Summary ---")
    print(f"Total Files Processed: {total_files}")
    print(f"Passed: {passed_files}")
    print(f"Failed: {failed_files}")

    if failed_files > 0:
        sys.exit(1)

if __name__ == "__main__":
    main()
