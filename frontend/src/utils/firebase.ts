import { initializeApp } from 'firebase/app';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { ENV } from '../config/env';

export const app = initializeApp(ENV.firebase);
export const storage = getStorage(app);

// Strict emulator isolation pattern
if (ENV.isDev) {
    const configuredUrl = import.meta.env.VITE_API_URL || '';
    if (configuredUrl.includes('127.0.0.1') || configuredUrl.includes('localhost')) {
        // Extract host for emulator connection
        const host = configuredUrl.includes('127.0.0.1') ? '127.0.0.1' : 'localhost';

        console.info(`[Dev Mode] Connecting to Firebase Emulators on ${host}...`);

        // Connect storage emulator.
        // Default Storage Emulator port is 9199.
        connectStorageEmulator(storage, host, 9199);

        // If Firestore or Auth emulators are added in the future, connect them here.
    }
}
