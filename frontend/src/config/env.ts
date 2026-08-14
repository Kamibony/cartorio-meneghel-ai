const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "cartorio-meneghel-ai";

export const ENV = {
  get isDev() {
    return import.meta.env.DEV;
  },
  get isProd() {
    return import.meta.env.PROD;
  },
  get apiUrl() {
    const configuredUrl = import.meta.env.VITE_API_URL || '/api';

    // Strict isolation: if we are in production and a localhost URL is provided, fail fast.
    if (this.isProd && (configuredUrl.includes('127.0.0.1') || configuredUrl.includes('localhost'))) {
      throw new Error("CRITICAL: Emulator/localhost API URL detected in production build. Please configure a valid production VITE_API_URL.");
    }

    return configuredUrl;
  },
  get extractApiUrl() {
    const configuredExtractUrl = import.meta.env.VITE_EXTRACT_API_URL;
    if (configuredExtractUrl) {
      return configuredExtractUrl;
    }
    // Fallback to apiUrl if not specifically provided (e.g., local dev or if using standard hosting rewrite)
    return this.apiUrl;
  },
  get generateApiUrl() {
    const configuredGenerateUrl = import.meta.env.VITE_GENERATE_API_URL;
    if (configuredGenerateUrl) {
      return configuredGenerateUrl;
    }
    return this.apiUrl;
  },
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "mock-key",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId: projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "mock-sender-id",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "mock-app-id",
  }
};
