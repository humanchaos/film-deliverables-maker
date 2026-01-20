/**
 * Storage Service
 * Google Cloud Storage operations
 */

import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';
import { config } from '../config/env.js';

const storage = new Storage();
const bucket = storage.bucket(config.storageBucket);

/**
 * Generate a signed URL for uploading a file
 */
export async function getUploadUrl(
    fileName: string,
    mimeType: string
): Promise<{ uploadUrl: string; gcsUri: string }> {
    const timestamp = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `uploads/${timestamp}_${safeName}`;

    const file = bucket.file(filePath);

    const options: GetSignedUrlConfig = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
        contentType: mimeType,
    };

    const [uploadUrl] = await file.getSignedUrl(options);

    return {
        uploadUrl,
        gcsUri: `gs://${config.storageBucket}/${filePath}`,
    };
}

/**
 * Download a file from GCS to a local path
 */
export async function downloadFile(gcsUri: string, destPath: string): Promise<void> {
    const { bucket: bucketName, path: filePath } = parseGcsUri(gcsUri);

    await storage
        .bucket(bucketName)
        .file(filePath)
        .download({ destination: destPath });
}

/**
 * Get file metadata
 */
export async function getFileMetadata(gcsUri: string): Promise<{
    size: number;
    contentType: string;
    created: Date;
}> {
    const { bucket: bucketName, path: filePath } = parseGcsUri(gcsUri);

    const [metadata] = await storage
        .bucket(bucketName)
        .file(filePath)
        .getMetadata();

    return {
        size: parseInt(metadata.size as string, 10),
        contentType: metadata.contentType || 'application/octet-stream',
        created: new Date(metadata.timeCreated as string),
    };
}

/**
 * Delete a file from GCS
 */
export async function deleteFile(gcsUri: string): Promise<void> {
    const { bucket: bucketName, path: filePath } = parseGcsUri(gcsUri);

    await storage
        .bucket(bucketName)
        .file(filePath)
        .delete({ ignoreNotFound: true });
}

/**
 * Parse a gs:// URI into bucket and path
 */
function parseGcsUri(gcsUri: string): { bucket: string; path: string } {
    const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) {
        throw new Error(`Invalid GCS URI: ${gcsUri}`);
    }
    return { bucket: match[1], path: match[2] };
}
