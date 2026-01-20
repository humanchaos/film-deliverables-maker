import { Storage } from '@google-cloud/storage';
import { db } from '../config/firebase'; // Using existing firestore instance
import { config } from '../config/env';

const storage = new Storage();

// Use env vars or defaults
const UPLOAD_BUCKET = process.env.VITE_GOOGLE_CLOUD_STORAGE_BUCKET || 'gemini-video-uploads';
const RESULTS_BUCKET = process.env.GCS_RESULTS_BUCKET || 'gemini-video-results';

export const storageService = {
    /**
     * Generates a signed URL so the frontend uploads directly to Google.
     */
    async generateUploadUrl(fileName: string, contentType: string) {
        // Sanitize filename to prevent issues
        const cleanName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueName = `uploads/${Date.now()}_${cleanName}`;
        const file = storage.bucket(UPLOAD_BUCKET).file(uniqueName);

        // V4 Signed URL
        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 60 * 60 * 1000, // 60 minutes
            contentType,
        });

        return {
            uploadUrl: url,
            gcsUri: `gs://${UPLOAD_BUCKET}/${uniqueName}`
        };
    },

    async generateResumableUploadUrl(fileName: string, contentType: string) {
        const cleanName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueName = `uploads/${Date.now()}_${cleanName}`;
        const file = storage.bucket(UPLOAD_BUCKET).file(uniqueName);

        const [url] = await file.createResumableUpload({
            origin: '*',
            metadata: { contentType }
        });

        return {
            uploadUrl: url,
            gcsUri: `gs://${UPLOAD_BUCKET}/${uniqueName}`
        };
    },

    /**
     * Saves large analysis results to GCS and writes a pointer to Firestore.
     */
    async saveLargeResult(jobId: string, module: string, data: any) {
        const fileName = `jobs/${jobId}/${module}.json`;
        const file = storage.bucket(RESULTS_BUCKET).file(fileName);

        // 1. Upload JSON to GCS
        await file.save(JSON.stringify(data), {
            contentType: 'application/json',
            resumable: false,
            metadata: { cacheControl: 'public, max-age=31536000' }
        });

        // 2. Generate a Read-Only Signed URL (Valid for 7 days)
        const [readUrl] = await file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });

        console.log(`[Storage] Offloaded ${module} for ${jobId} to GCS`);

        // Return the pointer data
        return {
            status: 'completed',
            url: readUrl, // Signed URL for frontend/backend immediate access
            gcsUri: `gs://${RESULTS_BUCKET}/${fileName}`, // Permanent reference
            updatedAt: new Date().toISOString(),
            isOffloaded: true // Flag to help hydration
        };
    }
};
