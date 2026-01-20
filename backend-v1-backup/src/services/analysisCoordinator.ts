import { Storage } from '@google-cloud/storage';
import { getGenAIClient } from './genaiClient';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { db } from '../config/firebase';
import { config } from '../config/env';
import { JobDocument, FullAnalysisResult } from '../types';
import * as geminiService from './geminiService';
import * as videoIntelligenceService from './videoIntelligenceService';
import { logger } from '../utils/logger';
import { pipeline } from 'stream/promises';
import { getCacheManager } from './contextCacheManager';

// Feature flags - controlled via environment variables
const USE_CONTEXT_CACHING = process.env.USE_CONTEXT_CACHING === 'true';

const storage = new Storage();

/**
 * Main Orchestrator for Video Analysis.
 */
export async function performAnalysis(jobId: string, job: JobDocument): Promise<Partial<FullAnalysisResult>> {
    logger.info(`Starting Analysis Coordinator for Job ${jobId}`);

    const { gcsUri, analysisConfig } = job.input;
    let geminiFileUri: string | null = null;
    let geminiFileName: string | null = null;
    const results: Partial<FullAnalysisResult> = {};

    // Check if gcsUri is already a Gemini File URI (from module processor)
    const isGeminiUri = gcsUri.startsWith('https://generativelanguage.googleapis.com');
    console.log(`[Coordinator] Input URI type: ${isGeminiUri ? 'Gemini File URI' : 'GCS URI'}`);

    try {
        // 1. PREPARATION: Stream to Gemini (if needed)
        // IMPORTANT: Include videoIntelligence so shot enrichment has access to geminiFileUri
        const needsGemini = analysisConfig.synopsis || analysisConfig.fauna ||
            analysisConfig.graphics || analysisConfig.transcription || analysisConfig.cast ||
            analysisConfig.videoIntelligence; // Required for shot enrichment

        if (needsGemini) {
            if (isGeminiUri) {
                // Already a Gemini URI - use directly, no upload needed
                console.log(`[Coordinator] Using existing Gemini File URI directly`);
                geminiFileUri = gcsUri;
                // Extract filename from URI for cleanup if needed
                const match = gcsUri.match(/files\/([^?]+)/);
                geminiFileName = match ? `files/${match[1]}` : null;
            } else {
                // GCS URI - need to upload to Gemini
                await updateProgress(jobId, 'preparing', 5, 'Streaming video from GCS to Gemini...');

                const uploadResult = await streamGcsToGeminiChunked(gcsUri, job.input.mimeType || 'video/mp4', config.geminiApiKey || '', jobId);

                geminiFileUri = uploadResult.uri;
                geminiFileName = uploadResult.name;

                await updateProgress(jobId, 'preparing', 15, 'Waiting for Gemini processing...');
                await waitForGeminiFileActive(geminiFileName);
            }
        }



        // 2. MODULE EXECUTION
        // Determine execution strategy based on video duration
        // DEBUG: Lowered to 60s (1 min) for easier testing - change back to 600 for production
        const LONG_VIDEO_THRESHOLD_SECONDS = 600; // 10 minutes - production value
        const videoDuration = job.input.duration || 0;
        const isLongVideo = videoDuration > LONG_VIDEO_THRESHOLD_SECONDS;

        console.log(`[Coordinator] Video duration: ${videoDuration}s (${Math.round(videoDuration / 60)}min), Mode: ${isLongVideo ? 'SEQUENTIAL' : 'PARALLEL'}`);

        // 2a. CONTEXT CACHING (Optional, controlled by feature flag)
        let cacheName: string | null = null;
        if (USE_CONTEXT_CACHING && geminiFileUri) {
            try {
                console.log(`[Coordinator] Context caching ENABLED, creating cache...`);
                const cache = await getCacheManager().createVideoCache(jobId, geminiFileUri, {
                    ttlSeconds: isLongVideo ? 7200 : 3600,
                    displayName: `job-${jobId}`
                });
                cacheName = cache.name;
                console.log(`[Coordinator] ✓ Using cached context: ${cacheName}`);
            } catch (e: any) {
                console.warn(`[Coordinator] Cache creation failed, using direct upload:`, e.message);
                // cacheName stays null → existing code path runs
            }
        } else if (geminiFileUri) {
            console.log(`[Coordinator] Context caching DISABLED (USE_CONTEXT_CACHING=${USE_CONTEXT_CACHING})`);
        }


        // Collect task factories (functions that return promises) - NOT immediately executing
        const taskFactories: Array<{ name: string, run: () => Promise<any> }> = [];

        // --- A. Video Intelligence (Pro Mode) ---
        // GUARD: Video Intelligence API ONLY works with gs:// URIs, not Gemini File URIs
        const hasValidGcsUri = gcsUri && gcsUri.startsWith('gs://');
        console.log(`[VI-FLOW] Step 1: hasValidGcsUri=${hasValidGcsUri}, analysisConfig.videoIntelligence=${analysisConfig.videoIntelligence}`);
        console.log(`[VI-FLOW] gcsUri=${gcsUri?.substring(0, 80)}`);

        if (analysisConfig.videoIntelligence && hasValidGcsUri) {
            console.log(`[VI-FLOW] Step 2: ENTERING Video Intelligence block`);
            taskFactories.push({
                name: 'shotList', run: async () => {
                    try {
                        console.log(`[VI-FLOW] Step 3: Calling updateModuleStatus processing`);
                        await updateModuleStatus(jobId, 'shotList', 'processing', 0);

                        // 1. Get raw annotations
                        console.log(`[VI-FLOW] Step 4: Calling annotateVideo API...`);
                        const result = await videoIntelligenceService.annotateVideo(gcsUri, ['SHOT_CHANGE_DETECTION'] as any);
                        console.log(`[VI-FLOW] Step 5: annotateVideo returned. Result type: ${typeof result}`);
                        console.log(`[VI-FLOW] Step 5b: Result keys: ${Object.keys(result || {}).join(', ')}`);

                        // 2. Transform into Frontend-Ready "Shot" Objects
                        console.log(`[VI-FLOW] Step 6: Calling mapVideoIntelligenceToShots...`);
                        const formattedShots = mapVideoIntelligenceToShots(result, job.input.duration || 0);
                        console.log(`[VI-FLOW] Step 7: mapVideoIntelligenceToShots returned. Length: ${formattedShots?.length || 0}`);
                        console.log(`[VI-FLOW] Step 7b: formattedShots type: ${typeof formattedShots}, isArray: ${Array.isArray(formattedShots)}`);

                        if (formattedShots && formattedShots.length > 0) {
                            console.log(`[VI-FLOW] Step 7c: First shot: ${JSON.stringify(formattedShots[0])}`);
                        }

                        // 3. ENRICH shots with Gemini descriptions (if we have a Gemini file URI)
                        let enrichedShots = formattedShots;
                        console.log(`[VI-FLOW] Step 7d-check: geminiFileUri=${geminiFileUri ? 'SET' : 'NULL'}, formattedShots.length=${formattedShots?.length || 0}`);
                        if (geminiFileUri && formattedShots && formattedShots.length > 0) {
                            console.log(`[VI-FLOW] Step 7d: Enriching ${formattedShots.length} shots with Gemini descriptions...`);
                            console.log(`[VI-FLOW] Step 7d2: geminiFileUri = ${geminiFileUri.substring(0, 80)}...`);
                            try {
                                enrichedShots = await geminiService.enrichShotList(
                                    geminiFileUri,
                                    job.input.mimeType || 'video/mp4',
                                    formattedShots,
                                    'English',
                                    { cacheName }  // Pass cached context
                                );
                                console.log(`[VI-FLOW] Step 7e: Enrichment complete. enrichedShots.length: ${enrichedShots?.length || 0}`);
                                // Check if enrichment actually worked (descriptions are not placeholder)
                                const sampleDesc = enrichedShots?.[0]?.description || '';
                                const isPlaceholder = sampleDesc.includes('Auto-detected') || sampleDesc.startsWith('Shot ');
                                console.log(`[VI-FLOW] Step 7f: Sample description: "${sampleDesc.substring(0, 60)}..." isPlaceholder: ${isPlaceholder}`);
                            } catch (enrichError: any) {
                                console.warn(`[VI-FLOW] ⚠️ Shot enrichment failed, using basic descriptions.`);
                                console.warn(`[VI-FLOW] Enrichment error name: ${enrichError.name}`);
                                console.warn(`[VI-FLOW] Enrichment error message: ${enrichError.message}`);
                                console.warn(`[VI-FLOW] Enrichment error code: ${enrichError.code || 'none'}`);
                            }
                        }

                        // 4. Assign to Results
                        console.log(`[VI-FLOW] Step 8: Assigning to results.shotList...`);
                        results.shotList = enrichedShots;
                        console.log(`[VI-FLOW] Step 9: ASSIGNED! results.shotList exists: ${!!results.shotList}, length: ${results.shotList?.length || 0}`);
                        console.log(`[VI-FLOW] Step 9b: results object keys after assignment: ${Object.keys(results).join(', ')}`);

                        console.log(`[VI-FLOW] Step 10: Calling updateModuleStatus completed...`);
                        await updateModuleStatus(jobId, 'shotList', 'completed', 100);
                        console.log(`[VI-FLOW] Step 11: ✓✓✓ VIDEO INTELLIGENCE COMPLETE ✓✓✓`);
                    } catch (e: any) {
                        console.log(`[VI-FLOW] ✗✗✗ ERROR in VI block: ${e.message}`);
                        console.log(`[VI-FLOW] Error stack: ${e.stack?.substring(0, 500)}`);
                        logger.error("Video Intelligence Failed", e);
                        await updateModuleStatus(jobId, 'shotList', 'failed', 0, e.message);
                    }
                }
            });
            console.log(`[VI-FLOW] Step 2b: VI task added to taskFactories. taskFactories.length=${taskFactories.length}`);
        } else if (analysisConfig.videoIntelligence && !hasValidGcsUri) {
            // Skip Video Intelligence if no valid GCS URI (e.g., only Gemini File URI available)
            console.log(`[Coordinator] Skipping Video Intelligence - no valid GCS URI (got: ${gcsUri?.substring(0, 60)}...)`);
            await updateModuleStatus(jobId, 'shotList', 'skipped', 0, 'Video not in GCS - shot detection skipped');
        }

        // --- B. Gemini Modules ---
        console.log(`[Coordinator] geminiFileUri = ${geminiFileUri}`);
        console.log(`[Coordinator] analysisConfig.synopsis = ${analysisConfig.synopsis}`);
        console.log(`[Coordinator] analysisConfig.fauna = ${analysisConfig.fauna}`);
        console.log(`[Coordinator] analysisConfig.graphics = ${analysisConfig.graphics}`);
        console.log(`[Coordinator] analysisConfig.transcription = ${analysisConfig.transcription}`);
        if (geminiFileUri) {
            // 1. Synopsis
            if (analysisConfig.synopsis) {
                taskFactories.push({
                    name: 'synopsis', run: () => runModule(jobId, 'synopsis', async () => {
                        const analysis = await geminiService.analyzeVideoContent(
                            geminiFileUri!, job.input.mimeType || 'video/mp4',
                            { cacheName }  // Pass cached context
                        );
                        return geminiService.generateSynopsisFromAnalysis(
                            analysis, 'AI Writer', 'AI Director', 'English', '', job.input.analysisConfig as any
                        );
                    }, results)
                });
            }

            // 2. Fauna
            if (analysisConfig.fauna) {
                taskFactories.push({
                    name: 'fauna', run: () => runModule(jobId, 'fauna', async () => {
                        return geminiService.analyzeVideoForSpecies(
                            geminiFileUri!, job.input.mimeType || 'video/mp4',
                            'English', 'German', job.input.duration || 0,
                            { cacheName }  // Pass cached context
                        );
                    }, results)
                });
            }

            // 3. Graphics
            if (analysisConfig.graphics) {
                taskFactories.push({
                    name: 'graphics', run: () => runModule(jobId, 'graphics', async () => {
                        return geminiService.analyzeGraphicsAndLowerThirds(
                            geminiFileUri!, job.input.mimeType || 'video/mp4',
                            job.input.duration || 0, 'Unknown Title',
                            { cacheName }  // Pass cached context
                        );
                    }, results)
                });
            }

            // 4. Transcription
            if (analysisConfig.transcription) {
                taskFactories.push({
                    name: 'transcription', run: () => runModule(jobId, 'transcription', async () => {
                        return geminiService.transcribeMedia(
                            geminiFileUri!, job.input.mimeType || 'video/mp4',
                            job.input.duration || 0,
                            { cacheName }  // Pass cached context
                        );
                    }, results)
                });
            }
        }

        // 5. Cast/Bio (Analyze video for visible people)
        console.log(`[CAST-DEBUG] ════════════════════════════════════════════════════`);
        console.log(`[CAST-DEBUG] Checking cast module`);
        console.log(`[CAST-DEBUG] analysisConfig.cast = ${analysisConfig.cast}`);
        console.log(`[CAST-DEBUG] geminiFileUri = ${geminiFileUri ? geminiFileUri.substring(0, 60) + '...' : 'NULL'}`);
        console.log(`[CAST-DEBUG] ════════════════════════════════════════════════════`);

        if (analysisConfig.cast && geminiFileUri) {
            const castTaskFactory = {
                name: 'cast',
                run: async () => {
                    console.log(`[CAST-DEBUG] ▶ Cast module STARTING...`);
                    console.log(`[CAST-DEBUG] Calling updateModuleStatus(processing)...`);
                    await updateModuleStatus(jobId, 'cast', 'processing', 0);

                    try {
                        const mimeType = job.input.mimeType || 'video/mp4';
                        console.log(`[CAST-DEBUG] mimeType: ${mimeType}`);
                        console.log(`[CAST-DEBUG] cacheName: ${cacheName || 'NONE'}`);
                        console.log(`[CAST-DEBUG] Calling geminiService.analyzeTalent()...`);

                        const startTime = Date.now();
                        const talent = await geminiService.analyzeTalent(
                            geminiFileUri as string,
                            mimeType,
                            cacheName ? { cacheName } : undefined
                        );
                        const duration = Date.now() - startTime;

                        console.log(`[CAST-DEBUG] ✓ analyzeTalent returned in ${duration}ms`);
                        console.log(`[CAST-DEBUG] talent type: ${typeof talent}`);
                        console.log(`[CAST-DEBUG] talent isArray: ${Array.isArray(talent)}`);
                        console.log(`[CAST-DEBUG] talent length: ${Array.isArray(talent) ? talent.length : 'N/A'}`);

                        if (Array.isArray(talent) && talent.length > 0) {
                            console.log(`[CAST-DEBUG] First talent entry:`, JSON.stringify(talent[0], null, 2));
                            // Validate Bio interface compatibility
                            const first = talent[0];
                            console.log(`[CAST-DEBUG] Bio interface check:`);
                            console.log(`[CAST-DEBUG]   - name: ${first.name ? '✓' : '✗ MISSING'}`);
                            console.log(`[CAST-DEBUG]   - fullName: ${first.fullName ? '✓' : '✗ MISSING'}`);
                            console.log(`[CAST-DEBUG]   - title: ${first.title ? '✓' : '✗ MISSING'}`);
                            console.log(`[CAST-DEBUG]   - biography: ${first.biography ? '✓' : '✗ MISSING'}`);
                        } else if (Array.isArray(talent) && talent.length === 0) {
                            console.log(`[CAST-DEBUG] ⚠ No talent detected in video (empty array)`);
                        } else {
                            console.log(`[CAST-DEBUG] ⚠ Unexpected response type:`, typeof talent);
                        }

                        results.cast = talent;
                        console.log(`[CAST-DEBUG] Assigned to results.cast`);
                        console.log(`[CAST-DEBUG] results.cast exists: ${!!results.cast}`);
                        console.log(`[CAST-DEBUG] results.cast length: ${(results.cast as any[])?.length}`);

                        await updateModuleStatus(jobId, 'cast', 'completed', 100);
                        console.log(`[CAST-DEBUG] ✓✓✓ Cast module COMPLETED with ${talent.length} people ✓✓✓`);

                    } catch (e: any) {
                        console.error(`[CAST-DEBUG] ✗✗✗ Cast module FAILED ✗✗✗`);
                        console.error(`[CAST-DEBUG] Error name: ${e.name}`);
                        console.error(`[CAST-DEBUG] Error message: ${e.message}`);
                        console.error(`[CAST-DEBUG] Error code: ${e.code || 'none'}`);
                        console.error(`[CAST-DEBUG] Error stack: ${e.stack?.substring(0, 500)}`);
                        results.cast = [];
                        console.log(`[CAST-DEBUG] Set results.cast to empty array (fallback)`);
                        await updateModuleStatus(jobId, 'cast', 'completed', 100); // Complete anyway
                    }
                }
            };
            taskFactories.push(castTaskFactory);
            console.log(`[CAST-DEBUG] Cast task added to taskFactories`);
        } else if (analysisConfig.cast && !geminiFileUri) {
            console.log(`[CAST-DEBUG] Cast module requested but no Gemini file URI - skipping`);
            await updateModuleStatus(jobId, 'cast', 'skipped', 0);
        } else {
            console.log(`[CAST-DEBUG] Cast module not enabled in analysisConfig`);
        }

        // EXECUTE TASKS: Sequential for long videos, Parallel for short videos
        if (isLongVideo && taskFactories.length > 1) {
            // Sequential execution with delays to avoid rate limits
            console.log(`[Coordinator] Running ${taskFactories.length} modules SEQUENTIALLY with 3s delays...`);
            for (let i = 0; i < taskFactories.length; i++) {
                const task = taskFactories[i];
                console.log(`[Coordinator] Starting module: ${task.name}`);
                await task.run();
                // Add delay between modules (except after last)
                if (i < taskFactories.length - 1) {
                    console.log(`[Coordinator] Waiting 3s before next module...`);
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
        } else {
            // Parallel execution for short videos
            console.log(`[Coordinator] Running ${taskFactories.length} modules in PARALLEL...`);
            await Promise.all(taskFactories.map(t => t.run()));
        }
        // DEBUG: Log results before returning
        console.log(`[Coordinator] Returning results. Keys: ${Object.keys(results).join(', ')}`);
        if (results.cast) console.log(`[Coordinator] results.cast length: ${(results.cast as any[]).length}`);
        return results;

    } catch (error) {
        logger.error("Analysis Coordinator Critical Error", error);
        throw error;
    } finally {
        // Only delete if we uploaded the file ourselves (not when reusing existing Gemini URI)
        if (geminiFileName && !isGeminiUri) {
            try {
                const ai = getGenAIClient();
                await ai.files.delete({ name: geminiFileName });
                logger.info(`Deleted Gemini file: ${geminiFileName}`);
            } catch (e) {
                logger.warn(`Failed to delete Gemini file: ${geminiFileName}`, e);
            }
        }
    }
}

// Helper to standardise module execution & error handling
async function runModule(jobId: string, moduleName: string, action: () => Promise<any>, resultsObj: any) {
    console.log(`[GEMINI-MODULE] ▶ Starting ${moduleName}...`);
    try {
        await updateModuleStatus(jobId, moduleName, 'processing', 0);
        console.log(`[GEMINI-MODULE] Calling Gemini API for ${moduleName}...`);
        const res = await action();
        console.log(`[GEMINI-MODULE] ✓ ${moduleName} API returned. Has data: ${!!res}`);
        if (res) {
            console.log(`[GEMINI-MODULE] ${moduleName} result type: ${typeof res}, keys: ${Object.keys(res || {}).join(', ')}`);
        }
        resultsObj[moduleName] = res;
        await updateModuleStatus(jobId, moduleName, 'completed', 100);
        console.log(`[GEMINI-MODULE] ✓✓ ${moduleName} COMPLETED ✓✓`);
    } catch (e: any) {
        console.log(`[GEMINI-MODULE] ✗✗ ${moduleName} FAILED ✗✗`);
        console.log(`[GEMINI-MODULE] Error name: ${e.name}`);
        console.log(`[GEMINI-MODULE] Error message: ${e.message}`);
        console.log(`[GEMINI-MODULE] Error stack: ${e.stack?.substring(0, 800)}`);
        logger.error(`Module ${moduleName} Failed`, e);
        await updateModuleStatus(jobId, moduleName, 'failed', 0, e.message);
    }
}

// ---------------------------------------------------------------------------
// STREAMING UPLOAD IMPLEMENTATION
// ---------------------------------------------------------------------------

const GEMINI_CHUNK_SIZE = 32 * 1024 * 1024; // 32MB

async function streamGcsToGeminiChunked(
    gcsUri: string,
    mimeType: string,
    apiKey: string,
    jobId?: string
): Promise<{ name: string; uri: string }> {
    const matches = gcsUri.match(/gs:\/\/([^\/]+)\/(.+)/);
    if (!matches) throw new Error(`Invalid GCS URI: ${gcsUri}`);

    const bucket = storage.bucket(matches[1]);
    const gcsFile = bucket.file(matches[2]);
    const [metadata] = await gcsFile.getMetadata();
    const fileSize = parseInt(metadata.size as string, 10);

    // 1. Initialize resumable session
    const initRes = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': fileSize.toString(),
                'X-Goog-Upload-Header-Content-Type': mimeType,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ file: { display_name: matches[2] } })
        }
    );

    const uploadUrl = initRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error('No upload URL received from Gemini.');

    // 2. Upload in chunks with progress
    const totalChunks = Math.ceil(fileSize / GEMINI_CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * GEMINI_CHUNK_SIZE;
        const end = Math.min(start + GEMINI_CHUNK_SIZE, fileSize);
        const isLast = i === totalChunks - 1;

        // Read chunk from GCS
        // Note: Explicitly handling buffer memory
        let chunkBuffer: Buffer | null = await readGcsRange(gcsFile, start, end - 1);

        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Command': isLast ? 'upload, finalize' : 'upload',
                'X-Goog-Upload-Offset': start.toString(),
                'Content-Length': chunkBuffer.length.toString(),
            },
            // @ts-ignore
            body: chunkBuffer
        });

        // Memory Management: Clear buffer immediately after send
        chunkBuffer = null;

        if (!response.ok) throw new Error(`Gemini Chunk Upload ${i} failed: ${response.status}`);

        // Update progress
        if (jobId) {
            const pct = Math.round((end / fileSize) * 100);
            // Map upload progress to 5-25% of overall progress
            await updateProgress(jobId, 'preparing', 5 + (pct * 0.20), `Uploading to AI: ${pct}%`);
        }

        if (isLast) {
            const result = await response.json();
            // @ts-ignore
            return result.file;
        }
    }

    throw new Error('Gemini Upload failed to finalize.');
}

