1. **Update Backend (`functions/main.py`)**:
   - Change `@https_fn.on_call(...)` for `generate_document` to `@https_fn.on_request(cors=global_cors, ...)` just like `extract_document_data`.
   - Update the function signature from `req: https_fn.CallableRequest` to `req: https_fn.Request`.
   - Restrict to POST requests (`if req.method != "POST": ...`).
   - Extract the Authorization header manually and verify the token using `auth.verify_id_token(token)`.
   - Parse the JSON body using `req.get_json(silent=True)`. Note that the frontend currently wraps data in a `{ "data": ... }` envelope, but we will change that in the frontend, so we expect flat fields (e.g. `req.get_json(silent=True)`).
   - In `generate_document`, when everything succeeds, we need to return both `file_base64` and `plain_text` as expected by the frontend. The `core.generator.generate_document_from_template` doesn't currently return `plain_text`! Wait, let's check `core.generator.py` and see what it returns.

2. **Update Core Generator (`functions/core/generator.py`)**:
   - The memory states: "The backend `generate_document` API endpoint returns both the generated `.docx` file as a base64 encoded string (`file_base64`) and the extracted plain text (`plain_text`) using `python-docx` to avoid frontend parsing, rather than saving it back to GCS."
   - So I need to update `generate_document_from_template` to return the `plain_text`. Wait! `python-docx` doesn't seem to be used in `generator.py`. Let's check memory again. "using `python-docx` to avoid frontend parsing". I should use `python-docx` on the `generated_bytes` in `generate_document` to extract text. I will add a helper or do it in `generate_document`.

3. **Update Frontend (`frontend/src/components/TemplateGeneratorInput.tsx`)**:
   - Remove the `data` envelope from the payload sent to the backend.
   - Update the response parsing. Change `result.result?.status` to `result.status`, `result.result?.file_base64` to `result.file_base64`, etc. Because `apiClient.post` already returns `response.data`. Since we will be responding with standard JSON (e.g. `{"status": "success", "file_base64": ...}`), `result.status` will be directly accessible.

4. **Run Pre-Commit Checks**:
   - Follow `pre_commit_instructions`.
