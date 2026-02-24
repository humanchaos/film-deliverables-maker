import { ERROR_IDS, UploadProgress } from '../types';

export interface GCSUploadOptions {
    file: File;
    bucketName: string;
    accessToken?: string;
    onProgress: (progress: UploadProgress) => void;
    signal?: AbortSignal;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

console.log("[Config Debug]", {
    NODE_ENV: import.meta.env.MODE,
    VITE_API_URL: import.meta.env.VITE_API_URL ? 'Defined' : 'Undefined',
    Constructed_API_URL: API_URL,
    Hostname: window.location.hostname
});

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Upload a file to GCS using a Backend-Signed URL.
 * Uses simple single PUT request (works reliably with signed URLs).
 * For files >500MB, consider using the Gemini File API instead.
 */
export async function uploadFileToGCS(options: GCSUploadOptions): Promise<string> {
    const { file, onProgress, signal } = options;

    try {
        // Phase 1: Get Signed Upload URL from Backend
        onProgress({
            phase: 'initializing',
            message: 'Requesting secure upload link...',
            percentage: 1,
            bytesUploaded: 0,
            totalBytes: file.size,
        });

        if (API_URL.includes('localhost') && !window.location.hostname.includes('localhost')) {
            console.error("CONFIGURATION ERROR: Deployed frontend is trying to reach localhost backend.");
            throw new Error(`Configuration Error: Backend URL not set. Please set VITE_API_URL in Vercel.`);
        }

        const urlResponse = await fetch(`${API_URL}/api/upload-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileName: file.name,
                mimeType: file.type || 'video/mp4',
                fileSize: file.size
            }),
            signal
        });

        if (!urlResponse.ok) {
            const errText = await urlResponse.text();
            throw new Error(`Failed to get upload URL: ${urlResponse.status} ${errText}`);
        }

        const { uploadUrl, gcsUri } = await urlResponse.json();
        console.log('[GCS Upload] Got signed URL, starting upload...', { fileSize: formatBytes(file.size) });

        // Phase 2: Simple Single PUT Upload using XMLHttpRequest for progress tracking
        // Set timeout based on file size (minimum 5 minutes, 1 minute per 10MB)
        const timeoutMinutes = Math.max(5, Math.ceil(file.size / (10 * 1024 * 1024)));
        const timeoutMs = timeoutMinutes * 60 * 1000;
        console.log(`[GCS Upload] Upload timeout set to ${timeoutMinutes} minutes for ${formatBytes(file.size)}`);

        await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            let lastProgressTime = Date.now();
            let lastBytesLoaded = 0;

            // Set timeout for the entire upload
            xhr.timeout = timeoutMs;

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const now = Date.now();
                    const timeDelta = (now - lastProgressTime) / 1000;
                    const bytesDelta = event.loaded - lastBytesLoaded;
                    const speedMBps = timeDelta > 0 ? (bytesDelta / (1024 * 1024)) / timeDelta : 0;

                    lastProgressTime = now;
                    lastBytesLoaded = event.loaded;

                    const percent = Math.round((event.loaded / event.total) * 98) + 1;
                    const remainingBytes = event.total - event.loaded;
                    const etaSeconds = speedMBps > 0 ? remainingBytes / (speedMBps * 1024 * 1024) : 0;
                    const etaStr = etaSeconds > 60 ? `${Math.round(etaSeconds / 60)}m` : `${Math.round(etaSeconds)}s`;

                    onProgress({
                        phase: 'uploading',
                        message: `Uploading: ${formatBytes(event.loaded)} / ${formatBytes(event.total)} (${speedMBps.toFixed(1)} MB/s, ~${etaStr} left)`,
                        percentage: percent,
                        bytesUploaded: event.loaded,
                        totalBytes: event.total,
                    });
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    console.log('[GCS Upload] Upload completed successfully');
                    resolve();
                } else {
                    console.error('[GCS Upload] Upload failed:', xhr.status, xhr.responseText);
                    reject(new Error(`GCS Upload Failed: ${xhr.status} ${xhr.responseText}`));
                }
            };

            xhr.onerror = () => {
                console.error('[GCS Upload] Network error');
                reject(new Error('Network error during upload. Please check your internet connection and try again.'));
            };

            xhr.ontimeout = () => {
                console.error('[GCS Upload] Upload timed out after', timeoutMinutes, 'minutes');
                reject(new Error(`Upload timed out after ${timeoutMinutes} minutes. Try a smaller file or check your connection.`));
            };

            xhr.onabort = () => {
                reject(new Error(ERROR_IDS.OPERATION_CANCELLED));
            };

            if (signal) {
                signal.addEventListener('abort', () => xhr.abort(), { once: true });
            }

            xhr.open('PUT', uploadUrl, true);
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            xhr.send(file);
        });

        // Phase 3: Complete
        onProgress({
            phase: 'processing',
            message: 'Upload complete. Processing...',
            percentage: 100,
            bytesUploaded: file.size,
            totalBytes: file.size,
        });

        return gcsUri;

    } catch (error: any) {
        console.error('GCS Upload Failed:', error);
        if (signal?.aborted || error.message === ERROR_IDS.OPERATION_CANCELLED) {
            throw new Error(ERROR_IDS.OPERATION_CANCELLED);
        }
        throw new Error(`Failed to upload video: ${error.message}`);
    }
}
