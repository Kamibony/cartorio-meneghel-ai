const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "cartorio-meneghel-ai";

export const ENV = {
  get isDev() {
    return import.meta.env.DEV;
  },
  get isProd() {
    return import.meta.env.PROD;
  },
  get apiUrl() {
    const configuredUrl = import.meta.env.VITE_API_URL || '';

    // Strict isolation: if we are in production and a localhost URL is provided, fail fast.
    if (this.isProd && (configuredUrl.includes('127.0.0.1') || configuredUrl.includes('localhost'))) {
      throw new Error("CRITICAL: Emulator/localhost API URL detected in production build. Please configure a valid production VITE_API_URL.");
    }

    return configuredUrl;
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
