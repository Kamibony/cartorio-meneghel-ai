import unittest
from core.validator import DocumentValidator, normalize_digits, normalize_string

class TestValidatorFunctions(unittest.TestCase):
    def test_normalize_digits(self):
        self.assertEqual(normalize_digits("123.456.789-00"), "12345678900")
        self.assertEqual(normalize_digits("12.345.678-X"), "12345678X")
        self.assertEqual(normalize_digits("12.345.678-x"), "12345678X")
        self.assertEqual(normalize_digits(12345), "12345")

    def test_normalize_string(self):
        self.assertEqual(normalize_string("  João   da   Silva  "), "JOAO DA SILVA")
        self.assertEqual(normalize_string("Cássio"), "CASSIO")
        self.assertEqual(normalize_string("CÂMARA"), "CAMARA")

class TestDocumentValidator(unittest.TestCase):
    def setUp(self):
        self.ground_truth = {
            "cpf": "702.478.934-47",
            "rg": "4054425",
            "nome_mae": "CAMILA FIGUEIREDO ROCHA"
        }

    def test_all_match(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054425 de Joao, filho de CAMILA FIGUEIREDO ROCHA."
        validator = DocumentValidator(self.ground_truth, typed_text)
        errors = validator.validate()
        self.assertEqual(len(errors), 0)

    def test_cpf_mismatch(self):
        typed_text = "O cpf 702.473.934-45 e o rg 4054425 de Joao, filho de CAMILA FIGUEIREDO ROCHA."
        validator = DocumentValidator(self.ground_truth, typed_text)
        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "cpf")
        self.assertEqual(errors[0]["level"], "critical")
        self.assertIn("Expected 70247893447 but found 70247393445", errors[0]["message"])

    def test_rg_mismatch(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054426 de Joao, filho de CAMILA FIGUEIREDO ROCHA."
        validator = DocumentValidator(self.ground_truth, typed_text)
        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "rg")
        self.assertEqual(errors[0]["level"], "critical")
        self.assertIn("Expected 4054425 but found 4054426", errors[0]["message"])

    def test_mae_not_found(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054425 de Joao, filho de MARIA FIGUEIREDO ROCHA."
        validator = DocumentValidator(self.ground_truth, typed_text)
        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "nome_mae")
        self.assertEqual(errors[0]["level"], "critical")
        self.assertIn("Expected 'CAMILA FIGUEIREDO ROCHA' as substring but not found in text", errors[0]["message"])

    def test_multiple_errors(self):
        typed_text = "O cpf 702.473.934-45 e o rg 4054426 de Joao, filho de MARIA."
        validator = DocumentValidator(self.ground_truth, typed_text)
        errors = validator.validate()
        self.assertEqual(len(errors), 3)
        fields = [e["field"] for e in errors]
        self.assertIn("cpf", fields)
        self.assertIn("rg", fields)
        self.assertIn("nome_mae", fields)

    def test_filiation_matches_different_casing_and_accents(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054425 de Joao, filho de Câmila Figuêiredo ROCHÁ."
        validator = DocumentValidator(self.ground_truth, typed_text)
        errors = validator.validate()
        self.assertEqual(len(errors), 0)

    def test_missing_expected_keys(self):
        ground_truth = {"cpf": "702.478.934-47"}
        typed_text = "O cpf 702.478.934-47 está aqui."
        validator = DocumentValidator(ground_truth, typed_text)
        errors = validator.validate()
        self.assertEqual(len(errors), 0)

if __name__ == '__main__':
    unittest.main()
