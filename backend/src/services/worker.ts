/**
 * Worker Service
 * Orchestrates video analysis with simple, sequential processing
 * 
 * Key features:
 * - Checkpoint persistence after each module (resume on failure)
 * - Per-module timeouts (prevents zombie jobs)
 * - Graceful degradation (partial results on module failure)
 */

import { getDb, Timestamp } from './firebase.js';
import * as gemini from './gemini.js';
import * as videoIntel from './videoIntel.js';
import type { Job, AnalysisResults, ModuleProgress } from '../types.js';
import { validateResults } from '../utils/timecode.js';
import { matchSpeakersToNames } from '../utils/speakers.js';
import { sanitizeForFirestore } from '../utils/firestore.js';
import { detectLanguage } from './languageDetector.js';

type ModuleName = 'transcription' | 'shotList' | 'synopsis' | 'fauna' | 'graphics' | 'cast';

// Timeout per module (prevents zombie jobs if Gemini hangs)
const MODULE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per module

/**
 * Process a job sequentially with checkpoint persistence
 * 
 * This is intentionally simple:
 * 1. Upload to Gemini
 * 2. Run each module one at a time
 * 3. CHECKPOINT: Persist each module result immediately
 * 4. Mark complete
 */
export async function processJob(jobId: string): Promise<void> {
    const db = getDb();
    const jobRef = db.collection('jobs').doc(jobId);

    console.log(`[Worker] Processing job ${jobId}...`);

    try {
        // 1. Get job document
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) {
            throw new Error(`Job ${jobId} not found`);
        }

        const job = { id: jobDoc.id, ...jobDoc.data() } as Job;

        // Check if already processed
        if (job.status === 'completed' || job.status === 'failed') {
            console.log(`[Worker] Job already ${job.status}, skipping`);
            return;
        }

        // 2. Update status to processing
        await jobRef.update({
            status: 'processing',
            'progress.currentModule': 'upload',
            updatedAt: Timestamp.now(),
        });

        // 3. Upload to Gemini if needed
        let geminiFileUri = job.geminiFileUri;
        if (!geminiFileUri) {
            await updateProgress(jobRef, 'upload', 10, 'Uploading to AI...');

            geminiFileUri = await gemini.uploadToGemini(
                job.input.gcsUri,
                job.input.mimeType,
                jobId
            );

            // Cache the URI
            await jobRef.update({ geminiFileUri });
        }

        // 3b. Create context cache for token cost reduction (~90% savings)
        await updateProgress(jobRef, 'cache', 12, 'Creating cache...');
        const cacheName = await gemini.createVideoCache(geminiFileUri, job.input.mimeType, jobId);

        // 4. Detect video language
        await updateProgress(jobRef, 'language', 15, 'Detecting language...');
        const detectedLang = await detectLanguage(geminiFileUri, job.input.mimeType);
        const outputLanguage = job.input.preferredLanguage || detectedLang.name;
        console.log(`[Worker] Output language: ${outputLanguage}`);

        // Store language metadata
        await jobRef.update({
            'metadata.detectedLanguage': detectedLang.code,
            'metadata.outputLanguage': outputLanguage,
            'metadata.languageConfidence': detectedLang.confidence
        });

        // 5. Determine which modules to run
        const config = job.input.analysisConfig;
        const modules: ModuleName[] = [];

        if (config.transcription) modules.push('transcription');
        if (config.shotList) modules.push('shotList');
        if (config.synopsis) modules.push('synopsis');
        if (config.fauna) modules.push('fauna');
        if (config.graphics) modules.push('graphics');
        if (config.cast) modules.push('cast');

        console.log(`[Worker] Running modules: ${modules.join(', ')}`);

        // 6. Load any existing partial results (for resume capability)
        const existingResults = job.results || {};
        const results: AnalysisResults = { ...existingResults };
        const totalModules = modules.length;
        const language = outputLanguage;

        // 7. Process modules SEQUENTIALLY with CHECKPOINTS
        for (let i = 0; i < modules.length; i++) {
            const moduleName = modules[i];

            // Skip if module already completed (resume scenario)
            if (results[moduleName] && !('error' in results[moduleName]!)) {
                console.log(`[Worker] Skipping ${moduleName} (already completed)`);
                continue;
            }

            const baseProgress = 25 + Math.floor((i / totalModules) * 65);
            await updateProgress(jobRef, moduleName, baseProgress, `Analyzing ${moduleName}...`);
            await updateModuleStatus(jobRef, moduleName, 'processing', 0);

            try {
                // Run module with timeout protection
                const moduleResult = await withTimeout(
                    runModule(
                        moduleName,
                        geminiFileUri,
                        job.input.gcsUri,
                        job.input.mimeType,
                        job.input.duration,
                        results,
                        language,
                        cacheName || undefined,
                        async (pct, msg) => {
                            // Intra-module progress callback
                            await updateModuleStatus(jobRef, moduleName, 'processing', pct, undefined);
                        }
                    ),
                    MODULE_TIMEOUT_MS,
                    `${moduleName} timed out after ${MODULE_TIMEOUT_MS / 60000} minutes`
                );

                results[moduleName] = moduleResult;

                // CHECKPOINT: Persist this module's result immediately
                // This ensures we don't lose work if the next module fails
                const sanitizedModule = sanitizeForFirestore(moduleResult);
                await jobRef.update({
                    [`results.${moduleName}`]: sanitizedModule,
                    updatedAt: Timestamp.now(),
                });

                await updateModuleStatus(jobRef, moduleName, 'completed', 100);
                console.log(`[Worker] ✓ ${moduleName} complete (checkpointed)`);

            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[Worker] ✗ ${moduleName} failed:`, message);

                results[moduleName] = { error: message };

                // Still checkpoint the error so we know it was attempted
                await jobRef.update({
                    [`results.${moduleName}`]: { error: message },
                    updatedAt: Timestamp.now(),
                });

                await updateModuleStatus(jobRef, moduleName, 'failed', 0, message);

                // Continue with other modules - partial results are OK
            }
        }

        // 8. Post-process results before final write
        console.log(`[Worker] Post-processing results...`);

        // 8a. Validate all timecodes against video duration
        const validatedResults = validateResults(results, job.input.duration);

        // 8b. Match speaker names from graphics to transcript
        if (validatedResults.transcription && validatedResults.graphics) {
            validatedResults.transcription = matchSpeakersToNames(
                validatedResults.transcription,
                validatedResults.graphics
            );
        }

        // 8c. Sanitize for Firestore (remove any remaining undefined values)
        const sanitizedResults = sanitizeForFirestore(validatedResults);

        // 9. Final atomic write
        await jobRef.update({
            status: 'completed',
            results: sanitizedResults,
            'progress.overall': 100,
            'progress.currentModule': 'done',
            completedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });

        // 10. Cleanup: Delete the context cache to avoid storage costs
        if (cacheName) {
            await gemini.deleteVideoCache(jobId);
        }

        console.log(`[Worker] ✓ Job ${jobId} completed`);

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Worker] Job ${jobId} failed:`, message);

        await jobRef.update({
            status: 'failed',
            error: { code: 'PROCESSING_FAILED', message },
            updatedAt: Timestamp.now(),
        });
    }
}

