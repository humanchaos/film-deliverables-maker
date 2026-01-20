import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// On Cloud Run, this uses the Service Account automatically.
// Locally, it looks for GOOGLE_APPLICATION_CREDENTIALS.
if (!admin.apps.length) {
    try {
        admin.initializeApp();
        console.log('Firebase Admin initialized successfully');
    } catch (error) {
        console.error('Firebase Admin initialization failed:', error);
    }
}

export const db = admin.firestore();
