/**
 * API Service
 * 
 * The ONLY way the frontend communicates with the backend.
 * No Gemini calls here - that's the backend's job.
 */

import type { Job, CreateJobRequest, CreateJobResponse, UploadUrlResponse } from '../types_v2';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Debug: Log API configuration on load
console.log('[API] V2 API Service initialized');
console.log('[API] Base URL:', API_BASE);
console.log('[API] Environment:', import.meta.env.MODE);

/**
 * API Error with status code
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Get a signed URL for uploading a file to GCS
 */
export async function getUploadUrl(
  fileName: string,
  mimeType: string,
  fileSize: number
): Promise<UploadUrlResponse> {
  const response = await fetch(`${API_BASE}/api/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, mimeType, fileSize }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(error.error || 'Failed to get upload URL', response.status);
  }

  return response.json();
}

/**
 * Upload a file to GCS using a signed URL
 */
export async function uploadFile(
  file: File,
  uploadUrl: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes for large files

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Timeout for stalled uploads
    const timeoutId = setTimeout(() => {
      xhr.abort();
      reject(new ApiError('Upload timeout - please try again', 408));
    }, UPLOAD_TIMEOUT_MS);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress((event.loaded / event.total) * 100);
      }
    });

    xhr.addEventListener('load', () => {
      clearTimeout(timeoutId);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new ApiError('Upload failed', xhr.status));
      }
    });

    xhr.addEventListener('error', () => {
      clearTimeout(timeoutId);
      reject(new ApiError('Network error during upload', 0));
    });

    xhr.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      // Don't reject here - timeout handler already did
    });

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/**
 * Create a new analysis job
 */
export async function createJob(request: CreateJobRequest): Promise<CreateJobResponse> {
  const response = await fetch(`${API_BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(error.error || 'Failed to create job', response.status);
  }

  return response.json();
}

/**
 * Get job status and results
 */
export async function getJob(jobId: string): Promise<Job> {
  const url = `${API_BASE}/api/jobs/${jobId}`;
  console.log(`[API] GET ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    console.log(`[API] Response status: ${response.status}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new ApiError('Job not found', 404, 'JOB_NOT_FOUND');
      }
      const error = await response.json().catch(() => ({}));
      console.error(`[API] Error response:`, error);
      throw new ApiError(error.error || 'Failed to fetch job', response.status);
    }

    const data = await response.json();
    console.log(`[API] Job status: ${data?.status}, progress: ${data?.progress?.overall}%`);
    return data;
  } catch (err) {
    console.error(`[API] Fetch error:`, err);
    throw err;
  }
}

/**
 * Cancel/delete a job
 */
export async function deleteJob(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/jobs/${jobId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(error.error || 'Failed to delete job', response.status);
  }
}

/**
 * Combined upload + create job helper
 */
export async function uploadAndCreateJob(
  file: File,
  duration: number,
  analysisConfig?: Partial<CreateJobRequest['analysisConfig']>,
  onProgress?: (stage: string, progress: number) => void,
  geminiFileUri?: string // NEW: Pass frontend's Gemini URI to avoid re-upload
): Promise<string> {
  // 1. Get upload URL
  onProgress?.('Getting upload URL...', 0);
  const { uploadUrl, gcsUri } = await getUploadUrl(file.name, file.type, file.size);

  // 2. Upload file
  onProgress?.('Uploading video...', 5);
  await uploadFile(file, uploadUrl, (progress) => {
    onProgress?.('Uploading video...', 5 + progress * 0.4); // 5-45%
  });

  // 3. Create job
  onProgress?.('Starting analysis...', 50);
  console.log(`[API] Creating job with geminiFileUri: ${geminiFileUri ? 'provided' : 'not provided'}`);
  const { id } = await createJob({
    gcsUri,
    mimeType: file.type,
    duration,
    fileName: file.name,
    geminiFileUri, // Pass through to backend
    analysisConfig,
  });

  return id;
}
