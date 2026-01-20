import { Request, Response } from 'express';
import { db } from '../config/firebase';
import { logger } from '../utils/logger';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { JobDocument } from '../types';
import { performAnalysis } from '../services/analysisCoordinator';
import { storageService } from '../services/storageService';
import { uploadGCSVideoToGemini } from '../services/geminiService';
import { CloudTasksClient } from '@google-cloud/tasks';
import { config } from '../config/env';

const tasksClient = new CloudTasksClient();

export const processJob = async (req: Request, res: Response) => {
    // ═══════════════════════════════════════════════════════════════
    // DEEP DEBUG: Log IMMEDIATELY when worker endpoint is hit
    // ═══════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('[DEBUG-WORKER] ★★★ processJob ENDPOINT HIT ★★★');
    console.log('[DEBUG-WORKER] Timestamp:', new Date().toISOString());
    console.log('[DEBUG-WORKER] Request body:', JSON.stringify(req.body));
    console.log('[DEBUG-WORKER] Request headers:', JSON.stringify(req.headers));
    console.log('═══════════════════════════════════════════════════════════');

    const { jobId, type, gcsUri, proxyJobName, moduleName } = req.body;

    if (!jobId) {
        console.log('[DEBUG-WORKER] ERROR: No jobId in request!');
        logger.error('Worker received request without jobId');
        return res.status(400).send('Missing jobId');
    }

    console.log('[DEBUG-WORKER] Processing jobId:', jobId, 'type:', type || 'initialize');
    logger.info(`Worker received task: ${type || 'initialize'} for ${jobId}`);

    try {
        // -------------------------------------------------------------------
        // 1. ORCHESTRATOR / INITIALIZER (Default entry point)
        // -------------------------------------------------------------------
        if (!type || type === 'initialize') {
            const jobRef = db.collection('jobs').doc(jobId);
            const jobDoc = await jobRef.get();

            if (!jobDoc.exists) {
                logger.error(`Job ${jobId} not found`);
                return res.status(404).send('Job not found');
            }
            const job = jobDoc.data() as JobDocument;

            // Idempotency check: If job is already 'completed' or 'failed', stop.
            if (job.status === 'completed' || job.status === 'failed') {
                return res.status(200).send('Job already finished');
            }

            // ═══════════════════════════════════════════════════════════════════════════
            // STEP 1: Upload video from GCS to Gemini Files API
            // ═══════════════════════════════════════════════════════════════════════════
            const gcsUri = job.input.gcsUri;
            const mimeType = job.input.mimeType || 'video/mp4';

            // Check if we already have a cached Gemini URI
            let geminiFileUri = job.geminiFileUri;
            logger.info(`[Worker] Job ${jobId} - geminiFileUri from Firestore: ${geminiFileUri ? geminiFileUri.substring(0, 60) + '...' : 'NOT SET'}`);
            if (!geminiFileUri) {
                logger.info(`[Worker] Uploading video to Gemini Files API: ${gcsUri}`);
                await jobRef.update({
                    'progress.currentStage': 'Uploading to Gemini Files API...',
                    'progress.overall': 5,
                    updatedAt: Timestamp.now()
                });

                try {
                    geminiFileUri = await uploadGCSVideoToGemini(gcsUri, mimeType, jobId);
                    // Cache the URI for future retries
                    await jobRef.update({ geminiFileUri });
                    logger.info(`[Worker] Gemini upload complete: ${geminiFileUri}`);
                } catch (uploadError: any) {
                    logger.error(`[Worker] Failed to upload to Gemini:`, uploadError);
                    await jobRef.update({
                        status: 'failed',
                        error: {
                            code: 'GEMINI_UPLOAD_FAILED',
                            message: uploadError.message || 'Failed to upload video to Gemini Files API'
                        },
                        updatedAt: Timestamp.now()
                    });
                    return res.status(200).send('Job failed: Gemini upload error');
                }
            } else {
                logger.info(`[Worker] Using cached Gemini URI: ${geminiFileUri}`);
            }

            // Determine which modules to run based on job.input.analysisConfig
            const analysisConfig = job.input.analysisConfig;
            const modules: string[] = [];
            if (analysisConfig.transcription) modules.push('transcription');
            if (analysisConfig.shotList || analysisConfig.videoIntelligence) modules.push('shotList');
            if (analysisConfig.fauna) modules.push('fauna');
            if (analysisConfig.synopsis) modules.push('synopsis');
            if (analysisConfig.graphics) modules.push('graphics');
            if (analysisConfig.cast) modules.push('cast');

            // Guard against empty modules list
            if (modules.length === 0) {
                logger.error(`[Worker] No modules selected for job ${jobId}. Config was: ${JSON.stringify(analysisConfig)}`);
                await jobRef.update({
                    status: 'failed',
                    error: {
                        code: 'NO_MODULES_SELECTED',
                        message: 'No analysis modules were enabled. Please ensure at least one module is selected.'
                    },
                    updatedAt: Timestamp.now()
                });
                return res.status(200).send('Job failed: no modules selected');
            }

            logger.info(`[Worker] Fanning out ${modules.length} modules: ${modules.join(', ')}`);

            // Update status to processing
            await jobRef.update({
                status: 'processing',
                'progress.currentStage': 'Analyzing video...',
                'progress.overall': 10,
                updatedAt: Timestamp.now()
            });

            // Fan out to module processors
            // IMPORTANT: shotList uses Video Intelligence API which requires GCS URI (gs://...)
            // Other modules use Gemini API which requires Gemini File URI
            const originalGcsUri = job.input.gcsUri; // The actual gs:// URI

            await Promise.all(modules.map(mod =>
                enqueueTask({
                    type: 'module_process',
                    jobId,
                    // Use GCS URI for shotList (Video Intelligence), Gemini URI for others
                    gcsUri: mod === 'shotList' ? originalGcsUri : geminiFileUri,
                    moduleName: mod
                })
            ));

            return res.send({ status: 'processing', modules })
        }

        // -------------------------------------------------------------------
        // 2. MODULE PROCESSOR
        // -------------------------------------------------------------------
        if (type === 'module_process') {
            await processModule(jobId, moduleName, gcsUri);
            return res.status(200).send(`Module ${moduleName} processed`);
        }

    } catch (error: any) {
        logger.error(`Worker failed processing job: ${jobId}`, error);

        // Retry logic handled by Cloud Tasks configuration mostly, but we can signal error
        if (error.code === 429 || error.code === 503) {
            return res.status(500).send('Transient failure');
        }
        // If it's a critical error in orchestration, we might want to log it and stop
        return res.status(500).send(error.message);
    }
};

