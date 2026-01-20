/**
 * Firebase Service
 * Firestore client for job storage
 */

import * as admin from 'firebase-admin';
import { config } from '../config/env.js';

let db: admin.firestore.Firestore;

/**
 * Initialize Firebase Admin SDK
 */
export function initFirebase(): void {
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: config.gcpProject,
        });
    }

    db = admin.firestore();
    console.log('[Firebase] Initialized');
}

/**
 * Get Firestore database instance
 */
export function getDb(): admin.firestore.Firestore {
    if (!db) {
        throw new Error('Firebase not initialized. Call initFirebase() first.');
    }
    return db;
}

/**
 * Re-export Timestamp for convenience
 */
export const Timestamp = admin.firestore.Timestamp;
