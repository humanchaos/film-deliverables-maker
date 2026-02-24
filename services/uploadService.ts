/**
 * Robust Large File Upload Service for Gemini API
 * 
 * Handles multi-gigabyte video uploads using:
 * - Resumable upload protocol (chunked uploads)
 * - Web Worker offloading (keeps UI responsive)
 * - Progress tracking with accurate byte counts
 * - Automatic retry with exponential backoff
 * - Cancellation support
 */

import { ERROR_IDS, UploadProgress } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Backend proxy base URL — API key stays on the server
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const GEMINI_UPLOAD_BASE_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files';

// Chunk size must be multiple of 256KB (262144 bytes)
// 8MB chunks balance between progress granularity and request overhead
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface UploadResult {
  fileUri: string;
  fileName: string;
  mimeType: string;
  state: string;
}

export interface UploadOptions {
  file: File;
  onProgress: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const UPLOAD_CACHE_PREFIX = 'gemini_completed_upload_';
const UPLOAD_CACHE_TTL_MS = 47 * 60 * 60 * 1000; // 47 hours (Gemini files expire in 48h)

export function getStoredUploadUri(file: File): string | null {
  const key = `${UPLOAD_CACHE_PREFIX}${file.name}_${file.size}_${file.lastModified}`;
  const cached = localStorage.getItem(key);

  if (!cached) return null;

  try {
    const { uri, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;

    if (age > UPLOAD_CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return uri;
  } catch (e) {
    localStorage.removeItem(key);
    return null;
  }
}

export function storeUploadUri(file: File, uri: string) {
  const key = `${UPLOAD_CACHE_PREFIX}${file.name}_${file.size}_${file.lastModified}`;
  localStorage.setItem(key, JSON.stringify({
    uri,
    timestamp: Date.now()
  }));
}
export interface CachedUpload {
  name: string;
  uri: string;
  timestamp: number;
  size: number;
}

export function getAllCachedUploads(): CachedUpload[] {
  const uploads: CachedUpload[] = [];

  if (typeof localStorage === 'undefined') return [];

  // Iterate over all keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(UPLOAD_CACHE_PREFIX)) {
      try {
        const json = localStorage.getItem(key);
        if (json) {
          const data = JSON.parse(json);
          // Parse info from key: gemini_completed_upload_NAME_SIZE_DATE
          const parts = key.replace(UPLOAD_CACHE_PREFIX, '').split('_');

          // Reconstruct name (might have been split by underscores effectively, so we need to be careful)
          // Actually, since we don't control the name format, it is safer to store the name in the value.
          // But looking at storeUploadUri, we only store { uri, timestamp }.
          // So we have to rely on parsing the key.
          // Last two parts are size and timestamp.
          const lastModified = parseInt(parts.pop() || '0');
          const size = parseInt(parts.pop() || '0');
          const name = parts.join('_');

          if (Date.now() - data.timestamp < UPLOAD_CACHE_TTL_MS) {
            uploads.push({
              name,
              uri: data.uri,
              timestamp: data.timestamp,
              size
            });
          }
        }
      } catch (e) {
        // Ignore malformed
      }
    }
  }

  return uploads.sort((a, b) => b.timestamp - a.timestamp);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESUMABLE UPLOAD IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Step 1: Initialize resumable upload session via backend proxy
 * The backend calls Gemini with the API key and returns the upload URL.
 * The upload URL itself does NOT contain the API key.
 */
async function initializeResumableUpload(
  file: File,
  signal?: AbortSignal
): Promise<string> {
  const storageKey = `gemini_upload_session_${file.name}_${file.size}_${file.lastModified}`;
  const cachedUrl = localStorage.getItem(storageKey);

  if (cachedUrl) {
    console.log("Found cached upload session:", cachedUrl);
    try {
      const isValid = await checkSessionValidity(cachedUrl, signal);
      if (isValid) {
        console.log("Cached session is valid. Resuming.");
        return cachedUrl;
      }
      console.warn("Cached session is invalid or expired. Discarding.");
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.warn("Error checking cached session validity. Discarding.", e);
      localStorage.removeItem(storageKey);
    }
  }

  // Initialize via backend proxy — API key stays on the server
  const response = await fetch(`${API_BASE}/api/gemini-upload/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Failed to initialize upload: ${error.error || response.status}`);
  }

  const { uploadUrl } = await response.json();
  if (!uploadUrl) {
    throw new Error('No upload URL returned from server');
  }

  localStorage.setItem(storageKey, uploadUrl);
  return uploadUrl;
}

/**
 * Helper to check if a resumable session URL is still valid
 */
async function checkSessionValidity(uploadUrl: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'query',
        'Content-Type': 'application/json',
      },
      signal
    });

    // 200 OK means active or finalized. Both are "valid" enough to proceed (finalized will just finish immediately)
    // 404/410 means gone.
    // 400 might be legitimate error, but usually implies protocol mismatch.
    return response.ok;
  } catch (e) {
    // Network errors (DNS, etc) should count as "Invalid" so we try to get a new one.
    return false;
  }
}

