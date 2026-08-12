1. Add Fuzzer tests for Generator (`test_generator_fuzzer.py`)
   - Mocks LLM responses and tests that the generator degrades gracefully when dealing with missing inputs or bad responses.
2. Add Closed-Loop Self-Healing tests for Generator (`test_generator_closed_loop.py`)
   - Uses AI to evaluate AI, asserting that the generator's text output passes the validator check with 0 errors.
   - We extract text cleanly from the generated `docx` and pass it directly to the validator.
3. Add Test Fixtures (`template_mock.docx`, `test_generator_golden.json`)
   - These fixtures act as the golden dataset to evaluate semantic quality and provide deterministic testing materials for the closed-loop test.
4. Modify/Add CI Actions workflows (`fuzzer_tests.yml`, `generator-evals.yml`)
   - Run the Generator Fuzzer tests alongside standard unit tests (Tier 1).
   - Set up `generator-evals.yml` to run the Closed-Loop tests on schedule and pull requests when the generation core changes (Tier 2).
5. Pre-commit check
   - Run the necessary pre commit instruction tests to verify changes and clean up as expected.
