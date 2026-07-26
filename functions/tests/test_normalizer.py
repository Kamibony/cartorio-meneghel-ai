import unittest
from core.validator import DataNormalizer

class TestDataNormalizer(unittest.TestCase):
    def test_normalize_string_gender(self):
        self.assertEqual(DataNormalizer.normalize_string("Solteira"), "SOLTEIRO")
        self.assertEqual(DataNormalizer.normalize_string("Solteiro(a)"), "SOLTEIRO")
        self.assertEqual(DataNormalizer.normalize_string("Brasileiro"), "BRASILEIRO")
        self.assertEqual(DataNormalizer.normalize_string("BRASILEIRO(A)"), "BRASILEIRO")

    def test_normalize_string_location(self):
        self.assertEqual(DataNormalizer.normalize_string("JOÃO PESSOA/PB"), "JOAO PESSOA PB")
        self.assertEqual(DataNormalizer.normalize_string("João Pessoa - PB"), "JOAO PESSOA PB")
        self.assertEqual(DataNormalizer.normalize_string("JOAO PESSOA, PB"), "JOAO PESSOA PB")

    def test_normalize_digits_cpf(self):
        self.assertEqual(DataNormalizer.normalize_digits("10385790406"), "10385790406")
        self.assertEqual(DataNormalizer.normalize_digits("103.857.904-06"), "10385790406")

if __name__ == '__main__':
    unittest.main()