/**
 * Clean up resume cache after success
 */
function clearResumableSession(file: File) {
  const storageKey = `gemini_upload_session_${file.name}_${file.size}_${file.lastModified}`;
  localStorage.removeItem(storageKey);
}

/**
 * Query the server for the current upload offset
 * This is crucial for resuming uploads after a browser reload or crash
 */
async function queryUploadStatus(uploadUrl: string, file: File, signal?: AbortSignal): Promise<number> {
  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'query',
        'Content-Type': 'application/json', // Sometimes required even if body is empty
      },
      signal
    });

    if (!response.ok) {
      if (response.status === 404 || response.status === 410) {
        // Session expired or invalid - Throwing here allows the strict retry loop to handle "Session Dead"
        throw new Error("Upload session expired");
      }
      // Other errors might be temporary?
      const text = await response.text();
      console.warn(`Failed to query upload status: ${response.status} ${text}`);
      return 0; // Fallback to 0 if unsure, but usually safer to assume 0
    }

    const offsetHeader = response.headers.get('X-Goog-Upload-Status'); // Sometimes 'active' or 'final'
    const sizeHeader = response.headers.get('X-Goog-Upload-Size-Received');

    if (sizeHeader) {
      return parseInt(sizeHeader, 10);
    }

    return 0;
  } catch (e) {
    // If it's a network error, we should probably re-throw so we don't assume 0 and corrupt state
    // But for "offline" persistence, maybe 0 is ok?
    // Actually, if we can't reach server, we can't upload.
    console.warn("Error querying upload status:", e);
    throw e;
  }
}

async function uploadChunks(
  uploadUrl: string,
  file: File,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal
): Promise<UploadResult> {
  const totalBytes = file.size;
  const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);

  // Checking actual server status to resume correctly
  // If this throws (network error), we bubble up.
  let bytesUploaded = await queryUploadStatus(uploadUrl, file, signal);

  if (bytesUploaded > 0) {
    const startChunkIndex = Math.floor(bytesUploaded / CHUNK_SIZE);
    console.log(`Resuming upload from server offset: ${formatBytes(bytesUploaded)} (${startChunkIndex}/${totalChunks} chunks skipped)`);
    onProgress({
      phase: 'uploading',
      message: `Resuming upload from ${formatBytes(bytesUploaded)}...`,
      percentage: Math.round((bytesUploaded / totalBytes) * 80),
      bytesUploaded,
      totalBytes,
      currentChunk: startChunkIndex,
      totalChunks,
    });
  }

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    if (signal?.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

    const chunkStart = chunkIndex * CHUNK_SIZE;
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, totalBytes);

    // If this chunk is already fully uploaded, skip it
    if (chunkEnd <= bytesUploaded) {
      continue;
    }

    // Determine upload alignment
    const uploadOffset = Math.max(chunkStart, bytesUploaded);
    if (uploadOffset >= chunkEnd) continue;

    const chunkSize = chunkEnd - uploadOffset;
    const isLastChunk = chunkIndex === totalChunks - 1;

    // Read chunk from file
    const chunk = file.slice(uploadOffset, chunkEnd);
    const chunkBuffer = await chunk.arrayBuffer();

    // Retry logic for each chunk
    let lastError: Error | null = null;
    for (let retry = 0; retry <= MAX_RETRIES; retry++) {
      try {
        const command = isLastChunk ? 'upload, finalize' : 'upload';

        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Command': command,
            'X-Goog-Upload-Offset': uploadOffset.toString(),
            'Content-Length': chunkSize.toString(),
            'Content-Type': 'application/octet-stream',
          },
          body: chunkBuffer,
          signal,
        });

        if (!response.ok) {
          const errorText = await response.text();

          // SPECIAL HANDLING: Offset Mismatch (400)
          if (response.status === 400 && errorText.includes('offset')) {
            console.warn(`Offset mismatch error: ${errorText}. Updating offset and retrying...`);
            // Query status to get the TRUTH
            const newOffset = await queryUploadStatus(uploadUrl, file, signal);
            if (newOffset !== bytesUploaded) {
              bytesUploaded = newOffset;
              chunkIndex--; // Decrement to re-eval outer loop
              break; // Break retry loop
            }
          }

          // SPECIAL HANDLING: Gone/Not Found (410/404) -> Session Died
          if (response.status === 404 || response.status === 410) {
            throw new Error("Upload session expired during upload");
          }

          throw new Error(`Chunk upload failed: ${response.status} - ${errorText}`);
        }

        // Success - update global bytesUploaded tracker to the END of this chunk
        bytesUploaded = chunkEnd;

        // Update progress
        const percentage = Math.round((bytesUploaded / totalBytes) * 80); // Reserve 20% for processing
        onProgress({
          phase: 'uploading',
          message: `Uploading ${formatBytes(bytesUploaded)} of ${formatBytes(totalBytes)}...`,
          percentage,
          bytesUploaded,
          totalBytes,
          currentChunk: chunkIndex + 1,
          totalChunks,
        });

        // If this is the last chunk, parse the response for file info
        if (isLastChunk) {
          const result = await response.json();
          return {
            fileUri: result.file?.uri || result.uri,
            fileName: result.file?.name || result.name,
            mimeType: result.file?.mimeType || file.type,
            state: result.file?.state || 'PROCESSING',
          };
        }

        break; // Success, move to next chunk
      } catch (error) {
        lastError = error as Error;

        if (signal?.aborted) {
          throw new Error(ERROR_IDS.OPERATION_CANCELLED);
        }

        // Pass through fatal session errors without retry
        if (lastError.message === "Upload session expired during upload") {
          throw lastError;
        }

        if (retry < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retry);
          console.warn(`Chunk ${chunkIndex + 1} failed, retrying in ${delay}ms...`, error);
          onProgress({
            phase: 'uploading',
            message: `Retrying chunk ${chunkIndex + 1}/${totalChunks}...`,
            percentage: Math.round((bytesUploaded / totalBytes) * 80),
            bytesUploaded,
            totalBytes,
            currentChunk: chunkIndex + 1,
            totalChunks,
          });
          await sleep(delay);
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  throw new Error('Upload completed without finalization response');
}

