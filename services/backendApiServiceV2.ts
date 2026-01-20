/**
 * Backend API Service V2
 * 
 * Uses the clean v2 backend architecture:
 * - Upload via signed GCS URLs (not direct Gemini Files API)
 * - Sequential backend processing
 * - Simple polling
 */

import { JobDocument, FullAnalysisResult, UploadProgress } from '../types';

// V2 Backend URL - update this when deployed to Cloud Run
const API_BASE_URL = import.meta.env.VITE_API_URL_V2 || 'http://localhost:8080';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface UploadUrlResponse {
    uploadUrl: string;
    gcsUri: string;
}

interface CreateJobResponse {
    id: string;
    status: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Upload a file via the v2 backend (signed GCS URL)
 */
export async function uploadFileV2(
    file: File,
    onProgress: (progress: UploadProgress) => void,
    signal?: AbortSignal
): Promise<string> {
    // Step 1: Get signed upload URL from backend
    onProgress({
        phase: 'initializing',
        message: 'Preparing upload...',
        percentage: 5,
        bytesUploaded: 0,
        totalBytes: file.size,
    });

    const response = await fetch(`${API_BASE_URL}/api/upload-url`, {
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
        throw new Error(error.error || `Failed to get upload URL: ${response.status}`);
    }

    const { uploadUrl, gcsUri }: UploadUrlResponse = await response.json();

    // Step 2: Upload directly to GCS using signed URL
    onProgress({
        phase: 'uploading',
        message: 'Uploading to cloud storage...',
        percentage: 10,
        bytesUploaded: 0,
        totalBytes: file.size,
    });

    await uploadToGCS(file, uploadUrl, (progress) => {
        onProgress({
            phase: 'uploading',
            message: `Uploading: ${formatBytes(progress.loaded)} / ${formatBytes(file.size)}`,
            percentage: 10 + Math.round((progress.loaded / file.size) * 80),
            bytesUploaded: progress.loaded,
            totalBytes: file.size,
        });
    }, signal);

    onProgress({
        phase: 'complete',
        message: 'Upload complete',
        percentage: 90,
        bytesUploaded: file.size,
        totalBytes: file.size,
    });

    return gcsUri;
}

/**
 * Upload file to GCS using a signed URL with progress tracking
 */
async function uploadToGCS(
    file: File,
    uploadUrl: string,
    onProgress: (progress: { loaded: number; total: number }) => void,
    signal?: AbortSignal
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                onProgress({ loaded: event.loaded, total: event.total });
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`Upload failed: ${xhr.status}`));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('abort', () => {
            reject(new Error('Upload cancelled'));
        });

        if (signal) {
            signal.addEventListener('abort', () => {
                xhr.abort();
            });
        }

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// JOB API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new analysis job using v2 backend
 */
export async function createJobV2(
    gcsUri: string,
    mimeType: string,
    duration: number = 0
): Promise<string> {
    console.log(`[BackendV2] Creating job for ${gcsUri}`);

    const response = await fetch(`${API_BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            gcsUri,
            mimeType,
            duration,
            analysisConfig: {
                transcription: true,
                shotList: true,
                synopsis: true,
                fauna: true,
                graphics: true,
                cast: true,
            },
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Failed to create job: ${response.status}`);
    }

    const data: CreateJobResponse = await response.json();
    console.log(`[BackendV2] Job created: ${data.id}`);
    return data.id;
}

/**
 * Get job status and results
 */
