import { initializeApp } from 'firebase/app';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { ENV } from '../config/env';

export const app = initializeApp(ENV.firebase);
export const storage = getStorage(app);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Strict emulator isolation pattern
if (ENV.isDev) {
    const configuredUrl = import.meta.env.VITE_API_URL || '';
    if (configuredUrl.includes('127.0.0.1') || configuredUrl.includes('localhost')) {
        // Extract host for emulator connection
        const host = configuredUrl.includes('127.0.0.1') ? '127.0.0.1' : 'localhost';

        console.info(`[Dev Mode] Connecting to Firebase Emulators on ${host}...`);

        // Connect emulators
        connectStorageEmulator(storage, host, 9199);
        connectFirestoreEmulator(db, host, 8080);
        connectAuthEmulator(auth, `http://${host}:9099`);
    }
}
