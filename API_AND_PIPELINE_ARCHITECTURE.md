# API & Pipeline Architecture Review

## 1. Root Cause Analysis

### Why did our 60s Firebase Hosting timeout bypass fail?
Firebase Hosting imposes a strict, hard-coded 60-second limit on all requests routed through it (via the `rewrites` array in `firebase.json`), regardless of the underlying Cloud Function's configured timeout. Our previous attempts to bypass this failed because the frontend fell back to using the default `/api` base URL when dynamic endpoint variables (like `VITE_EXTRACT_API_URL`) were missing or unset in the CI/CD environment. Consequently, the frontend routed requests through Firebase Hosting, triggering the 60s limit before the backend could finish processing.

### Why is `generate_document` returning HTML (`<!doctype html>`) instead of JSON?
This is a classic Single Page Application (SPA) fallback trap caused by a missing route definition combined with an API protocol mismatch:
1. **Missing Rewrite Rule:** The frontend performs a `fetch` to `${ENV.apiUrl}/generate_document` (resolving to `/api/generate_document`). However, `generate_document` is missing from the `rewrites` array in `firebase.json`. Firebase Hosting sees an unmapped path and triggers the catch-all `**` rewrite rule, serving the frontend's `index.html`.
2. **Protocol Mismatch:** The frontend attempts to parse this HTML document as JSON, resulting in a fatal `SyntaxError: Unexpected token '<'`.
3. **Callable vs. Request:** The `generate_document` backend function is currently implemented as a Firebase Callable (`@https_fn.on_call`). Callables wrap responses in an opaque envelope. When they fail, it's difficult to issue a clean HTTP JSON error contract manually, which complicates custom error propagation.

---

## 2. API Routing Strategy

To build a definitive, long-term architectural pattern, we will decouple long-running API tasks from Firebase Hosting entirely.

* **Direct Cloud Run Communication:** For endpoints prone to exceeding 60 seconds (like document extraction or LLM generation), the frontend must communicate *directly* with the native Cloud Run / Gen2 Cloud Function URLs (e.g., `https://<region>-<project>.cloudfunctions.net/<function_name>`). This bypasses the Firebase Hosting proxy and inherits the backend's configured maximum timeout (up to 60 minutes).
* **Protocol Standardization:** All backend API endpoints must be converted from `@https_fn.on_call` to standard `@https_fn.on_request`. This enforces a RESTful standard, allows manual token parsing (`_init_firebase()`), and guarantees that the backend controls the exact HTTP status codes and JSON response structure.
* **Separation of Concerns:** Fast, lightweight functions (like status checks) can remain under Firebase Hosting rewrites (`/api/...`) to benefit from CDN caching and unified domains. Heavy operations will use the direct URLs.

---

## 3. CI/CD & Environment Variables

Currently, the frontend and backend are deployed concurrently, and the frontend relies on static, manually configured GitHub Secrets. This breaks when we need dynamic deployed URLs. We will invert the pipeline dependencies.

### The New Pipeline Flow:
1. **Deploy Backend First:** The GitHub Action will deploy `functions` first.
2. **Dynamic Endpoint Extraction:** Using the Firebase CLI or gcloud CLI within the Action, we will dynamically query the live URLs of the deployed functions.
   ```bash
   EXTRACT_URL=$(gcloud run services describe extract_document_data --region us-central1 --format 'value(status.url)')
   GENERATE_URL=$(gcloud run services describe generate_document_api --region us-central1 --format 'value(status.url)')
   ```
3. **Inject Env Vars & Build Frontend:** These dynamic URLs will be securely passed into the frontend build step as environment variables:
   ```bash
   VITE_EXTRACT_API_URL=$EXTRACT_URL npm run build
   ```
4. **Deploy Frontend Last:** The frontend, now fully baked with the correct direct Cloud Run URLs, is deployed to Firebase Hosting.

---

## 4. Global Error Handling (Contract)

To eliminate unhandled rejections and UI crashes, we must establish a strict API Error Contract.

### Backend Strategy (The Error Contract)
The backend will implement a global exception wrapper (or decorator) for all `@https_fn.on_request` functions. No matter what fails—be it a bad payload, missing auth, or an unexpected Python `Exception`—the backend will *never* return HTML. It will strictly return:

```json
{
  "error": {
    "code": "HTTP_STATUS_CODE",
    "message": "Human readable summary.",
    "details": "Technical details (only if dev/staging, else null)"
  }
}
```

### Frontend Strategy (Axios Interceptor)
We will deprecate scattered `fetch` calls and implement a centralized `Axios` client instance.
* **Global Interceptor:** An Axios response interceptor will evaluate all incoming responses.
* **Timeout / Gateway Error Handling:** If the network drops, or a 502/504 gateway timeout occurs, the interceptor manually constructs a fallback JSON payload matching the Error Contract and throws a standardized `AppError`.
* **UI Resilience:** Top-level React components (or a global Error Boundary) will catch `AppError`, rendering localized toast notifications (e.g., "O servidor demorou muito para responder") instead of crashing the React component tree.

---

## 5. Step-by-Step Execution Plan

**Phase 1: Backend API Refactor**
1. Refactor `generate_document` and other major endpoints in `main.py` from `@https_fn.on_call` to `@https_fn.on_request`.
2. Implement the Global JSON Exception handler decorator.
3. Remove `generate_document` and heavy functions from `firebase.json` rewrites to prevent accidental routing.

**Phase 2: CI/CD Pipeline Inversion**
1. Modify `.github/workflows/deploy.yml`.
2. Split the workflow into sequential jobs: `deploy-backend` -> `build-and-deploy-frontend`.
3. Add steps to dynamically query gcloud/firebase for direct endpoint URLs and inject them into the Vite build step.

**Phase 3: Frontend API Client Implementation**
1. Introduce a unified Axios client (`src/api/client.ts`).
2. Configure interceptors to normalize 4xx, 5xx, and network errors into a single `AppError` type.
3. Migrate all existing `fetch` calls across components (`TemplateGeneratorInput`, `MasterDashboard`, etc.) to use the unified Axios client.
4. Ensure UI components handle these rejections cleanly without unmounting unexpectedly.
