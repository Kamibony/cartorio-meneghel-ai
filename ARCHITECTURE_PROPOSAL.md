<!-- markdownlint-disable MD013 MD004 MD036 -->

# Architecture Proposal (RFC): Cartório B2B SaaS Platform

## 1. Executive Summary

This RFC outlines the architectural foundation for a new B2B SaaS platform designed for Brazilian Notary Offices (Cartórios). The system focuses on absolute accuracy and legal compliance, initially providing a "Data Checker" to validate manually transcribed data against scanned personal documents (CNH, RG, Certidões) without relying on AI for the final truth, thus preventing hallucinations.

## 2. Repository Strategy

**Recommendation: Monorepo**

For an AI-driven development workflow and a tightly coupled system where data contracts between frontend, backend, and validation services must remain strictly synchronized, a **Monorepo** is the most suitable strategy.

* **Single Source of Truth:** Code for frontend, backend, shared types, and deployment configurations live in one repository.
* **AI-Assisted Context:** AI coding assistants (like GitHub Copilot or Cursor) perform significantly better when they have full context of the entire codebase. A monorepo ensures the AI sees the frontend data structures alongside the backend API endpoints, leading to more accurate code generation and refactoring.
* **Shared Types:** We can share TypeScript interfaces (or Protobufs/GraphQL schemas) across the stack, guaranteeing that any change in the data model immediately breaks the build if not addressed everywhere.
* **Atomic Commits:** Changes spanning the entire stack can be committed atomically, simplifying CI/CD and rollback procedures.

We recommend using tools like **Turborepo** or **Nx** to manage the monorepo efficiently, ensuring fast build times via caching.

## 3. Tech Stack

Given the strict requirement for 100% accuracy and zero-error legal tech, the tech stack must prioritize type safety, predictability, and ecosystem maturity.

### Frontend

* **Framework:** React with Next.js (App Router).
* **Language:** TypeScript (Strict Mode).
* **Justification:** Next.js provides robust tooling and server-side rendering capabilities. TypeScript is non-negotiable; strict static typing eliminates a massive class of runtime errors. The React ecosystem has mature libraries for complex document viewing (e.g., side-by-side comparison interfaces for scans and text).

### Backend

* **Framework:** NestJS (Node.js) or Go.
* **Language:** TypeScript (if NestJS) or Go.
* **Recommendation:** **NestJS with TypeScript**.
* **Justification:** NestJS enforces a highly structured, opinionated architecture (modules, controllers, services) which is crucial for a zero-error environment. Keeping both frontend and backend in TypeScript allows seamless code sharing (DTOs, validation schemas) in our monorepo. For the database layer, an ORM like Prisma or Drizzle provides fully type-safe database queries.
* **Database:** Cloud SQL (PostgreSQL). Relational databases with strong ACID compliance are mandatory for legal documents.
* **Storage:** Cloud Storage (GCP) for raw document scans and final PDFs.

## 4. Validation Engine Design (Phase 1)

The core challenge is to ensure the AI (OCR) extraction never hallucinates data that is then blindly accepted as truth. The validation engine must be entirely deterministic.

### Architectural Approach

We will strictly separate the **Stochastic Extraction (AI)** from the **Deterministic Validation (Rules Engine)**.

1. **Upload & Processing (Async):**
   - User uploads scan (PDF/Image) and typed text payload.
   - Files are stored in GCP Cloud Storage.
   - An event triggers the processing pipeline via Cloud Pub/Sub.

2. **Stochastic Extraction (Google Document AI / Vertex AI):**
   - The document scan is sent to Google Document AI (or a specialized Vertex AI pipeline).
   - *Goal:* Extract all possible text, bounding boxes, and key-value pairs (Name, CPF, Dates).
   - *Output:* A structured JSON representing the AI's *interpretation* of the document. We acknowledge this data may contain errors or hallucinations.

3. **Deterministic Validation (The Cross-Check Engine):**
   - This is a separate microservice or bounded context.
   - It takes two inputs:
     a) The User's Typed Text (The current "Truth" to be verified).
     b) The AI Extracted Data & Bounding Boxes.
   - **The Rule:** The AI data is *never* used to populate the final document. It is *only* used as a verification layer against the manually typed text.
   - **Cross-Check Algorithm:**
     - The engine runs strict string matching algorithms (exact match, Levenshtein distance for highlighting near-misses, date format normalization) between the typed text and the extracted text.
     - CPF/CNPJ validation algorithms are run deterministically on the typed data.
   - **Highlighting Discrepancies:**
     - If `Typed Name` != `AI Extracted Name`, the system flags this field.
     - Using the bounding box data from Document AI, the frontend can visually draw a box around the specific area on the scanned image where the discrepancy occurred, allowing the human operator to quickly resolve it.

**Guaranteeing Zero Hallucinations:**

By design, the AI cannot hallucinate data into the final legal document because the AI's output is purely an input to a deterministic comparison function. The user's typed text remains the primary data source until explicitly confirmed. If the AI hallucinates a completely wrong CPF, the deterministic engine will simply flag a mismatch with the user's typed CPF, forcing human review.

## 5. Deployment & CI/CD

The deployment strategy leverages the Google Cloud Ecosystem and automated CI/CD via GitHub Actions.

* **Infrastructure as Code (IaC):** Terraform will define all GCP resources (Cloud Run, Cloud SQL, Pub/Sub, Storage, Document AI configurations).
* **CI/CD Pipeline (GitHub Actions):**
  - **Pull Requests:**
    - Linting (ESLint, Prettier).
    - Type Checking (TypeScript `tsc`).
    - Unit & Integration Tests (Jest/Vitest).
    - Ephemeral Preview Environments (optional, via Cloud Run).
  - **Merge to Main (Continuous Deployment):**
    - Build Docker containers for Frontend and Backend.
    - Push images to Google Artifact Registry.
    - Deploy to **Google Cloud Run** (fully managed serverless execution environment, ideal for scalable stateless containers).
    - Run automated E2E tests (Playwright) against the staging environment.
    - Promote to Production (either manual gate or fully automated depending on confidence).
* **Monitoring & Observability:** Google Cloud Operations Suite (formerly Stackdriver) for logging, tracing, and alerting. Every validation mismatch should be logged and tracked to continuously improve the OCR prompt/model (Data Flywheel).