/**
 * Wrap a promise with a timeout
 */
async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string
): Promise<T> {
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(errorMessage));
        }, timeoutMs);
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

/**
 * Run a single analysis module
 */
async function runModule(
    moduleName: ModuleName,
    geminiFileUri: string,
    gcsUri: string,
    mimeType: string,
    duration: number,
    results: AnalysisResults,
    language: string = 'English',
    cacheName?: string,
    onProgress?: (pct: number, msg: string) => Promise<void>
): Promise<any> {
    switch (moduleName) {
        case 'transcription':
            // Transcription doesn't benefit much from caching (different prompts)
            return gemini.transcribe(geminiFileUri, mimeType, duration);

        case 'shotList':
            // Shot detection uses Video Intelligence API (requires GCS URI)
            // Then enrichment uses Gemini with cache
            const rawShots = await videoIntel.detectShots(gcsUri);

            if (rawShots.length === 0) {
                return { shots: [], totalShots: 0 };
            }

            // Enrich with Gemini descriptions in detected language (with cache and progress)
            const enrichedShots = await gemini.enrichShots(
                geminiFileUri,
                mimeType,
                rawShots,
                language,
                cacheName,
                onProgress
            );

            return { shots: enrichedShots, totalShots: enrichedShots.length };

        case 'synopsis':
            return gemini.generateSynopsis(geminiFileUri, mimeType, {
                titleMaxChars: 60,
                loglineMaxWords: 30,
                summaryMaxWords: 100,
                language: language
            }, cacheName);

        case 'fauna':
            return gemini.detectFauna(geminiFileUri, mimeType, {
                primaryLanguage: language,
                secondaryLanguage: language === 'German' ? 'English' : 'German'
            }, cacheName);

        case 'graphics':
            return gemini.detectGraphics(geminiFileUri, mimeType, duration, cacheName);

        case 'cast':
            return gemini.detectCast(geminiFileUri, mimeType, cacheName);

        default:
            throw new Error(`Unknown module: ${moduleName}`);
    }
}

/**
 * Update overall job progress
 */
async function updateProgress(
    jobRef: FirebaseFirestore.DocumentReference,
    currentModule: string,
    percentage: number,
    message: string
): Promise<void> {
    await jobRef.update({
        'progress.overall': percentage,
        'progress.currentModule': currentModule,
        updatedAt: Timestamp.now(),
    });
}

/**
 * Update individual module status
 */
async function updateModuleStatus(
    jobRef: FirebaseFirestore.DocumentReference,
    moduleName: string,
    status: string,
    progress: number,
    error?: string
): Promise<void> {
    const update: Record<string, any> = {
        [`progress.modules.${moduleName}.status`]: status,
        [`progress.modules.${moduleName}.progress`]: progress,
    };

    if (error) {
        update[`progress.modules.${moduleName}.error`] = error;
    }

    await jobRef.update(update);
}
