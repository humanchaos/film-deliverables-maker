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
    db.settings({ ignoreUndefinedProperties: true });  // Prevent undefined value errors
    console.log('[Firebase] Initialized with ignoreUndefinedProperties');
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
