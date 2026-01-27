/**
 * Jobs Controller
 * REST API endpoints for job management
 */

import { Request, Response } from 'express';
import { getDb, Timestamp } from '../services/firebase.js';
import { processJob } from '../services/worker.js';
import * as storage from '../services/storage.js';
import type { Job, AnalysisConfig, CreateJobRequest } from '../types.js';

// Default config - all modules enabled
const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
    transcription: true,
    shotList: true,
    synopsis: true,
    fauna: true,
    graphics: true,
    cast: true,
};

/**
 * POST /api/upload-url
 * Generate a signed URL for uploading a file to GCS
 */
export async function getUploadUrl(req: Request, res: Response) {
    try {
        const { fileName, mimeType, fileSize } = req.body;

        if (!fileName || !mimeType) {
            return res.status(400).json({ error: 'fileName and mimeType are required' });
        }

        // Validate file size (2GB limit)
        if (fileSize && fileSize > 2 * 1024 * 1024 * 1024) {
            return res.status(400).json({ error: 'File too large (max 2GB)' });
        }

        // Validate mime type
        const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
        if (!allowedTypes.includes(mimeType)) {
            return res.status(400).json({ error: `Unsupported format: ${mimeType}` });
        }

        const { uploadUrl, gcsUri } = await storage.getUploadUrl(fileName, mimeType);

        res.json({ uploadUrl, gcsUri });
    } catch (error) {
        console.error('[Jobs] getUploadUrl error:', error);
        res.status(500).json({ error: 'Failed to generate upload URL' });
    }
}

/**
 * POST /api/jobs
 * Create a new analysis job with atomic locking to prevent duplicate workers
 */
export async function createJob(req: Request, res: Response) {
    try {
        const { gcsUri, mimeType, duration, fileName, analysisConfig, geminiFileUri, preferredLanguage } = req.body as CreateJobRequest;

        // Validate required fields
        if (!gcsUri) {
            return res.status(400).json({ error: 'gcsUri is required' });
        }

        if (!gcsUri.startsWith('gs://')) {
            return res.status(400).json({ error: 'gcsUri must be a gs:// URI' });
        }

        // Log if geminiFileUri was provided (avoids re-upload in worker)
        if (geminiFileUri) {
            console.log(`[Jobs] geminiFileUri provided, worker will skip re-upload`);
        }

        // Log preferred language
        if (preferredLanguage) {
            console.log(`[Jobs] preferredLanguage: ${preferredLanguage}`);
        }

        // Merge config with defaults
        const finalConfig: AnalysisConfig = {
            ...DEFAULT_ANALYSIS_CONFIG,
            ...(analysisConfig || {}),
        };

        // Check that at least one module is enabled
        const enabledModules = Object.entries(finalConfig)
            .filter(([_, enabled]) => enabled)
            .map(([name]) => name);

        if (enabledModules.length === 0) {
            return res.status(400).json({ error: 'At least one analysis module must be enabled' });
        }

        console.log(`[Jobs] Creating job with modules: ${enabledModules.join(', ')}`);

        // Create initial module status
        const moduleStatus = {
            status: 'pending' as const,
            progress: 0,
        };

        // Create job document
        const db = getDb();
        const jobData: Record<string, any> = {
            userId: 'anonymous', // TODO: Add auth
            status: 'queued' as const,
            input: {
                gcsUri,
                mimeType: mimeType || 'video/mp4',
                duration: duration || 0,
                fileName: fileName || 'video.mp4',
                analysisConfig: finalConfig,
                preferredLanguage: preferredLanguage || undefined, // Pass user's language preference
            },
            progress: {
                overall: 0,
                currentModule: 'queued',
                modules: {
                    transcription: { ...moduleStatus },
                    shotList: { ...moduleStatus },
                    synopsis: { ...moduleStatus },
                    fauna: { ...moduleStatus },
                    graphics: { ...moduleStatus },
                    cast: { ...moduleStatus },
                },
            },
            results: null,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };

        // Include geminiFileUri if provided (worker will skip re-upload)
        if (geminiFileUri) {
            jobData.geminiFileUri = geminiFileUri;
        }

        const docRef = await db.collection('jobs').add(jobData);
        const jobId = docRef.id;

        console.log(`[Jobs] Created job: ${jobId}`);

        // Trigger worker with atomic status transition to prevent duplicate workers
        setImmediate(async () => {
            try {
                // Use transaction to atomically claim the job
                const lockResult = await db.runTransaction(async (txn) => {
                    const doc = await txn.get(docRef);
                    const currentStatus = doc.data()?.status;

                    // Only proceed if job is still queued (prevents duplicate workers)
                    if (currentStatus !== 'queued') {
                        console.log(`[Jobs] Job ${jobId} already claimed (status: ${currentStatus}), skipping`);
                        return { locked: false };
                    }

                    // Atomically transition to processing
                    txn.update(docRef, {
                        status: 'processing',
                        'progress.currentModule': 'starting',
                        updatedAt: Timestamp.now()
                    });
                    return { locked: true };
                });

                if (lockResult.locked) {
                    await processJob(jobId);
                }
            } catch (err) {
                console.error(`[Jobs] Background worker failed for ${jobId}:`, err);

                // CRITICAL: Ensure job is marked as failed even on catastrophic errors
                // This prevents "zombie" jobs that are stuck in queued/processing forever
                try {
                    await docRef.update({
                        status: 'failed',
                        error: {
                            code: 'WORKER_CRASH',
                            message: err instanceof Error ? err.message : 'Worker crashed unexpectedly'
                        },
                        updatedAt: Timestamp.now(),
                    });
                    console.log(`[Jobs] Marked job ${jobId} as failed after worker crash`);
                } catch (writeErr) {
                    console.error(`[Jobs] CRITICAL: Failed to write error state for ${jobId}:`, writeErr);
                }
            }
        });

        res.status(201).json({ id: jobId, status: 'queued' });
    } catch (error) {
        console.error('[Jobs] createJob error:', error);
        res.status(500).json({ error: 'Failed to create job' });
    }
}

