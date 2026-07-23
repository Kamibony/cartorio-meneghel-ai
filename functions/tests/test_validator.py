import unittest
from core.validator import DocumentValidator, normalize_digits, normalize_string, normalize_date, normalize_list_or_string

class TestValidatorFunctions(unittest.TestCase):
    def test_normalize_date(self):
        self.assertEqual(normalize_date("26/08/2000"), "2000-08-26")
        self.assertEqual(normalize_date("2000-08-26"), "2000-08-26")
        self.assertEqual(normalize_date("2000/08/26"), "2000-08-26")
        self.assertEqual(normalize_date("01-02-1990"), "1990-02-01")
        self.assertEqual(normalize_date("some random text"), "some random text")
        self.assertEqual(normalize_date(""), "")

    def test_normalize_list_or_string(self):
        # List input
        self.assertEqual(normalize_list_or_string(["B", "A", "C "]), ["A", "B", "C"])

        # String input with separators
        self.assertEqual(normalize_list_or_string("João e Maria"), ["JOAO", "MARIA"])
        self.assertEqual(normalize_list_or_string("João, Maria and José"), ["JOAO", "JOSE", "MARIA"])
        self.assertEqual(normalize_list_or_string("João ou Maria"), ["JOAO", "MARIA"])

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
            "document_metadata": {
                "tipo_instrumento": "PROCURAÇÃO PÚBLICA"
            },
            "entities": [
                {
                    "cpf": "702.478.934-47",
                    "rg": "4054425",
                    "nome_mae": "CAMILA FIGUEIREDO ROCHA",
                    "nome": "JOAO DA SILVA"
                }
            ]
        }

    def test_all_match(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054425 de Joao, filho de CAMILA FIGUEIREDO ROCHA."
        validator = DocumentValidator(self.ground_truth, typed_text)

        # Mock the extractor behavior
        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "document_metadata": {
                "tipo_instrumento": "PROCURAÇÃO PÚBLICA"
            },
            "entities": [
                {
                    "cpf": "702.478.934-47",
                    "rg": "4054425",
                    "nome_mae": "Câmila Figuêiredo ROCHÁ",
                    "nome": "JOAO DA SILVA"
                }
            ]
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 0)

    def test_cpf_mismatch(self):
        typed_text = "O cpf 702.473.934-45 e o rg 4054425 de Joao, filho de CAMILA FIGUEIREDO ROCHA."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "entities": [
                {
                    "cpf": "702.473.934-45",
                    "rg": "4054425",
                    "nome_mae": "CAMILA FIGUEIREDO ROCHA",
                    "nome": "JOAO DA SILVA"
                }
            ]
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "entities[0].cpf")
        self.assertIn(errors[0]["category"], ["VALUE_MISMATCH", "MISSING_FIELD"])
        self.assertIn("O campo 'entities[0].cpf' não confere. Esperado: 70247893447, Encontrado: 70247393445", errors[0]["message"])

    def test_rg_mismatch(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054426 de Joao, filho de CAMILA FIGUEIREDO ROCHA."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "entities": [
                {
                    "cpf": "702.478.934-47",
                    "rg": "4054426",
                    "nome_mae": "CAMILA FIGUEIREDO ROCHA",
                    "nome": "JOAO DA SILVA"
                }
            ]
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "entities[0].rg")
        self.assertIn(errors[0]["category"], ["VALUE_MISMATCH", "MISSING_FIELD"])
        self.assertIn("O campo 'entities[0].rg' não confere. Esperado: 4054425, Encontrado: 4054426", errors[0]["message"])

    def test_mae_not_found(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054425 de Joao, filho de MARIA FIGUEIREDO ROCHA."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "entities": [
                {
                    "cpf": "702.478.934-47",
                    "rg": "4054425",
                    "nome_mae": "MARIA FIGUEIREDO ROCHA",
                    "nome": "JOAO DA SILVA"
                }
            ]
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "entities[0].nome_mae")
        self.assertIn(errors[0]["category"], ["VALUE_MISMATCH", "MISSING_FIELD"])
        self.assertIn("O campo 'entities[0].nome_mae' não confere. Esperado: 'CAMILA FIGUEIREDO ROCHA', Encontrado: 'MARIA FIGUEIREDO ROCHA'", errors[0]["message"])

    def test_multiple_errors(self):
        typed_text = "O cpf 702.473.934-45 e o rg 4054426 de Joao, filho de MARIA."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "entities": [
                {
                    "cpf": "702.473.934-45",
                    "rg": "4054426",
                    "nome_mae": "MARIA",
                    "nome": "JOAO DA SILVA"
                }
            ]
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 3)
        fields = [e["field"] for e in errors]
        self.assertIn("entities[0].cpf", fields)
        self.assertIn("entities[0].rg", fields)
        self.assertIn("entities[0].nome_mae", fields)

    def test_filiation_matches_different_casing_and_accents(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054425 de Joao, filho de Câmila Figuêiredo ROCHÁ."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "entities": [
                {
                    "cpf": "702.478.934-47",
                    "rg": "4054425",
                    "nome_mae": "Câmila Figuêiredo ROCHÁ",
                    "nome": "JOAO DA SILVA"
                }
            ]
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 0)

    def test_missing_expected_keys(self):
        ground_truth = {"entities": [{"cpf": "702.478.934-47"}]}
        typed_text = "O cpf 702.478.934-47 está aqui."
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "entities": [{"cpf": "702.478.934-47"}]
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 0)

    def test_missing_field_in_draft(self):
        typed_text = "O cpf 702.478.934-47 e o rg 4054425 de Joao."
        validator = DocumentValidator(self.ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "entities": [
                {
                    "cpf": "702.478.934-47",
                    "rg": "4054425",
                    "nome": "JOAO DA SILVA"
                }
            ]
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "entities[0].nome_mae")
        self.assertIn(errors[0]["category"], ["VALUE_MISMATCH", "MISSING_FIELD"])
        self.assertIn("O campo 'entities[0].nome_mae' não foi encontrado no texto.", errors[0]["message"])

    def test_multiple_new_fields(self):
        ground_truth = {
            "entities": [
                {
                    "cpf": "702.478.934-47",
                    "rg": "4054425",
                    "nome_mae": "CAMILA FIGUEIREDO ROCHA",
                    "nome": "JOAO DA SILVA",
                    "data_nascimento": "01/01/1990",
                    "naturalidade": "SAO PAULO"
                }
            ]
        }
        typed_text = "O cpf 702.473.934-45 e o rg 4054426 de Joaquim, nascido em 02/02/1990 em Rio de Janeiro, filho de MARIA."
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "entities": [
                {
                    "cpf": "702.478.934-47",  # MUST MATCH CPF TO BE IDENTIFIED as the SAME entity without fallback
                    "rg": "4054426",
                    "nome_mae": "MARIA",
                    "nome": "Joaquim",
                    "data_nascimento": "02/02/1990",
                    "naturalidade": "Rio de Janeiro"
                }
            ]
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 5)  # cpf now matches, the rest are errors
        fields = [e["field"] for e in errors]
        self.assertIn("entities[0].rg", fields)
        self.assertIn("entities[0].nome_mae", fields)
        self.assertIn("entities[0].nome", fields)
        self.assertIn("entities[0].data_nascimento", fields)
        self.assertIn("entities[0].naturalidade", fields)

    def test_flat_dict_handling(self):
        ground_truth = {
            "cidade_expedicao": "JOAO PESSOA",
            "estado_expedicao": "PB",
            "nome_requerente": "MARIA DA SILVA",
            "cpf_requerente": "123.456.789-00"
        }
        typed_text = "Em Joao Pessoa / PB, compareceu Maria da Silva com cpf 12345678900."
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "cidade_expedicao": "JOAO PESSOA/PB", # To test city cleanup simultaneously
            "estado_expedicao": "PARAIBA",        # To test state mapping simultaneously
            "nome_requerente": "MARIA DA SILVA(A)", # To test suffix stripping
            "cpf_requerente": "123.456.789-00"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 0)

    def test_flat_dict_missing_field(self):
        ground_truth = {
            "cidade_expedicao": "JOAO PESSOA",
            "estado_expedicao": "PB"
        }
        typed_text = "Em Joao Pessoa."
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "cidade_expedicao": "JOAO PESSOA"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "estado_expedicao")

    def test_filiation_list_vs_string(self):
        ground_truth = {
            "filiacao": ["PATRICIA", "HERMANN"]
        }
        typed_text = "filho de HERMANN e PATRICIA"
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "filiacao": "HERMANN E PATRICIA"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 0)

    def test_date_formatting(self):
        ground_truth = {
            "data_nascimento": "2000-06-26"
        }
        typed_text = "nascido em 26/06/2000"
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "data_nascimento": "26/06/2000"
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 0)


    def test_missing_non_essential_field_in_draft(self):
        ground_truth = {
            "cpf": "702.478.934-47",
            "linha_mrz_1": "IDBRASCAMILA<<<<<<<<<<<<<<<"
        }
        typed_text = "O cpf 702.478.934-47."
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "cpf": "702.478.934-47",
            # linha_mrz_1 omitted from draft json
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 0) # Should be gracefully ignored

