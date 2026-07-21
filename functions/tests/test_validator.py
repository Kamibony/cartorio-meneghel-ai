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

    def test_state_mapping(self):
        self.assertEqual(normalize_string("PARAIBA"), "PB")
        self.assertEqual(normalize_string("SAO PAULO"), "SP")
        self.assertEqual(normalize_string("RIO DE JANEIRO"), "RJ")
        # Ensure it doesn't change if it's already acronym
        self.assertEqual(normalize_string("PB"), "PB")

    def test_suffix_stripping(self):
        self.assertEqual(normalize_string("BRASILEIRO(A)"), "BRASILEIRO")
        self.assertEqual(normalize_string("SOLTEIRO(O/A)"), "SOLTEIRO")
        self.assertEqual(normalize_string("DIVORCIADO(A)"), "DIVORCIADO")

    def test_city_cleanup(self):
        self.assertEqual(normalize_string("JOAO PESSOA/PB"), "JOAO PESSOA")
        self.assertEqual(normalize_string("RECIFE/PE"), "RECIFE")
        # Ensure it handles normal text well
        self.assertEqual(normalize_string("CURITIBA"), "CURITIBA")

from unittest.mock import MagicMock

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

        # Mock the extractor behavior
        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "cpf": "702.478.934-47",
            "rg": "4054425",
            "nome_mae": "Câmila Figuêiredo ROCHÁ"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 0)

    def test_cpf_mismatch(self):
        typed_text = "O cpf 702.473.934-45 e o rg 4054425 de Joao, filho de CAMILA FIGUEIREDO ROCHA."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "cpf": "702.473.934-45",
            "rg": "4054425",
            "nome_mae": "CAMILA FIGUEIREDO ROCHA"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "cpf")
        self.assertEqual(errors[0]["level"], "critical")
        self.assertIn("O campo 'cpf' não confere. Esperado: 70247893447, Encontrado: 70247393445", errors[0]["message"])

    def test_rg_mismatch(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054426 de Joao, filho de CAMILA FIGUEIREDO ROCHA."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "cpf": "702.478.934-47",
            "rg": "4054426",
            "nome_mae": "CAMILA FIGUEIREDO ROCHA"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "rg")
        self.assertEqual(errors[0]["level"], "critical")
        self.assertIn("O campo 'rg' não confere. Esperado: 4054425, Encontrado: 4054426", errors[0]["message"])

    def test_mae_not_found(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054425 de Joao, filho de MARIA FIGUEIREDO ROCHA."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "cpf": "702.478.934-47",
            "rg": "4054425",
            "nome_mae": "MARIA FIGUEIREDO ROCHA"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "nome_mae")
        self.assertEqual(errors[0]["level"], "critical")
        self.assertIn("O campo 'nome_mae' não confere. Esperado: 'CAMILA FIGUEIREDO ROCHA', Encontrado: 'MARIA FIGUEIREDO ROCHA'", errors[0]["message"])

    def test_multiple_errors(self):
        typed_text = "O cpf 702.473.934-45 e o rg 4054426 de Joao, filho de MARIA."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "cpf": "702.473.934-45",
            "rg": "4054426",
            "nome_mae": "MARIA"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 3)
        fields = [e["field"] for e in errors]
        self.assertIn("cpf", fields)
        self.assertIn("rg", fields)
        self.assertIn("nome_mae", fields)

    def test_filiation_matches_different_casing_and_accents(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054425 de Joao, filho de Câmila Figuêiredo ROCHÁ."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "cpf": "702.478.934-47",
            "rg": "4054425",
            "nome_mae": "Câmila Figuêiredo ROCHÁ"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 0)

    def test_missing_expected_keys(self):
        ground_truth = {"cpf": "702.478.934-47"}
        typed_text = "O cpf 702.478.934-47 está aqui."
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "cpf": "702.478.934-47"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 0)

    def test_missing_field_in_draft(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054425 de Joao."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "cpf": "702.478.934-47",
            "rg": "4054425"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "nome_mae")
        self.assertEqual(errors[0]["level"], "critical")
        self.assertIn("O campo 'nome_mae' não foi encontrado no texto.", errors[0]["message"])

    def test_multiple_new_fields(self):
        ground_truth = {
            "cpf": "702.478.934-47",
            "rg": "4054425",
            "nome_mae": "CAMILA FIGUEIREDO ROCHA",
            "nome": "JOAO DA SILVA",
            "data_nascimento": "01/01/1990",
            "naturalidade": "SAO PAULO"
        }
        typed_text = "O cpf 702.473.934-45 e o rg 4054426 de Joaquim, nascido em 02/02/1990 em Rio de Janeiro, filho de MARIA."
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "cpf": "702.473.934-45",
            "rg": "4054426",
            "nome_mae": "MARIA",
            "nome": "Joaquim",
            "data_nascimento": "02/02/1990",
            "naturalidade": "Rio de Janeiro"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 6)
        fields = [e["field"] for e in errors]
        self.assertIn("cpf", fields)
        self.assertIn("rg", fields)
        self.assertIn("nome_mae", fields)
        self.assertIn("nome", fields)
        self.assertIn("data_nascimento", fields)
        self.assertIn("naturalidade", fields)

    def test_nested_dict_handling(self):
        ground_truth = {
            "issuing_office_details": {
                "city": "JOAO PESSOA",
                "state": "PB"
            },
            "applicant": {
                "nome": "MARIA DA SILVA",
                "cpf": "123.456.789-00"
            }
        }
        typed_text = "Em Joao Pessoa / PB, compareceu Maria da Silva com cpf 12345678900."
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "issuing_office_details": {
                "city": "JOAO PESSOA/PB", # To test city cleanup simultaneously
                "state": "PARAIBA"        # To test state mapping simultaneously
            },
            "applicant": {
                "nome": "MARIA DA SILVA(A)", # To test suffix stripping
                "cpf": "123.456.789-00"
            }
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 0)

    def test_nested_dict_missing_field(self):
        ground_truth = {
            "issuing_office_details": {
                "city": "JOAO PESSOA",
                "state": "PB"
            }
        }
        typed_text = "Em Joao Pessoa."
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "issuing_office_details": {
                "city": "JOAO PESSOA"
            }
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "issuing_office_details.state")

if __name__ == '__main__':
    unittest.main()
