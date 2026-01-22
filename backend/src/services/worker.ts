/**
 * Worker Service
 * Orchestrates video analysis with simple, sequential processing
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

/**
 * Process a job sequentially
 * 
 * This is intentionally simple:
 * 1. Upload to Gemini
 * 2. Run each module one at a time
 * 3. Write all results at once
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

        // 5. Process modules SEQUENTIALLY
        const results: AnalysisResults = {};
        const totalModules = modules.length;
        const language = outputLanguage;

        for (let i = 0; i < modules.length; i++) {
            const moduleName = modules[i];
            const baseProgress = 25 + Math.floor((i / totalModules) * 65);

            await updateProgress(jobRef, moduleName, baseProgress, `Analyzing ${moduleName}...`);
            await updateModuleStatus(jobRef, moduleName, 'processing', 0);

            try {
                const moduleResult = await runModule(
                    moduleName,
                    geminiFileUri,
                    job.input.gcsUri,
                    job.input.mimeType,
                    job.input.duration,
                    results,
                    language
                );

                results[moduleName] = moduleResult;
                await updateModuleStatus(jobRef, moduleName, 'completed', 100);

                console.log(`[Worker] ✓ ${moduleName} complete`);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[Worker] ✗ ${moduleName} failed:`, message);

                results[moduleName] = { error: message };
                await updateModuleStatus(jobRef, moduleName, 'failed', 0, message);

                // Continue with other modules - partial results are OK
            }
        }

        // 6. Post-process results before writing
        console.log(`[Worker] Post-processing results...`);

        // 6a. Validate all timecodes against video duration
        const validatedResults = validateResults(results, job.input.duration);

        // 6b. Match speaker names from graphics to transcript
        if (validatedResults.transcription && validatedResults.graphics) {
            validatedResults.transcription = matchSpeakersToNames(
                validatedResults.transcription,
                validatedResults.graphics
            );
        }

        // 6c. Sanitize for Firestore (remove any remaining undefined values)
        const sanitizedResults = sanitizeForFirestore(validatedResults);

        // 7. Write all results atomically
        await jobRef.update({
            status: 'completed',
            results: sanitizedResults,
            'progress.overall': 100,
            'progress.currentModule': 'done',
            completedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });

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
 * Run a single analysis module
 */
async function runModule(
    moduleName: ModuleName,
    geminiFileUri: string,
    gcsUri: string,
    mimeType: string,
    duration: number,
    results: AnalysisResults,
    language: string = 'English'
): Promise<any> {
    switch (moduleName) {
        case 'transcription':
            return gemini.transcribe(geminiFileUri, mimeType, duration);

        case 'shotList':
            // Shot detection uses Video Intelligence API (requires GCS URI)
            // Then enrichment uses Gemini
            const rawShots = await videoIntel.detectShots(gcsUri);

            if (rawShots.length === 0) {
                return { shots: [], totalShots: 0 };
            }

            // Enrich with Gemini descriptions in detected language
            const enrichedShots = await gemini.enrichShots(
                geminiFileUri,
                mimeType,
                rawShots,
                language
            );

            return { shots: enrichedShots, totalShots: enrichedShots.length };

        case 'synopsis':
            return gemini.generateSynopsis(geminiFileUri, mimeType, {
                titleMaxChars: 60,
                loglineMaxWords: 30,
                summaryMaxWords: 100,
                language: language
            });

        case 'fauna':
            return gemini.detectFauna(geminiFileUri, mimeType, {
                primaryLanguage: language,
                secondaryLanguage: language === 'German' ? 'English' : 'German'
            });

        case 'graphics':
            return gemini.detectGraphics(geminiFileUri, mimeType, duration);

        case 'cast':
            return gemini.detectCast(geminiFileUri, mimeType);

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
