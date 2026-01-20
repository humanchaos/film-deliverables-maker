/**
 * Analysis Coordinator - Backend-Only Version
 * 
 * All analysis is routed through the Cloud Run backend.
 * This file is a thin wrapper for the BackendApiService.
 * 
 * Phase 1 Consolidation: Removed all client-side Gemini analysis code.
 */

import { uploadFileToGCS } from './gcsUploadService';
import { smartUploadToGemini } from './uploadService';
import { BackendApiService, mapBackendResultsToFullAnalysis } from './backendApiService';
import {
    AnalysisMode,
    Shot,
    UploadProgress,
    SynopsisConfig,
    BioConfig,
    GraphicsConfig,
    FaunaConfig,
    ShotListConfig,
    VideoMetadata
} from '../types';

// Types for the coordinated result
export interface CoordinatedAnalysisResult {
    shots?: Omit<Shot, 'nr' | 'thumbnail'>[];
    transcription?: any;
    metadata?: any;
}

interface AnalysisOptions {
    file: File;
    fileUri?: string;
    mode: AnalysisMode;
    apiKey: string;
    accessToken?: string;
    projectId?: string;
    bucketName?: string;
    useProMode?: boolean;
    tokenIsValid?: boolean;
    onProgress: (message: string, percentage: number) => void;
    onMultiProgress?: (mode: AnalysisMode, message: string, percentage: number) => void;
    signal?: AbortSignal;
    synopsisConfig?: SynopsisConfig;
    bioConfig?: BioConfig;
    graphicsConfig?: GraphicsConfig;
    faunaConfig?: FaunaConfig;
    shotListConfig?: ShotListConfig;
    videoMetadata?: VideoMetadata | null;
}

/**
 * Routes all analysis through the Cloud Run backend.
 * No client-side Gemini analysis is performed.
 */
