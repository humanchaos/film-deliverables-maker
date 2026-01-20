
import { JobDocument, FullAnalysisResult } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://gemini-super-app-backend-193471035724.europe-west3.run.app';

// Debug: Track poll statistics
const pollDebug = {
    pollCount: 0,
    lastStatus: '',
    lastProgress: 0,
    statusUnchangedCount: 0,
    startTime: 0,
};

export class BackendApiService {
    /**
     * Creates a new analysis job.
     * @param gcsUri The GCS URI of the video file (must be gs://...).
     * @param mimeType The mime type (e.g., video/mp4).
     * @param duration Optional duration in seconds.
     * @param geminiFileUri Optional Gemini Files API URI (if already uploaded).
     */
    static async createJob(gcsUri: string, mimeType: string, duration: number = 0, geminiFileUri?: string): Promise<string> {
        console.log(`[BackendAPI] Creating job for ${gcsUri}${geminiFileUri ? ' with Gemini URI' : ''}`);

        // Reset debug stats for new job
        pollDebug.pollCount = 0;
        pollDebug.lastStatus = '';
        pollDebug.lastProgress = 0;
        pollDebug.statusUnchangedCount = 0;
        pollDebug.startTime = Date.now();

        const response = await fetch(`${API_BASE_URL}/api/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gcsUri,
                mimeType,
                duration,
                geminiFileUri, // Pass Gemini URI if available (avoids re-upload)
                // Full analysis config with all modules enabled
                analysisConfig: {
                    transcription: true,
                    shotList: true,
                    videoIntelligence: true,
                    fauna: true,
                    synopsis: true,
                    graphics: true,
                    cast: true  // Bio detection enabled
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create job: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        console.log(`[BackendAPI] Job created successfully:`, data);
        return data.id;
    }

    /**
     * Fetches the current status of a job.
     * DEBUG: Added cache-busting and comprehensive logging to diagnose 304 polling issue.
     */
    static async getJob(jobId: string): Promise<JobDocument> {
        pollDebug.pollCount++;

        // Cache-busting: Add timestamp to prevent 304 responses
        const cacheBuster = `_t=${Date.now()}`;
        const url = `${API_BASE_URL}/api/jobs/${jobId}?${cacheBuster}`;

        const response = await fetch(url, {
            headers: {
                // Force no-cache to prevent browser from returning 304
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });

        if (!response.ok) {
            console.error(`[BackendAPI] Poll #${pollDebug.pollCount} FAILED: HTTP ${response.status}`);
            throw new Error(`Failed to fetch job: ${response.status}`);
        }

        const job = await response.json() as JobDocument;

        // Detailed debug logging
        const elapsedSec = ((Date.now() - pollDebug.startTime) / 1000).toFixed(0);
        const statusChanged = job.status !== pollDebug.lastStatus;
        const progressChanged = job.progress?.overall !== pollDebug.lastProgress;

        if (statusChanged || progressChanged || pollDebug.pollCount <= 3 || pollDebug.pollCount % 10 === 0) {
            console.log(`[BackendAPI] Poll #${pollDebug.pollCount} (${elapsedSec}s):`, {
                status: job.status,
                progress: job.progress?.overall || 0,
                stage: job.progress?.currentStage || 'unknown',
                modules: job.progress?.modules ? Object.keys(job.progress.modules).map(m =>
                    `${m}:${(job.progress?.modules as any)[m]?.status || '?'}`
                ).join(', ') : 'none',
                hasResults: !!job.results,
                hasSubcollections: job.hasSubcollections
            });
        }

        // Track stalled progress
        if (!statusChanged && !progressChanged) {
            pollDebug.statusUnchangedCount++;
            if (pollDebug.statusUnchangedCount === 10) {
                console.warn(`[BackendAPI] ⚠️ STALL DETECTED: Status unchanged for 10 consecutive polls`);
            }
            if (pollDebug.statusUnchangedCount === 30) {
                console.error(`[BackendAPI] 🔴 CRITICAL STALL: Status unchanged for 30 polls. Job may be stuck.`, {
                    jobId,
                    status: job.status,
                    progress: job.progress,
                    elapsedMinutes: (elapsedSec as unknown as number / 60).toFixed(1)
                });
            }
        } else {
            pollDebug.statusUnchangedCount = 0;
        }

        pollDebug.lastStatus = job.status;
        pollDebug.lastProgress = job.progress?.overall || 0;

        return job;
    }

    /**
     * Polls the job status until it is completed or failed.
     * @param jobId The ID of the job to monitor.
     * @param onProgress Callback for progress updates.
     * @param signal AbortSignal to cancel polling.
     */
    static async pollJob(
        jobId: string,
        onProgress: (status: string, percentage: number) => void,
        signal?: AbortSignal
    ): Promise<FullAnalysisResult> {
        let attempts = 0;
        const maxAttempts = 360; // 30 minutes
        const delay = 5000;

        while (attempts < maxAttempts) {
            if (signal?.aborted) throw new Error('Operation cancelled');

            const job = await this.getJob(jobId);

            // Update Progress
            const stage = job.progress?.currentStage || 'Processing...';
            const percent = job.progress?.overall || 0;
            onProgress(stage, percent);

            if (job.status === 'completed') {
                if (!job.results) throw new Error('Job completed but results are missing.');
                return job.results as unknown as FullAnalysisResult;
            }

            if (job.status === 'failed') {
                throw new Error(job.error?.message || 'Job failed during processing');
            }

            attempts++;
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        throw new Error('Analysis timed out');
    }
}