/**
 * GET /api/jobs/:id
 * Get job status and results
 */
export async function getJob(req: Request, res: Response) {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: 'Job ID is required' });
        }

        const db = getDb();
        const jobDoc = await db.collection('jobs').doc(id).get();

        if (!jobDoc.exists) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const data = jobDoc.data();
        const job: Job = {
            id: jobDoc.id,
            userId: data?.userId,
            status: data?.status,
            input: data?.input,
            progress: data?.progress,
            results: data?.results,
            error: data?.error,
            geminiFileUri: data?.geminiFileUri,
            createdAt: data?.createdAt?.toDate(),
            updatedAt: data?.updatedAt?.toDate(),
            completedAt: data?.completedAt?.toDate(),
        };

        res.json(job);
    } catch (error) {
        console.error('[Jobs] getJob error:', error);
        res.status(500).json({ error: 'Failed to fetch job' });
    }
}

/**
 * DELETE /api/jobs/:id
 * Cancel a job (if still processing) or delete results
 */
export async function deleteJob(req: Request, res: Response) {
    try {
        const { id } = req.params;

        const db = getDb();
        const jobRef = db.collection('jobs').doc(id);
        const jobDoc = await jobRef.get();

        if (!jobDoc.exists) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Mark as cancelled if still processing
        const status = jobDoc.data()?.status;
        if (status === 'queued' || status === 'processing') {
            await jobRef.update({
                status: 'failed',
                error: { code: 'CANCELLED', message: 'Job cancelled by user' },
                updatedAt: Timestamp.now(),
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[Jobs] deleteJob error:', error);
        res.status(500).json({ error: 'Failed to delete job' });
    }
}

/**
 * POST /workers/process
 * Internal endpoint for worker to process a job
 */
export async function workerProcess(req: Request, res: Response) {
    try {
        const { jobId } = req.body;

        if (!jobId) {
            return res.status(400).json({ error: 'jobId is required' });
        }

        console.log(`[Worker] Received process request for job: ${jobId}`);

        await processJob(jobId);

        res.json({ success: true });
    } catch (error) {
        console.error('[Worker] Process error:', error);
        res.status(500).json({ error: 'Processing failed' });
    }
}