async function enqueueTask(payload: any, delaySeconds = 0) {
    // Check if Cloud Tasks is fully configured
    const hasCloudTasks = config.projectId && config.queueName && config.location && config.workerUrl;

    if (!hasCloudTasks) {
        // FALLBACK: Direct HTTP call instead of Cloud Tasks
        // This is less robust (no retries) but works when Cloud Tasks isn't set up
        logger.warn(`[enqueueTask] Cloud Tasks not configured. Using direct HTTP fallback.`);

        if (!config.workerUrl) {
            logger.error(`[enqueueTask] Cannot process: WORKER_URL not set`);
            return;
        }

        const url = config.workerUrl.endsWith('/workers/process')
            ? config.workerUrl
            : `${config.workerUrl}/workers/process`;

        // Fire-and-forget HTTP call
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(res => {
            if (res.ok) {
                logger.info(`[enqueueTask] Direct call succeeded for ${payload.moduleName || 'initialize'}`);
            } else {
                logger.error(`[enqueueTask] Direct call failed: ${res.status}`);
            }
        }).catch(err => {
            logger.error(`[enqueueTask] Direct call error: ${err.message}`);
        });

        return;
    }

    // Cloud Tasks path (production)
    const parent = tasksClient.queuePath(config.projectId!, config.location, config.queueName);

    const url = config.workerUrl.endsWith('/workers/process')
        ? config.workerUrl
        : `${config.workerUrl}/workers/process`;

    const taskRequest = {
        httpMethod: 'POST',
        url,
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        headers: { 'Content-Type': 'application/json' },
        oidcToken: config.serviceAccountEmail ? { serviceAccountEmail: config.serviceAccountEmail } : undefined
    };

    const task: any = { httpRequest: taskRequest };
    if (delaySeconds > 0) {
        task.scheduleTime = { seconds: Date.now() / 1000 + delaySeconds };
    }

    await tasksClient.createTask({ parent, task });
}