/**
 * Step 3: Poll for file processing completion via backend proxy
 * The backend checks the Gemini file status using the server-side API key.
 */
async function waitForProcessing(
  fileName: string,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  const funMessages = [
    "Time to grab a coffee ☕",
    "Perfect time for a bathroom break 🚽",
    "Call that person you've been avoiding 📞",
    "Clear out those delayed emails 📧",
    "Time to chat with a colleague 🗣️",
    "Time to water the plants 🪴",
    "Stretch your legs for a moment 🧘",
  ];

  const randomMessage = funMessages[Math.floor(Math.random() * funMessages.length)];
  const messagePrefix = "Processing video: ";

  let pollCount = 0;
  const maxPolls = 900;

  while (pollCount < maxPolls) {
    if (signal?.aborted) {
      throw new Error(ERROR_IDS.OPERATION_CANCELLED);
    }

    // Poll via backend proxy — API key stays on the server
    const response = await fetch(
      `${API_BASE}/api/gemini-upload/status?fileName=${encodeURIComponent(fileName)}`,
      { signal }
    );

    if (!response.ok) {
      throw new Error(`Failed to check file status: ${response.status}`);
    }

    const fileInfo = await response.json();

    if (fileInfo.state === 'ACTIVE') {
      return fileInfo.uri;
    }

    if (fileInfo.state === 'FAILED') {
      throw new Error('File processing failed on Gemini server');
    }

    const message = `${messagePrefix}${randomMessage}`;
    onProgress({
      phase: 'processing',
      message,
      percentage: 80 + Math.min(pollCount / 2, 19),
      bytesUploaded: 0,
      totalBytes: 0,
    });

    pollCount++;
    await sleep(1000);
  }

  throw new Error('File processing timed out');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Upload a large file to Gemini using resumable upload protocol
 * 
 * Includes SESSION RECOVERY:
 * If a resumable upload fails in a way that suggests the session is dead (404/410/Gone),
 * we automatically clear the cache and start a fresh session (once).
 */
export async function uploadLargeFileToGemini(options: UploadOptions): Promise<string> {
  const { apiKey, file, onProgress, signal } = options;
  const ATTEMPTS = 2; // 1 normal + 1 recovery

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const isRecovery = attempt > 1;

      // Phase 1: Initialize (or Resume)
      onProgress({
        phase: 'initializing',
        message: isRecovery ? 'Previous session expired. Starting fresh...' : 'Initializing secure upload...',
        percentage: 2,
        bytesUploaded: 0,
        totalBytes: file.size,
      });

      const uploadUrl = await initializeResumableUpload(file, signal);

      // Phase 2: Upload chunks
      onProgress({
        phase: 'uploading',
        message: 'Starting chunked upload...',
        percentage: 5,
        bytesUploaded: 0,
        totalBytes: file.size,
        currentChunk: 0,
        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
      });

      const uploadResult = await uploadChunks(uploadUrl, file, onProgress, signal);

      // Phase 3: Wait for processing (if needed)
      // If we reach here, upload itself was successful.
      if (uploadResult.state === 'PROCESSING') {
        const finalUri = await waitForProcessing(uploadResult.fileName, onProgress, signal);

        onProgress({
          phase: 'complete',
          message: 'Upload complete. Ready for analysis.',
          percentage: 100,
          bytesUploaded: file.size,
          totalBytes: file.size,
        });

        clearResumableSession(file); // Clean up
        // storeUploadUri removed - cached uploads feature disabled
        return finalUri;
      }

      // Success without processing wait (Already Active)
      clearResumableSession(file);
      // storeUploadUri removed - cached uploads feature disabled

      onProgress({
        phase: 'complete',
        message: 'Upload complete. Ready for analysis.',
        percentage: 100,
        bytesUploaded: file.size,
        totalBytes: file.size,
      });

      return uploadResult.fileUri;

    } catch (error) {
      console.error(`Large file upload attempt ${attempt} failed:`, error);

      // Check if we should recover
      const isSessionError = error instanceof Error &&
        (error.message.includes("Upload session expired") ||
          error.message.includes("404") ||
          error.message.includes("410"));

      // If it's a fatal session error, AND we haven't tried recovering yet...
      if (isSessionError && attempt < ATTEMPTS) {
        console.warn("Detected expired/invalid session. Clearing cache and retrying from scratch...");
        clearResumableSession(file);
        // Loop will continue to attempt 2
        continue;
      }

      // Otherwise (or if updated failed again), we fail for real.
      onProgress({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Upload failed',
        percentage: 0,
        bytesUploaded: 0,
        totalBytes: file.size,
      });

      if (error instanceof Error && (error.message === ERROR_IDS.OPERATION_CANCELLED || error.name === 'AbortError')) {
        throw error;
      }

      throw new Error(ERROR_IDS.UPLOAD_FAIL);
    }
  }

  throw new Error("Upload failed after recovery attempt.");
}

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK: Simple upload for small files (< 20MB)
// ═══════════════════════════════════════════════════════════════════════════════

