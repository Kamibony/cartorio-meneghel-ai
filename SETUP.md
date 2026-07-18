# Project Setup and Configuration

This document outlines the required environment variables and secrets for running the project locally and deploying it via CI/CD.

## Local Development

### Frontend (`frontend/.env`)
To run the frontend locally and have it correctly communicate with your backend, you must create an `.env` file in the `frontend` directory.

| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_API_URL` | The base URL for the backend API. When running the Firebase local emulator, this should point to your local functions endpoint. | `http://127.0.0.1:5001/your-project-id/us-central1` |

### Backend (`functions/.env`)
For local backend development (using the Firebase Emulator or running scripts), you can define environment variables in the `functions` directory.

| Variable | Description | Example |
| :--- | :--- | :--- |
| `CORS_ORIGINS` | A comma-separated list of allowed CORS origins, or `*` to allow all. Used to secure the Cloud Functions endpoints. | `http://localhost:5173,https://your-frontend-domain.com` |

## CI/CD Deployment (GitHub Actions)

To enable automated deployments via GitHub Actions (`.github/workflows/deploy.yml`), you must configure the following repository secrets in your GitHub repository settings (`Settings` > `Secrets and variables` > `Actions`):

| Secret Name | Description |
| :--- | :--- |
| `FIREBASE_PROJECT_ID` | Your actual Google Cloud / Firebase project ID. |
| `FIREBASE_SERVICE_ACCOUNT` | The JSON key for a Google Cloud Service Account with permissions to deploy to Firebase Hosting and Cloud Functions. |

> **Note:** The `GITHUB_TOKEN` is automatically provided by GitHub Actions.