export async function performAnalysis(options: AnalysisOptions): Promise<any> {
    const {
        file,
        fileUri,
        mode,
        apiKey,
        accessToken,
        bucketName,
        tokenIsValid,
        onProgress,
        onMultiProgress,
        signal,
        videoMetadata
    } = options;

    // ═══════════════════════════════════════════════════════════════════════════════
    // VALIDATION: Require backend access
    // ═══════════════════════════════════════════════════════════════════════════════

    if (!accessToken || !bucketName) {
        throw new Error(
            'Backend analysis requires authentication. Please sign in via Settings → Google Cloud Authentication.'
        );
    }

    if (!tokenIsValid) {
        throw new Error(
            'Your session has expired. Please sign in again via Settings → Google Cloud Authentication.'
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 1: Ensure file is in GCS
    // ═══════════════════════════════════════════════════════════════════════════════

    let gcsUri = fileUri;

    if (!gcsUri || !gcsUri.startsWith('gs://')) {
        // Cannot upload virtual/restored files (0 bytes)
        if (file.size === 0) {
            throw new Error(
                'Cannot analyze restored file. Please re-upload the original video file.'
            );
        }

        console.log('[Coordinator] Uploading to GCS...');
        onProgress('Uploading to Cloud Storage...', 0);

        gcsUri = await uploadFileToGCS({
            file,
            bucketName: bucketName!,
            apiKey,
            accessToken: accessToken!,
            onProgress: (p: UploadProgress) => {
                onProgress(p.message, p.percentage * 0.2); // 0-20%
            },
            signal
        });
    } else {
        onProgress('File ready in Cloud Storage...', 20);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 2: Upload to Gemini Files API (for Gemini-based analysis)
    // ═══════════════════════════════════════════════════════════════════════════════

    let geminiFileUri = fileUri;

    if (!geminiFileUri || geminiFileUri.startsWith('gs://')) {
        // Need to upload to Gemini Files API
        if (file.size > 0) {
            onProgress('Preparing for AI analysis...', 22);
            try {
                geminiFileUri = await smartUploadToGemini({
                    file,
                    apiKey,
                    onProgress: (p: UploadProgress) => {
                        onProgress(p.message, 22 + (p.percentage * 0.03)); // 22-25%
                    },
                    signal
                });
            } catch (e) {
                console.warn('[Coordinator] Gemini upload failed, backend will handle:', e);
                // Backend can still work with GCS URI, so we continue
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 3: Create backend job
    // ═══════════════════════════════════════════════════════════════════════════════

    onProgress('Starting backend analysis...', 25);
    console.log(`[Coordinator] Creating job - gcsUri: ${gcsUri?.substring(0, 50)}...`);
    console.log(`[Coordinator] Creating job - geminiUri: ${geminiFileUri?.substring(0, 50)}...`);

    const jobId = await BackendApiService.createJob(
        gcsUri!,
        file.type,
        videoMetadata?.duration,
        geminiFileUri
    );
    console.log(`[Coordinator] Job created: ${jobId}`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // STEP 4: Poll for completion
    // ═══════════════════════════════════════════════════════════════════════════════

    const startTime = Date.now();
    const JOB_TIMEOUT = 180 * 60 * 1000; // 180 minutes
    const MAX_CONSECUTIVE_ERRORS = 20;
    const BASE_INTERVAL = 2000;
    const MAX_BACKOFF = 10000;

    let attempt = 0;
    let consecutiveErrors = 0;

    while (true) {
        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }

        // Timeout check
        if (Date.now() - startTime > JOB_TIMEOUT) {
            throw new Error('Analysis timed out. The job may still be running on the backend.');
        }

        // Offline detection - pause polling
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            console.log('[Coordinator] Offline detected, pausing...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }

        const isHidden = typeof document !== 'undefined' && document.hidden;

        try {
            const job = await BackendApiService.getJob(jobId);

            // Reset error counters on success
            attempt = 0;
            consecutiveErrors = 0;

            // Update module progress
            if (job.progress?.modules && onMultiProgress) {
                const m = job.progress.modules;
                if (m.fauna) onMultiProgress('fauna', m.fauna.status === 'completed' ? 'Done' : m.fauna.status, m.fauna.progress);
                if (m.transcription) onMultiProgress('transcribe', m.transcription.status === 'completed' ? 'Done' : 'Processing', m.transcription.progress);
                if (m.shotList) onMultiProgress('shotlist', m.shotList.status === 'completed' ? 'Done' : 'Processing', m.shotList.progress);
                if (m.synopsis) onMultiProgress('synopsis', m.synopsis.status === 'completed' ? 'Done' : 'Processing', m.synopsis.progress);
                if (m.graphics) onMultiProgress('graphics', m.graphics.status === 'completed' ? 'Done' : 'Processing', m.graphics.progress);
                if (m.cast) onMultiProgress('bio', m.cast.status === 'completed' ? 'Done' : 'Processing', m.cast.progress);
            }

            // Update overall progress (25-100%)
            const overall = 25 + ((job.progress?.overall || 0) * 0.75);
            onProgress(job.progress?.currentStage || 'Processing...', overall);

            // Check completion
            if (job.status === 'completed') {
                if (!job.results && !job.hasSubcollections) {
                    throw new Error('Job completed but results are missing');
                }
                console.log('[Coordinator] Job completed successfully');
                // Transform v2 backend results to frontend format
                return mapBackendResultsToFullAnalysis(job.results || {});
            }

            if (job.status === 'failed') {
                throw new Error(job.error?.message || 'Backend processing failed');
            }

        } catch (pollError: any) {
            consecutiveErrors++;
            console.warn(`[Coordinator] Poll error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${pollError.message}`);

            // Terminal errors - don't retry
            if (pollError.message.includes('404') || pollError.message.includes('Not Found')) {
                throw new Error(`Job ${jobId} not found. It may have expired.`);
            }

            // Too many consecutive failures
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                throw new Error('Connection lost. Please check your internet connection.');
            }
        }

        // Adaptive backoff
        let interval = isHidden ? 30000 : Math.min(BASE_INTERVAL * Math.pow(1.5, attempt++), MAX_BACKOFF);
        if (consecutiveErrors > 0) interval = Math.max(interval, 5000);

        const jitter = Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, interval + jitter));
    }
}