async function processModule(jobId: string, moduleName: string, gcsUri: string) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`[DEBUG-MODULE] ★ Starting processModule for ${moduleName}`);
    console.log(`[DEBUG-MODULE] JobId: ${jobId}`);
    console.log(`[DEBUG-MODULE] URI: ${gcsUri?.substring(0, 80)}`);
    console.log('═══════════════════════════════════════════════════════════');

    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) {
        console.log(`[DEBUG-MODULE] ✗ Job ${jobId} not found!`);
        return;
    }

    const job = jobDoc.data() as JobDocument;
    console.log(`[DEBUG-MODULE] Job status: ${job.status}`);

    // Create a modified job object that ONLY enables the specific module
    const specificJob = {
        ...job,
        input: {
            ...job.input,
            gcsUri: gcsUri,
            analysisConfig: {
                transcription: moduleName === 'transcription',
                shotList: moduleName === 'shotList',
                videoIntelligence: moduleName === 'shotList',
                fauna: moduleName === 'fauna',
                synopsis: moduleName === 'synopsis',
                graphics: moduleName === 'graphics',
                cast: moduleName === 'cast'
            }
        }
    };

    console.log(`[DEBUG-MODULE] Config for ${moduleName}:`, JSON.stringify(specificJob.input.analysisConfig));
    logger.info(`Processing module ${moduleName} for ${jobId} with proxy ${gcsUri}`);

    try {
        console.log(`[DEBUG-MODULE] Calling performAnalysis...`);
        const partialResults = await performAnalysis(jobId, specificJob as JobDocument);
        console.log(`[DEBUG-MODULE] ✓ performAnalysis completed for ${moduleName}`);
        console.log(`[DEBUG-MODULE] partialResults type: ${typeof partialResults}`);
        console.log(`[DEBUG-MODULE] partialResults keys: ${Object.keys(partialResults || {}).join(', ')}`);
        console.log(`[DEBUG-MODULE] partialResults.shotList exists: ${!!partialResults.shotList}`);
        if (partialResults.shotList) {
            console.log(`[DEBUG-MODULE] partialResults.shotList length: ${(partialResults.shotList as any[])?.length || 0}`);
            console.log(`[DEBUG-MODULE] partialResults.shotList[0]: ${JSON.stringify((partialResults.shotList as any[])?.[0] || null)}`);
        }

        // CAST-SPECIFIC DEBUG
        if (moduleName === 'cast') {
            console.log(`[CAST-WORKER] ════════════════════════════════════════════════════`);
            console.log(`[CAST-WORKER] Processing CAST module results`);
            console.log(`[CAST-WORKER] partialResults.cast exists: ${!!partialResults.cast}`);
            if (partialResults.cast) {
                const castData = partialResults.cast as any[];
                console.log(`[CAST-WORKER] cast data type: ${typeof partialResults.cast}`);
                console.log(`[CAST-WORKER] cast isArray: ${Array.isArray(castData)}`);
                console.log(`[CAST-WORKER] cast length: ${castData?.length || 'N/A'}`);
                if (Array.isArray(castData) && castData.length > 0) {
                    console.log(`[CAST-WORKER] First cast entry:`, JSON.stringify(castData[0], null, 2));
                }
            } else {
                console.log(`[CAST-WORKER] ⚠ partialResults.cast is NULL/UNDEFINED!`);
                console.log(`[CAST-WORKER] Available keys in partialResults:`, Object.keys(partialResults));
            }
            console.log(`[CAST-WORKER] ════════════════════════════════════════════════════`);
        }

        const data = partialResults[moduleName as keyof typeof partialResults];
        console.log(`[DEBUG-MODULE] Extracted data for '${moduleName}': exists=${!!data}, type=${typeof data}`);
        if (Array.isArray(data)) {
            console.log(`[DEBUG-MODULE] Data is array with ${data.length} items`);
            if (moduleName === 'cast' && data.length > 0) {
                console.log(`[CAST-WORKER] Extracted cast data sample:`, JSON.stringify(data[0], null, 2));
            }
        }

        if (data) {
            console.log(`[DEBUG-MODULE] Saving result to storage...`);
            const pointer = await storageService.saveLargeResult(jobId, moduleName, data);
            console.log(`[DEBUG-MODULE] Result saved, pointer:`, pointer);

            // Build update object
            const updateData: Record<string, any> = {
                [`results.${moduleName}`]: pointer,
                [`progress.modules.${moduleName}.status`]: 'completed',
                [`progress.modules.${moduleName}.progress`]: 100,
                updatedAt: Timestamp.now()
            };

            // SPECIAL: Cast module also stores as 'bio' for frontend compatibility
            if (moduleName === 'cast') {
                updateData['results.bio'] = pointer;
                console.log(`[CAST-WORKER] ✓ Also saved as results.bio for frontend`);
                console.log(`[CAST-WORKER] Pointer stored at both results.cast and results.bio`);
            }

            await jobRef.update(updateData);
            console.log(`[DEBUG-MODULE] ✓✓✓ Module ${moduleName} COMPLETED ✓✓✓`);
        } else {
            console.log(`[DEBUG-MODULE] ✗ No data returned for ${moduleName}`);
            if (moduleName === 'cast') {
                console.error(`[CAST-WORKER] ✗ CRITICAL: Cast module completed but returned NO DATA!`);
                console.error(`[CAST-WORKER] This means the frontend will show empty bios.`);
                console.error(`[CAST-WORKER] Check [CAST-DEBUG] logs above for root cause.`);
            }
        }

        // Check if ALL modules are now done
        await checkAndFinalizeJob(jobId);
        console.log(`[DEBUG-MODULE] checkAndFinalizeJob completed`);

    } catch (error: any) {
        console.log(`[DEBUG-MODULE] ✗✗✗ ERROR in processModule ✗✗✗`);
        console.log(`[DEBUG-MODULE] Error name: ${error.name}`);
        console.log(`[DEBUG-MODULE] Error message: ${error.message}`);
        console.log(`[DEBUG-MODULE] Error stack: ${error.stack?.substring(0, 500)}`);

        logger.error(`Module ${moduleName} failed`, error);
        await jobRef.update({
            [`progress.modules.${moduleName}.status`]: 'failed',
            [`progress.modules.${moduleName}.error`]: error.message,
            updatedAt: Timestamp.now()
        });
    }
}

async function checkAndFinalizeJob(jobId: string) {
    const jobRef = db.collection('jobs').doc(jobId);
    const updatedDoc = await jobRef.get();
    const updatedJob = updatedDoc.data() as JobDocument;
    const originalConfig = updatedJob.input.analysisConfig;

    const requiredModules: string[] = [];
    if (originalConfig.transcription) requiredModules.push('transcription');
    if (originalConfig.shotList || originalConfig.videoIntelligence) requiredModules.push('shotList');
    if (originalConfig.fauna) requiredModules.push('fauna');
    if (originalConfig.synopsis) requiredModules.push('synopsis');
    if (originalConfig.graphics) requiredModules.push('graphics');
    if (originalConfig.cast) requiredModules.push('cast');

    const allDone = requiredModules.every(mod => {
        const mStatus = updatedJob.progress?.modules?.[mod as keyof typeof updatedJob.progress.modules]?.status;
        return mStatus === 'completed' || mStatus === 'failed' || mStatus === 'skipped';
    });

    if (allDone) {
        await jobRef.update({
            status: 'completed',
            'progress.overall': 100,
            'progress.currentStage': 'Analysis Complete',
            hasSubcollections: false
        });
        logger.info(`Job ${jobId} fully completed.`);
    }
}


