/**
 * Timeout Wrapper Utility
 * Wrap any promise with a timeout to prevent infinite hangs
 */

/**
 * Wrap a promise with a timeout
 * @throws Error if timeout exceeded
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string = 'Operation timeout'
): Promise<T> {
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${message} (after ${ms / 1000}s)`));
        }, ms);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId!);
        return result;
    } catch (error) {
        clearTimeout(timeoutId!);
        throw error;
    }
}

// Common timeout values
export const TIMEOUTS = {
    FIRESTORE_READ: 30_000,        // 30 seconds
    FIRESTORE_WRITE: 30_000,       // 30 seconds
    GEMINI_GENERATE: 5 * 60_000,   // 5 minutes
    GEMINI_UPLOAD: 30 * 60_000,    // 30 minutes
    GEMINI_PROCESSING: 2 * 60 * 60_000, // 2 hours
    VIDEO_INTEL: 30 * 60_000,      // 30 minutes
    GCS_DOWNLOAD: 30 * 60_000,     // 30 minutes
    SHOT_ENRICHMENT: 30_000,       // 30 seconds per shot
    BATCH_ENRICHMENT: 3 * 60_000,  // 3 minutes per batch
} as const;