async function readGcsRange(file: any, start: number, end: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const stream = file.createReadStream({ start, end });
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

// Optimized Waiter with 60m Timeout
async function waitForGeminiFileActive(name: string) {
    logger.info(`Waiting for Gemini file ${name} to be ACTIVE...`);
    const startTime = Date.now();
    const TIMEOUT_MS = 60 * 60 * 1000; // Increased to 60 Minutes (Fix 2)

    const ai = getGenAIClient();
    let file = await ai.files.get({ name });
    while (file.state === 'PROCESSING') {
        if (Date.now() - startTime > TIMEOUT_MS) throw new Error(`Timeout waiting for Gemini processing on ${name}`);
        await new Promise(r => setTimeout(r, 5000)); // 5s poll
        file = await ai.files.get({ name });
    }
    if (file.state === 'FAILED') throw new Error("Gemini Processing Failed");
    logger.info("Gemini File ACTIVE");
}

async function updateProgress(jobId: string, stage: string, percentage: number, message: string) {
    await db.collection('jobs').doc(jobId).update({
        'progress.overall': percentage,
        'progress.currentStage': message,
        updatedAt: new Date()
    });
}

async function updateModuleStatus(jobId: string, module: string, status: string, progress: number, error?: string) {
    const update: any = { [`progress.modules.${module}.status`]: status, [`progress.modules.${module}.progress`]: progress };
    if (error) update[`progress.modules.${module}.error`] = error;
    await db.collection('jobs').doc(jobId).update(update);
}

export const canRunServerSide = (job: JobDocument) => {
    // If we have a GCS URI and a valid Job ID, we are authorized by the system
    // The Worker Service Account handles the Google API auth, not the user.
    return !!job.input.gcsUri;
};

// ---------------------------------------------------------------------------
// DATA MAPPING HELPERS
// ---------------------------------------------------------------------------

function mapVideoIntelligenceToShots(result: any, duration: number): any[] {
    // DEBUG: Log what Video Intelligence actually returns
    console.log(`[VI-DEBUG] Result keys: ${Object.keys(result || {}).join(', ')}`);
    console.log(`[VI-DEBUG] shotAnnotations exists: ${!!result?.shotAnnotations}, length: ${result?.shotAnnotations?.length || 0}`);
    console.log(`[VI-DEBUG] shotChangeAnnotations exists: ${!!result?.shotChangeAnnotations}, length: ${result?.shotChangeAnnotations?.length || 0}`);

    if (!result.shotAnnotations && !result.shotChangeAnnotations) {
        console.log(`[VI-DEBUG] No shot annotations found in response!`);
        return [];
    }

    // Some versions use shotAnnotations, others shotChangeAnnotations
    const shotsRaw = result.shotAnnotations || result.shotChangeAnnotations || [];
    console.log(`[VI-DEBUG] Processing ${shotsRaw.length} shots`);

    return shotsRaw.map((shot: any, index: number) => {
        // VI API returns "10s" or "10.5s" strings
        const startSec = parseOffset(shot.startTimeOffset);
        const endSec = parseOffset(shot.endTimeOffset);
        const shotDuration = endSec - startSec;

        if (index === 0) {
            console.log(`[VI-DEBUG] First shot raw:`, JSON.stringify(shot));
            console.log(`[VI-DEBUG] First shot parsed: start=${startSec}, end=${endSec}`);
        }

        return {
            tcIn: secondsToTimecode(startSec),
            tcOut: secondsToTimecode(endSec),
            duration: secondsToTimecode(shotDuration),
            description: `Shot ${index + 1} (Auto-detected)`,
            action: "Visual scene change detected",
            audio: "", // VI API doesn't give audio context in this mode
        };
    });
}

function parseOffset(offset: any): number {
    if (!offset) return 0;

    // Handle object format from Video Intelligence API: {seconds: "10", nanos: 500000000}
    if (typeof offset === 'object') {
        const seconds = parseFloat(offset.seconds || '0');
        const nanos = parseFloat(offset.nanos || '0');
        return seconds + (nanos / 1000000000);
    }

    // Handle string format like "12.345s"
    if (typeof offset === 'string') {
        return parseFloat(offset.replace('s', ''));
    }

    // Handle number directly
    if (typeof offset === 'number') {
        return offset;
    }

    return 0;
}

function secondsToTimecode(totalSeconds: number, frameRate: number = 25): string {
    if (isNaN(totalSeconds)) return "00:00:00:00";

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.round((totalSeconds % 1) * frameRate);

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}