class TestDiverseNotarialActs(unittest.TestCase):
    def test_escritura_compra_venda(self):
        ground_truth = {
            "document_metadata": {
                "tipo_instrumento": "ESCRITURA",
                "non_essential_field_1": "ALGUM VALOR",
                "emolumentos_valor": "R$ 100,00",
                "selo_digital": "ABC12345",
                "cartorio_endereco": "RUA PRINCIPAL, 123"
            },
            "entities": [
                {"role": "VENDEDOR", "nome": "JOAO VENDEDOR", "cpf": "111.111.111-11", "rg": "1111111"},
                {"role": "VENDEDOR", "nome": "MARIA VENDEDORA", "cpf": "222.222.222-22", "rg": "2222222"},
                {"role": "COMPRADOR", "nome": "PEDRO COMPRADOR", "cpf": "333.333.333-33", "rg": "3333333"},
                {"role": "COMPRADOR", "nome": "ANA COMPRADORA", "cpf": "444.444.444-44", "rg": "4444444"}
            ]
        }
        typed_text = "Escritura de Compra e Venda..."
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "entities": [
                {"role": "VENDEDOR", "nome": "JOAO VENDEDOR", "cpf": "111.111.111-11", "rg": "1111111"},
                {"role": "VENDEDOR", "nome": "MARIA VENDEDORA", "cpf": "222.222.222-22", "rg": "2222220"},
                {"role": "COMPRADOR", "nome": "PEDRO COMPRADOR", "cpf": "333.333.333-33", "rg": "3333333"},
                {"role": "COMPRADOR", "nome": "ANA COMPRADORA", "cpf": "444.444.444-44", "rg": "4444444"}
            ]
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "entities[1].rg")
        self.assertIn(errors[0]["category"], ["VALUE_MISMATCH", "MISSING_FIELD"])
        self.assertIn("2222222", errors[0]["message"])
        self.assertIn("2222220", errors[0]["message"])

    def test_inventario_e_partilha(self):
        ground_truth = {
            "document_metadata": {
                "tipo_instrumento": "INVENTÁRIO E PARTILHA",
                "non_essential_field_2": "ALGUMA INFO",
                "emolumentos_valor": "R$ 500,00"
            },
            "entities": [
                {"role": "DE_CUJUS", "nome": "FALECIDO DA SILVA", "cpf": "555.555.555-55", "data_nascimento": "1940-05-10"},
                {"role": "HERDEIRO", "nome": "HERDEIRO DA SILVA", "cpf": "666.666.666-66", "data_nascimento": "1970-01-01"}
            ]
        }
        typed_text = "Inventário e Partilha..."
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "entities": [
                {"role": "DE_CUJUS", "nome": "FALECIDO DA SILVA", "cpf": "555.555.555-55", "data_nascimento": "10/05/1940"},
                {"role": "HERDEIRO", "nome": "HERDEIRA DA SILVA", "cpf": "666.666.666-66", "data_nascimento": "1970-01-01"}
            ]
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["field"], "entities[1].nome")
        self.assertIn(errors[0]["category"], ["VALUE_MISMATCH", "MISSING_FIELD"])
        self.assertIn("HERDEIRO DA SILVA", errors[0]["message"])
        self.assertIn("HERDEIRA DA SILVA", errors[0]["message"])

    def test_procuracao_publica(self):
        ground_truth = {
            "document_metadata": {
                "tipo_instrumento": "PROCURAÇÃO PÚBLICA",
                "selo_digital": "XYZ987",
                "cartorio_endereco": "AVENIDA CENTRAL"
            },
            "entities": [
                {
                    "role": "OUTORGANTE",
                    "nome_requerente": "OUTORGANTE DA SILVA",
                    "cpf_requerente": "777.777.777-77",
                    "cpf": "777.777.777-77",
                    "estado_civil": "CASADO"
                }
            ]
        }
        typed_text = "Procuração Pública..."
        validator = DocumentValidator(ground_truth, typed_text)

        mock_extractor = MagicMock()
        mock_extractor.extract_from_text.return_value = {
            "entities": [
                {
                    "role": "OUTORGANTE",
                    "nome_requerente": "OUTORGANTE DA SILVA",
                    "cpf_requerente": "777.777.777-78",
                    "cpf": "777.777.777-78",
                    "estado_civil": "SOLTEIRO"
                }
            ]
        }
        validator._extractor_instance = mock_extractor

        errors = validator.validate()
        self.assertEqual(len(errors), 3) # cpf, cpf_requerente, estado_civil
        fields = [e["field"] for e in errors]
        self.assertIn("entities[0].cpf_requerente", fields)
        self.assertIn("entities[0].estado_civil", fields)

if __name__ == '__main__':
    unittest.main()