export async function getJobV2(jobId: string): Promise<JobDocument> {
    const cacheBuster = `_t=${Date.now()}`;
    const url = `${API_BASE_URL}/api/jobs/${jobId}?${cacheBuster}`;

    const response = await fetch(url, {
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch job: ${response.status}`);
    }

    return response.json();
}

/**
 * Poll job until complete or failed
 */
export async function pollJobV2(
    jobId: string,
    onProgress: (status: string, percentage: number) => void,
    signal?: AbortSignal
): Promise<FullAnalysisResult> {
    let attempts = 0;
    const maxAttempts = 360; // 30 minutes at 5s intervals
    const delay = 5000;

    while (attempts < maxAttempts) {
        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }

        const job = await getJobV2(jobId);

        // Map v2 progress to v1 format
        const stage = job.progress?.currentModule || job.progress?.currentStage || 'Processing...';
        const percent = job.progress?.overall || 0;
        onProgress(stage, percent);

        if (job.status === 'completed') {
            if (!job.results) {
                throw new Error('Job completed but results are missing.');
            }
            return mapV2ResultsToFullAnalysis(job.results);
        }

        if (job.status === 'failed') {
            throw new Error(job.error?.message || 'Job failed during processing');
        }

        attempts++;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    throw new Error('Analysis timed out');
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULT MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map v2 backend results to frontend FullAnalysisResult format
 */
function mapV2ResultsToFullAnalysis(results: Record<string, unknown>): FullAnalysisResult {
    const v2 = results as any;

    // Get shots array safely - v2 backend returns { shots: [], totalShots: n }
    const shotsSource = v2.shotList?.shots || v2.shotList || [];
    const shotsArray = Array.isArray(shotsSource) ? shotsSource : [];

    return {
        shotList: shotsArray.map((s: any) => ({
            tcIn: s.tcIn || s.startTime || '00:00:00:00',
            tcOut: s.tcOut || s.endTime || '00:00:00:00',
            duration: s.duration || 0,
            description: s.description || '',
            action: s.action || '',
            audio: s.audio || '',
        })),

        transcription: {
            segments: v2.transcription?.segments?.map((seg: any) => ({
                startTime: seg.startTime,
                endTime: seg.endTime,
                speaker: seg.speaker,
                transcript: seg.text,
            })) || [],
            speakerMap: {},
            text: v2.transcription?.fullText || '',
        },

        graphics: {
            programTitle: v2.graphics?.programTitle || '',
            runtime: v2.graphics?.runtime || '',
            graphics: v2.graphics?.entries?.filter((e: any) => e.type !== 'lower_third').map((e: any) => ({
                description: e.content,
                timecodeIn: e.timecodeIn,
                timecodeOut: e.timecodeOut,
            })) || [],
            lowerThirds: v2.graphics?.entries?.filter((e: any) => e.type === 'lower_third').map((e: any) => ({
                text: e.content,
                timecodeIn: e.timecodeIn,
                timecodeOut: e.timecodeOut,
            })) || [],
        },

        synopsis: {
            title: v2.synopsis?.title || '',
            writtenBy: '',
            directedBy: '',
            oneLine: v2.synopsis?.logline || '',
            paragraph: v2.synopsis?.summary || '',
            fullSynopsis: v2.synopsis?.fullSynopsis || '',
            keyThemes: v2.synopsis?.themes || '',
            targetAudience: v2.synopsis?.targetAudience || '',
        },

        bio: v2.cast?.people?.map((p: any) => ({
            name: p.name,
            fullName: p.fullName || p.name,
            title: p.title,
            biography: p.biography,
            sources: p.sources,
        })) || [],

        fauna: v2.fauna?.sightings?.map((s: any) => ({
            id: s.id,
            commonName: s.commonName,
            latinName: s.latinName,
            germanName: s.localName,
            timecode: s.timecode,
            category: s.category,
            confidence: s.confidence,
            behavior: s.behavior,
            iucnStatus: s.iucnStatus,
        })) || [],
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETE UPLOAD + ANALYZE FLOW
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Complete flow: Upload file → Create job → Poll for results
 */
export async function uploadAndAnalyzeV2(
    file: File,
    duration: number,
    onProgress: (message: string, percentage: number) => void,
    signal?: AbortSignal
): Promise<FullAnalysisResult> {
    // Phase 1: Upload (0-50%)
    const gcsUri = await uploadFileV2(
        file,
        (p) => onProgress(p.message, Math.round(p.percentage * 0.5)),
        signal
    );

    // Phase 2: Create job (50%)
    onProgress('Starting analysis...', 50);
    const jobId = await createJobV2(gcsUri, file.type, duration);

    // Phase 3: Poll for results (50-100%)
    const results = await pollJobV2(
        jobId,
        (status, percent) => onProgress(status, 50 + Math.round(percent * 0.5)),
        signal
    );

    return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY COMPATIBILITY WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Drop-in replacement for BackendApiService
 * Uses v2 backend by default
 */
export class BackendApiServiceV2 {
    static createJob = createJobV2;
    static getJob = getJobV2;
    static pollJob = pollJobV2;

    static async createJobFromFile(
        file: File,
        duration: number,
        onProgress: (message: string, percentage: number) => void,
        signal?: AbortSignal
    ): Promise<string> {
        const gcsUri = await uploadFileV2(
            file,
            (p) => onProgress(p.message, p.percentage),
            signal
        );
        return createJobV2(gcsUri, file.type, duration);
    }
}
