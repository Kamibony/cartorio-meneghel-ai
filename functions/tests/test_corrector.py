import unittest
from core.corrector import DocumentCorrector

class TestDocumentCorrector(unittest.TestCase):
    def test_successful_generation(self):
        corrector = DocumentCorrector()

        ground_truth = {
            "entities": [
                {
                    "nome": "JOÃO DA SILVA",
                    "cpf": "123.456.789-00"
                }
            ]
        }

        # Test generation with ground truth, ignoring other args
        result = corrector.correct_text(ground_truth=ground_truth, typed_text="flawed text", validation_errors=[])

        expected_text = "PROCURAÇÃO PÚBLICA\n\nOUTORGANTE: JOÃO DA SILVA, portador(a) do CPF 123.456.789-00.\n\nPelo presente instrumento público de procuração, o(a) outorgante nomeia e constitui seu bastante procurador, para o fim especial de representá-lo(a) junto aos órgãos competentes.\n"

        self.assertEqual(result.strip(), expected_text.strip())

    def test_missing_data(self):
        corrector = DocumentCorrector()
        ground_truth = {}

        result = corrector.correct_text(ground_truth=ground_truth)

        expected_text = "PROCURAÇÃO PÚBLICA\n\nOUTORGANTE: , portador(a) do CPF .\n\nPelo presente instrumento público de procuração, o(a) outorgante nomeia e constitui seu bastante procurador, para o fim especial de representá-lo(a) junto aos órgãos competentes.\n"

        self.assertEqual(result.strip(), expected_text.strip())

if __name__ == '__main__':
    unittest.main()