const SIMPLE_UPLOAD_THRESHOLD = 20 * 1024 * 1024; // 20MB

/**
 * Smart upload that chooses the best method based on file size
 * - Small files (< 20MB): Use simple multipart upload (faster)
 * - Large files (>= 20MB): Use resumable chunked upload (reliable)
 */
export async function smartUploadToGemini(options: UploadOptions): Promise<string> {
  const { file } = options;

  if (file.size < SIMPLE_UPLOAD_THRESHOLD) {
    // Use the original simple upload for small files
    return uploadSmallFile(options);
  }

  // Use chunked resumable upload for large files
  return uploadLargeFileToGemini(options);
}

async function uploadSmallFile(options: UploadOptions): Promise<string> {
  const { apiKey, file, onProgress, signal } = options;

  onProgress({
    phase: 'uploading',
    message: 'Uploading file...',
    percentage: 10,
    bytesUploaded: 0,
    totalBytes: file.size,
  });

  // Simple multipart upload for small files
  const url = `${GEMINI_UPLOAD_BASE_URL}?key=${apiKey}`;

  const formData = new FormData();
  formData.append('metadata', JSON.stringify({
    file: { display_name: file.name }
  }));
  formData.append('file', file);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  const result = await response.json();
  const fileName = result.file?.name || result.name;

  onProgress({
    phase: 'processing',
    message: 'Processing file...',
    percentage: 80,
    bytesUploaded: file.size,
    totalBytes: file.size,
  });

  // Wait for processing
  const finalUri = await waitForProcessing(fileName, onProgress, signal);

  onProgress({
    phase: 'complete',
    message: 'Upload complete.',
    percentage: 100,
    bytesUploaded: file.size,
    totalBytes: file.size,
  });

  // storeUploadUri removed - cached uploads feature disabled
  return finalUri;
}

/**
 * Legacy alias for App.tsx compatibility
 * Wraps smartUploadToGemini with the old callback signature
 */
export async function uploadFileToGemini(
  file: File,
  onProgress: (message: string, percentage: number) => void,
  signal?: AbortSignal
): Promise<string> {
  return smartUploadToGemini({
    file,
    onProgress: (p) => onProgress(p.message, p.percentage),
    signal
  });
}
