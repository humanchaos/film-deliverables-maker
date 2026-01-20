/**
 * GCS Cleanup Utility
 * 
 * Provides functions to delete uploaded files from Google Cloud Storage
 * after analysis is complete to prevent storage cost accumulation.
 * 
 * P0 Fix from Hostile Audit: Videos were persisting indefinitely in GCS.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export interface CleanupResult {
    success: boolean;
    deletedUri?: string;
    error?: string;
}

/**
 * Request backend to delete a file from GCS bucket.
 * 
 * @param gcsUri - The gs:// URI of the file to delete (e.g., gs://bucket-name/path/to/file.mp4)
 * @param accessToken - Optional OAuth token for authentication
 * @returns Promise<CleanupResult>
 */
export async function deleteFileFromGCS(
    gcsUri: string,
    accessToken?: string
): Promise<CleanupResult> {
    if (!gcsUri || !gcsUri.startsWith('gs://')) {
        return {
            success: false,
            error: 'Invalid GCS URI format. Expected gs://bucket/path'
        };
    }

    try {
        const response = await fetch(`${API_URL}/api/cleanup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {})
            },
            body: JSON.stringify({ gcsUri })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`[GCS Cleanup] Failed to delete ${gcsUri}: ${response.status} ${errorText}`);
            return {
                success: false,
                deletedUri: gcsUri,
                error: `Cleanup failed: ${response.status}`
            };
        }

        console.log(`[GCS Cleanup] Successfully deleted: ${gcsUri}`);
        return {
            success: true,
            deletedUri: gcsUri
        };

    } catch (error: any) {
        console.error('[GCS Cleanup] Error:', error);
        return {
            success: false,
            deletedUri: gcsUri,
            error: error.message || 'Network error during cleanup'
        };
    }
}

/**
 * Schedule cleanup for a GCS file after a delay.
 * Useful for cleaning up after the user has finished viewing results.
 * 
 * @param gcsUri - The gs:// URI of the file to delete
 * @param delayMs - Delay in milliseconds before deletion (default: 30 minutes)
 * @param accessToken - Optional OAuth token
 */
export function scheduleCleanup(
    gcsUri: string,
    delayMs: number = 30 * 60 * 1000, // 30 minutes default
    accessToken?: string
): void {
    console.log(`[GCS Cleanup] Scheduled cleanup for ${gcsUri} in ${delayMs / 1000}s`);

    setTimeout(async () => {
        const result = await deleteFileFromGCS(gcsUri, accessToken);
        if (!result.success) {
            console.warn(`[GCS Cleanup] Scheduled cleanup failed for ${gcsUri}:`, result.error);
        }
    }, delayMs);
}

/**
 * Cleanup multiple GCS files at once.
 * 
 * @param gcsUris - Array of gs:// URIs to delete
 * @param accessToken - Optional OAuth token
 * @returns Promise<CleanupResult[]>
 */
export async function cleanupMultipleFiles(
    gcsUris: string[],
    accessToken?: string
): Promise<CleanupResult[]> {
    const results = await Promise.all(
        gcsUris.map(uri => deleteFileFromGCS(uri, accessToken))
    );

    const successCount = results.filter(r => r.success).length;
    console.log(`[GCS Cleanup] Batch cleanup: ${successCount}/${gcsUris.length} files deleted`);

    return results;
}

/**
 * Parse GCS URI into bucket and path components.
 * 
 * @param gcsUri - The gs:// URI (e.g., gs://my-bucket/path/to/file.mp4)
 * @returns { bucket: string, path: string } or null if invalid
 */
export function parseGcsUri(gcsUri: string): { bucket: string; path: string } | null {
    const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
    if (!match) return null;
    return {
        bucket: match[1],
        path: match[2]
    };
}

/**
 * Generate a cleanup reminder message for the user.
 * Can be shown after analysis completes.
 */
export function getCleanupReminderMessage(gcsUri: string): string {
    const parsed = parseGcsUri(gcsUri);
    if (!parsed) return '';

    return `💡 Tip: Your video is stored in cloud storage. It will be automatically cleaned up in 48 hours, or you can delete it manually from your GCS bucket "${parsed.bucket}".`;
}
