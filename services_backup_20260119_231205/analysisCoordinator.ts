import {
    annotateVideo,
    VideoAnnotationResults,
    Feature
} from './googleVideoIntelligenceService';
import { uploadFileToGCS } from './gcsUploadService';
import { enrichShotList, generateShotList, transcribeMedia, analyzeVideoContent, generateSynopsisFromAnalysis, generateSynopsisFromText, generateBio, extractTalentFromVideo, analyzeGraphicsAndLowerThirds, analyzeVideoForSpecies, createContextCache } from './geminiService';
import { smartUploadToGemini } from './uploadService';
import { AnalysisMode, Shot, UploadProgress, SynopsisConfig, BioConfig, GraphicsConfig, FaunaConfig, ShotListConfig, VideoMetadata, DEFAULT_SHOTLIST_CONFIG, DEFAULT_SYNOPSIS_CONFIG } from '../types';
import { secondsToTimecode, secondsToDropFrameTimecode, detectTimecodeFormat } from '../utils/tableUtils';
import { BackendApiService } from './backendApiService';

// Types for the coordinated result
export interface CoordinatedAnalysisResult {
    shots?: Omit<Shot, 'nr' | 'thumbnail'>[];
    transcription?: any; // To be defined
    metadata?: any;
    rawApiResult?: VideoAnnotationResults;
}

interface AnalysisOptions {
    file: File;
    fileUri?: string;
    mode: AnalysisMode;
    apiKey: string;
    accessToken?: string; // OAuth Token
    projectId?: string; // Quota Project ID
    bucketName?: string;
    useProMode?: boolean; // Toggle for Zero Hallucination (true) or Standard (false)
    tokenIsValid?: boolean; // Gatekeeper: prevent backend usage if token is expired
    onProgress: (message: string, percentage: number) => void;
    onMultiProgress?: (mode: AnalysisMode, message: string, percentage: number) => void; // New: For parallel job updates
    signal?: AbortSignal;
    synopsisConfig?: SynopsisConfig;
    bioConfig?: BioConfig;
    graphicsConfig?: GraphicsConfig;
    faunaConfig?: FaunaConfig;
    shotListConfig?: ShotListConfig;
    videoMetadata?: VideoMetadata | null;
}

/**
 * Orchestrates the analysis workflow based on the selected mode.
 * - For Deterministic tasks (Shots, Transcription), uses Video Intelligence API (requires GCS).
 * - For Creative tasks (Synopsis, Bio, Fauna), uses Gemini API (can use File API).
 */
export async function performAnalysis(options: AnalysisOptions): Promise<any> {
    const { file, fileUri, mode, apiKey, accessToken, projectId, bucketName, tokenIsValid, onProgress, onMultiProgress, signal, videoMetadata } = options;

    // ═══════════════════════════════════════════════════════════════════════════════
    // STRATEGY: CLOUD RUN BACKEND (Full Analysis)
    // ═══════════════════════════════════════════════════════════════════════════════
    // We prefer the backend if:
    // 1. Mode is 'full_analysis' (Backend is optimized for this)
    // 2. We have GCS Access (Backend requires GCS URI)
    // 3. The Auth Token is VALID (Strict check to prevent 401 hangs)
    const canUseBackend = mode === 'full_analysis' && accessToken && bucketName && tokenIsValid;

    if (canUseBackend) {
        try {
            console.log("[Coordinator] Attempting Cloud Run Backend...");
            let gcsUri = fileUri;

            // 1. Ensure File is in GCS
            if (!gcsUri || !gcsUri.startsWith('gs://')) {
                // BUG FIX: Recent Uploads (Mock Files with size 0) cannot be re-uploaded to GCS.
                // We must perform this check BEFORE attempting upload.
                if (file.size === 0) {
                    console.warn("[Coordinator] Backend skipped: Cannot upload 'Restored File' to GCS (File content unavailable). Falling back to Client-Side.");
                    throw new Error("Cannot upload Virtual File (0 bytes) to Backend.");
                }

                console.log("[Coordinator] Backend path: ensuring GCS upload...");
                onProgress('Uploading to Cloud Storage (Zero Hallucination)...', 0);
                gcsUri = await uploadFileToGCS({
                    file,
                    bucketName: bucketName!,
                    apiKey,
                    accessToken: accessToken!,
                    onProgress: (p: UploadProgress) => {
                        onProgress(p.message, p.percentage * 0.2); // First 20% is upload
                    },
                    signal
                });
            } else {
                onProgress('File already in Cloud Storage...', 20);
            }

            // 2. Submit Job (pass Gemini URI if available)
            onProgress('Dispatching to Backend Workers...', 25);
            console.log(`[Coordinator] DEBUG - gcsUri: ${gcsUri?.substring(0, 50)}...`);
            console.log(`[Coordinator] DEBUG - fileUri (gemini): ${fileUri?.substring(0, 50)}...`);
            const jobId = await BackendApiService.createJob(gcsUri, file.type, videoMetadata?.duration, fileUri);
            console.log(`[Coordinator] Job Created: ${jobId}`);

            // 3. Poll for Completion using backend service
            // 3. Poll for Completion using backend service
            // Robust Polling Plan with Safety Guards:
            // - Exponential Backoff: Start 2s, max 10s.
            // - Visibility Awareness: If hidden, poll slower (every 30s) or pause.
            // - Jitter: Randomize interval slightly.
            // - Timeouts: Max 90 mins total, Max 20 consecutive network failures.

            let attempt = 0;
            let consecutiveErrors = 0;
            const startTime = Date.now();

            const MAX_BACKOFF = 10000;
            const BASE_INTERVAL = 2000;
            const JOB_TIMEOUT = 180 * 60 * 1000; // 180 minutes (Audit Fix 2)
            const MAX_CONSECUTIVE_ERRORS = 20; // If network fails 20 times in a row, give up.

            while (true) {
                if (signal?.aborted) throw new Error('Operation Cancelled');

                // 1. Global Timeout Check
                if (Date.now() - startTime > JOB_TIMEOUT) {
                    throw new Error("Analysis timed out (90 minutes limit reached). The job may still be running on the backend, but the frontend has stopped monitoring.");
                }

                // 2. Offline Guard (Laptop Sleep / Disconnect Handling)
                // You are right: If the job is in the cloud, we shouldn't fail just because the laptop slept.
                // If we are offline, we PAUSE polling (don't error out) and wait for the user to return.
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    console.log("[Coordinator] Offline detected (Laptop sleep?). Pausing poll...");
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue; // Skip this iteration, don't increment failure stats
                }

                // 3. Visibility Check (Browser Tab Throttling Mitigation)
                const isHidden = typeof document !== 'undefined' && document.hidden;

                try {
                    const job = await BackendApiService.getJob(jobId);

                    // Acknowledge "still alive" - Reset error counters
                    attempt = 0;
                    consecutiveErrors = 0;

                    // Map Module Progress to UI
                    if (job.progress?.modules) {
                        const m = job.progress.modules;
                        if (onMultiProgress) {
                            if (m.fauna) onMultiProgress('fauna', m.fauna.status === 'completed' ? 'Done' : m.fauna.status, m.fauna.progress);
                            if (m.transcription) onMultiProgress('transcribe', m.transcription.status === 'completed' ? 'Done' : 'Processing', m.transcription.progress);
                            if (m.shotList) onMultiProgress('shotlist', m.shotList.status === 'completed' ? 'Done' : 'Processing', m.shotList.progress);
                            if (m.synopsis) onMultiProgress('synopsis', m.synopsis.status === 'completed' ? 'Done' : 'Processing', m.synopsis.progress);
                            if (m.graphics) onMultiProgress('graphics', m.graphics.status === 'completed' ? 'Done' : 'Processing', m.graphics.progress);
                            if (m.cast) onMultiProgress('bio', m.cast.status === 'completed' ? 'Done' : 'Processing', m.cast.progress);
                        }
                    }

                    // Update Overall Progress
                    // Map 0-100 backend progress to 25-100 frontend progress
                    const overall = 25 + ((job.progress?.overall || 0) * 0.75);
                    onProgress(job.progress?.currentStage || 'Processing on Cloud Run...', overall);

                    if (job.status === 'completed') {
                        if (!job.results && !job.hasSubcollections) throw new Error("Job completed but results are missing");
                        return job.results || {};
                    }

                    if (job.status === 'failed') {
                        throw new Error(job.error?.message || 'Backend processing failed');
                    }
                } catch (pollError: any) {
                    consecutiveErrors++;
                    console.warn(`[Coordinator] Poll failed (Attempt ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${pollError.message}`);

                    // Terminal Errors: Don't retry
                    if (pollError.message.includes('404') || pollError.message.includes('Not Found')) {
                        throw new Error(`Job ID ${jobId} not found on server. It may have expired or was never created.`);
                    }

                    // Consecutive Failure Limit
                    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                        throw new Error(`Connection lost. Failed to contact backend ${MAX_CONSECUTIVE_ERRORS} times in a row. Please check your internet connection.`);
                    }
                }

                // Adaptive Backoff
                // If hidden, poll rare (saving battery/resources and avoiding timeout buildup)
                // If we have errors, backoff AGGRESSIVELY to avoid spamming (up to 30s)
                let targetInterval = isHidden ? 30000 : Math.min(BASE_INTERVAL * Math.pow(1.5, attempt++), MAX_BACKOFF);

                // If we are in error state, wait longer
                if (consecutiveErrors > 0) targetInterval = Math.max(targetInterval, 5000);

                const jitter = Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, targetInterval + jitter));
            }

        } catch (backendError: any) {
            console.warn("[Coordinator] Backend Analysis failed. Falling back to Client-Side mode.", backendError);

            // Explicitly classify the error for debugging
            if (backendError?.message?.includes('401') || backendError?.message?.includes('403')) {
                console.warn("[Coordinator] Auth Error detected. Disabling Pro Mode for this session.");
            }

            onProgress(`Backend unavailable (${backendError?.message || 'Unknown'}). Switching to local mode...`, 10);
            options.useProMode = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // PROGRESS SMOOTHER
    // ═══════════════════════════════════════════════════════════════════════════════
    const smoothProgress = {
        current: 0,
        target: 0,
        timer: null as any,
        callback: onProgress,

        set(target: number, message?: string) {
            this.target = target;
            if (message) this.currentMessage = message;
            this.startTicker();
        },

        currentMessage: '',

        startTicker() {
            if (this.timer) return;
            this.timer = setInterval(() => {
                if (Math.abs(this.current - this.target) < 0.5) {
                    this.current = this.target;
                    this.callback(this.currentMessage, this.current);
                    clearInterval(this.timer);
                    this.timer = null;
                } else {
                    // Ease towards target (10% of remaining distance)
                    const step = (this.target - this.current) * 0.1;
                    // Ensure minimum movement of 0.1 to avoid Zeno's paradox infinite stall
                    this.current += step > 0 ? Math.max(step, 0.5) : Math.min(step, -0.5);
                    // Cap at target
                    if ((step > 0 && this.current > this.target) || (step < 0 && this.current < this.target)) {
                        this.current = this.target;
                    }
                    this.callback(this.currentMessage, this.current);
                }
            }, 50); // 20fps updates
        },

        stop() {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
        },

        // Immediate set without smoothing (for resets or 100%)
        setImmediate(target: number, message: string) {
            this.target = target;
            this.current = target;
            this.currentMessage = message;
            this.callback(message, target);
        }
    };

    // Use smoothProgress.set() instead of direct onProgress()
    // Helper to replace direct calls
    const updateProgress = (msg: string, pct: number) => smoothProgress.set(pct, msg);

    // Default to 24fps if metadata is unavailable
    const frameRate = videoMetadata?.frameRate || 24;

    // 1. Determine Strategy
    // Only use Video Intelligence if explicitly requested via Pro Mode AND supported mode (Shot List only now)
    // IMPORTANT: If we fell back from Backend, options.useProMode might have been disabled above.
    let needsVideoIntelligence = options.useProMode && (mode === 'shotlist' || mode === 'full_analysis');

    // 2. Logic Check: CAN we use Video Intelligence?
    // If this is a "Recent Upload" (Dummy File with size 0) and the URI is NOT already a GCS URI,
    // we cannot upload it to GCS. Thus, we must disable Pro Mode for this run.
    const isGcsUri = fileUri?.startsWith('gs://');
    const isDummyFile = file.size === 0;

    if (needsVideoIntelligence && isDummyFile && !isGcsUri) {
        console.warn("Pro Mode (Video Intelligence) unavailable for Recent Uploads (Source file not present). Falling back to Gemini.");
        needsVideoIntelligence = false;
        // Notify user via progress updates? We might want to, but console warn is minimal safety.
        // We'll let the standard fallback logic assume Gemini.
    }

    let gcsUri = fileUri;

    // Try GCS Upload if needed
    if (needsVideoIntelligence) {
        // Variable isGcsUri is already declared above
        if (!isGcsUri) {
            try {
                if (!bucketName) throw new Error('Bucket not configured');

                updateProgress('Uploading to Google Cloud Storage (Zero Hallucination)...', 0);
                gcsUri = await uploadFileToGCS({
                    file,
                    bucketName,
                    apiKey,
                    accessToken,
                    onProgress: (p: UploadProgress) => {
                        updateProgress(p.message, p.percentage * 0.3);
                    },
                    signal
                });
            } catch (error: any) {
                console.error("Pro Mode Upload Failed:", error);

                // Check for Auth specifics to give better error messages
                if (error?.message?.includes('403') || error?.message?.includes('scope')) {
                    throw new Error("Authentication Error: Missing 'Cloud Platform' scope. Please Sign Out and Sign In again.");
                }
                if (error?.message?.includes('401') || error?.message?.includes('Unauthenticated')) {
                    throw new Error("Pro Mode Session Expired. Please go to Settings and Sign In again.");
                }

                // For ANY other error (Network, 404, etc), BLOCK the fallback.
                // User explicitly asked for Pro Mode (needsVideoIntelligence).
                throw new Error(`Pro Mode Verification Failed: ${error.message || 'Unknown Upload Error'}. Please check your connection or re-select the file.`);
            }
        } else {
            updateProgress('File already in GCS. Starting analysis...', 35);
        }
    }

    // 3. OPTIONAL: Video Intelligence API (Structure/Skeleton)
    let apiResult: any = null;
    if (needsVideoIntelligence && gcsUri) {
        // Don't reset to 35 if we are already there, just start from there
        if (smoothProgress.current < 35) smoothProgress.setImmediate(35, 'Analyzing video structure (Deterministic)...');
        else updateProgress('Analyzing video structure (Deterministic)...', 35);

        let features: Feature[] = [];
        // COST OPTIMIZATION (Jan 2026): Removed LABEL_DETECTION and TEXT_DETECTION
        // - LABEL_DETECTION: Redundant with Gemini's video analysis (saves $0.10/min)
        // - TEXT_DETECTION: Redundant with Graphics module OCR (saves $0.10/min)
        // Only SHOT_CHANGE_DETECTION remains as it provides deterministic frame-accurate cuts
        if (mode === 'shotlist' || mode === 'full_analysis') features.push('SHOT_CHANGE_DETECTION');

        try {
            apiResult = await annotateVideo(
                apiKey,
                gcsUri,
                features,
                (progressPercent) => {
                    const overall = 35 + (progressPercent * 0.45);
                    updateProgress(`Video Intelligence API: ${Math.round(progressPercent)}%`, overall);
                },
                signal,
                accessToken,
                projectId
            );
        } catch (error) {
            console.warn("Video Intelligence Analysis failed (likely Auth 401), proceeding with Gemini Fallback:", error);
            onMultiProgress?.('shotlist', 'Shot Detection Skipped (VI unavailable)', 0);
        }
    }

    // 4. REQUIRED: Gemini Files API (Creative Content)
    // Ensure we have a workable URI for Gemini (not gs://)
    // isGcsUri is already calculated at function start
    let geminiUri = isGcsUri ? undefined : fileUri;

    // We strictly use smartUploadToGemini for ALL files now (up to 20GB supported by API)
    // The uploadService handles chunking and reliability.
    const canUseGeminiVision = true;

    if ((!geminiUri || isGcsUri) && canUseGeminiVision) {
        updateProgress('Uploading to Gemini Files API (Visual Enrichment- this may take a while for large files)...', 45);

        try {
            geminiUri = await smartUploadToGemini({
                file,
                apiKey,
                onProgress: (p: UploadProgress) => updateProgress(p.message, 45 + (p.percentage * 0.1)),
                signal
            });
        } catch (e) {
            console.warn("Gemini Upload Failed. Proceeding in Text-Only Mode.", e);
            // Fallthrough: geminiUri will be undefined, triggering fallbacks below.
        }
    }

    const abortSignal = signal || new AbortController().signal;

    // 5. EXECUTION (Unified)
    if (mode === 'full_analysis') {
        // COST OPTIMIZATION: Context Caching "Smart Check"
        let contextCacheName: string | undefined = undefined;
        // DISABLED: Context caching caused "blind model" hallucinations.
        // Reverting to standard non-cached flow for reliability.
        const isLargeFile = false; // file.size > 10 * 1024 * 1024;
        const isLongDuration = false; // (videoMetadata?.duration || 0) > 60;

        if (isLargeFile || isLongDuration) {
            updateProgress('Creating intelligent context cache (Cost Saving)...', 60);
            contextCacheName = await createContextCache(geminiUri!, file.type, 600);
            if (contextCacheName) {
                onMultiProgress?.('full_analysis' as AnalysisMode, 'Cache Active: ~80% Cost Reduction', 0);
            }
        }

        updateProgress('Running comprehensive analysis mostly in parallel...', 65);

        // 1. Transcription (Gemini Flash - Fast & Cheap)
        // 1. Transcription (Gemini Flash - Fast & Cheap) OR Video Intel (Ground Truth)
        const transcriptionPromise = (async () => {
            // OPTION A: Use Video Intelligence Result if available (Pro Mode)
            if (apiResult?.speechTranscriptions && apiResult.speechTranscriptions.length > 0) {
                onMultiProgress?.('transcribe', 'Using Pro Mode Transcript...', 100);
                // Convert VI format to App format
                const text = apiResult.speechTranscriptions
                    .map((st: any) => st.alternatives?.[0]?.transcript || '')
                    .join(' ');

                // TODO: Map words for speaker segments if needed. For now, simple text.
                return { segments: [], speakerMap: {}, text };
            }

            // OPTION B: Gemini Flash (Standard Mode)
            if (geminiUri) {
                try {
                    return await transcribeMedia(geminiUri!, file.type, abortSignal, (msg, pct) => onMultiProgress?.('transcribe', msg, pct), contextCacheName);
                } catch (e) {
                    console.warn('Transcription failed', e);
                    onMultiProgress?.('transcribe', 'Transcription failed', 0);
                    return { segments: [], speakerMap: {}, text: '' };
                }
            }

            return { segments: [], speakerMap: {}, text: '' };
        })();

        // 2. Shot List (VI + Enrichment OR Gemini Fallback)
        const shotsPromise = (async () => {
            // Priority 1: Use Video Intelligence (Pro Mode) if available
            if (apiResult?.shotAnnotations) {
                const enrichmentUri = geminiUri || "SKIP_ENRICHMENT";
                if (enrichmentUri === "SKIP_ENRICHMENT") {
                    onMultiProgress?.('shotlist', 'Visual enrichment skipped (Video > 2GB or Upload Failed)', 100);
                }
                return processShotList(apiResult, enrichmentUri, file.type, 'English', frameRate, signal, (msg, pct) => {
                    onMultiProgress?.('shotlist', msg, pct);
                }, contextCacheName);
            }

            // Priority 2: Fallback to Gemini-only Shotlist (Standard Mode)
            onMultiProgress?.('shotlist', 'Generating Shot List (Standard Mode)...', 10);
            try {
                if (!geminiUri) throw new Error("No video URI available (Upload failed or File too large)");
                const fullConfig = options.shotListConfig || { ...DEFAULT_SHOTLIST_CONFIG };
                return await generateShotList(
                    geminiUri!,
                    file.type,
                    fullConfig.language || 'English',
                    frameRate,
                    abortSignal,
                    (msg, pct) => onMultiProgress?.('shotlist', msg, pct),
                    contextCacheName,
                    (shots) => onMultiProgress?.('shotlist', `PARTIAL_RESULT:${JSON.stringify({ data: shots })}`, 0),
                    videoMetadata?.duration || 0
                );
            } catch (e) {
                console.error('[GEMINI_DEBUG] Gemini Shotlist Fallback failed with error:', e);
                const errorMessage = e instanceof Error ? e.message : String(e);
                onMultiProgress?.('shotlist', `Shot List Failed: ${errorMessage}`, 0);
                return [];
            }
        })();

        // 3. Synopsis (Creative - Gemini)
        // 3. Synopsis (Creative - Gemini)
        const synopsisPromise = (async () => {
            try {
                onMultiProgress?.('synopsis', 'Generating synopsis...', 10);
                const config: SynopsisConfig = options.synopsisConfig || DEFAULT_SYNOPSIS_CONFIG;

                // STRATEGY: Visual Analysis OR Text Fallback
                let analysis: any = null;

                if (geminiUri) {
                    // Standard Mode: Use Vision
                    analysis = await analyzeVideoContent(geminiUri!, file.type, abortSignal, (msg, pct) => onMultiProgress?.('synopsis', msg, pct * 0.5), contextCacheName);
                } else {
                    // Large File Mode / Fallback: Use Transcript
                    onMultiProgress?.('synopsis', 'Waiting for transcript (Large File Mode)...', 20);
                    const transcriptResult = await transcriptionPromise; // Wait for parallel task
                    if (transcriptResult.text && transcriptResult.text.length > 50) {
                        onMultiProgress?.('synopsis', 'Generating from transcript...', 50);
                        return generateSynopsisFromText(transcriptResult.text, config);
                    } else {
                        throw new Error("No video or transcript available for synopsis.");
                    }
                }

                onMultiProgress?.('synopsis', 'Writing creative summary...', 60);
                const result = await generateSynopsisFromAnalysis(analysis, config.writer || '', config.director || '', 'English', '', abortSignal, config);

                onMultiProgress?.('synopsis', 'Synopsis complete', 100);
                return result;
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : 'Unknown error';
                console.warn("Synopsis failed:", errorMessage);
                onMultiProgress?.('synopsis', `Synopsis failed: ${errorMessage}`, 0);
                return {
                    title: 'Analysis Unavailable',
                    writtenBy: '',
                    directedBy: '',
                    oneLine: `Analysis failed: ${errorMessage}`,
                    paragraph: '',
                    fullSynopsis: '',
                    keyThemes: '',
                    targetAudience: ''
                };
            }
        })();

        // 4. Bio (Creative - Gemini)
        // 4. Bio (Creative - Gemini)
        const bioPromise = (async () => {
            if (!geminiUri) {
                onMultiProgress?.('bio', 'Bio skipped (Video > 2GB)', 100);
                return [];
            }
            try {
                onMultiProgress?.('bio', 'Scanning for talent...', 10);
                const names = await extractTalentFromVideo(geminiUri!, file.type);
                const topNames = names.slice(0, 3);
                onMultiProgress?.('bio', `Found ${topNames.length} names`, 30);

                const bioResults = [];
                for (let i = 0; i < topNames.length; i++) {
                    const name = topNames[i];
                    const bio = await generateBio(name, 'Actor/Subject', 'English');
                    bioResults.push(bio);
                    onMultiProgress?.('bio', `PARTIAL_RESULT:${JSON.stringify({ data: [bio] })}`, 0);
                }
                onMultiProgress?.('bio', 'Bio generation complete', 100);
                return bioResults;
            } catch (e) {
                onMultiProgress?.('bio', 'Bio analysis failed', 0);
                return [];
            }
        })();

        // 5. Fauna (Creative - Gemini)
        // 5. Fauna (Creative - Gemini)
        const faunaPromise = (async () => {
            if (!geminiUri) {
                onMultiProgress?.('fauna', 'Fauna skipped (Video > 2GB)', 100);
                return [];
            }
            try {
                onMultiProgress?.('fauna', 'Identifiying species...', 30);
                const result = await analyzeVideoForSpecies(geminiUri!, file.type, 'English', 'German', videoMetadata?.duration || 0, undefined, (partialSightings) => {
                    onMultiProgress?.('fauna', `PARTIAL_RESULT:${JSON.stringify({ sightings: partialSightings })}`, 0);
                });
                onMultiProgress?.('fauna', 'Fauna analysis complete', 100);
                return result;
            } catch (e) {
                onMultiProgress?.('fauna', 'Fauna analysis failed', 0);
                return [];
            }
        })();

        // 6. Graphics (Creative - Gemini)
        // 6. Graphics (Creative - Gemini)
        const graphicsPromise = (async () => {
            if (!geminiUri) {
                onMultiProgress?.('graphics', 'Graphics skipped (Video > 2GB)', 100);
                return { programTitle: '', runtime: '', graphics: [], lowerThirds: [] };
            }
            try {
                onMultiProgress?.('graphics', 'Reading on-screen text...', 30);
                const result = await analyzeGraphicsAndLowerThirds(
                    geminiUri!,
                    file.type,
                    videoMetadata?.duration || 0,
                    file.name,
                    undefined,
                    (partialResult) => {
                        onMultiProgress?.('graphics', `PARTIAL_RESULT:${JSON.stringify(partialResult)}`, 0);
                    }
                );
                onMultiProgress?.('graphics', 'Graphics analysis complete', 100);
                return result;
            } catch (e) {
                onMultiProgress?.('graphics', 'Graphics analysis failed', 0);
                return { programTitle: '', runtime: '', graphics: [], lowerThirds: [] };
            }
        })();

        const [transcription, shots, synopsis, bio, fauna, graphics] = await Promise.all([
            transcriptionPromise,
            shotsPromise,
            synopsisPromise,
            bioPromise,
            faunaPromise,
            graphicsPromise
        ]);

        smoothProgress.stop(); // Stop ticker

        return {
            transcription,
            shotList: shots,
            graphics,
            synopsis,
            bio,
            fauna
        };

    } else if (mode === 'shotlist') {
        const fullConfig = options.shotListConfig || { ...DEFAULT_SHOTLIST_CONFIG };
        return generateShotList(
            geminiUri!,
            file.type,
            fullConfig.language || 'English',
            frameRate,
            abortSignal,
            (msg, pct) => updateProgress(msg, 50 + (pct * 0.5)),
            undefined,
            (shots) => updateProgress(`PARTIAL_RESULT:${JSON.stringify({ data: shots })}`, 0),
            videoMetadata?.duration || 0
        );
    } else if (mode === 'transcribe') {
        return transcribeMedia(
            geminiUri!,
            file.type,
            abortSignal,
            (msg, pct) => updateProgress(msg, 50 + (pct * 0.5))
        );
    } else if (mode === 'synopsis') {
        const config = options.synopsisConfig!;
        const analysis = await analyzeVideoContent(geminiUri!, file.type, abortSignal, (msg, pct) => updateProgress(msg, 20 + pct * 0.4));
        updateProgress('Generating synopsis...', 80);
        return generateSynopsisFromAnalysis(analysis, config.writer || '', config.director || '', config.language || 'English', config.keywords || '', abortSignal, config);
    } else if (mode === 'bio') {
        const config = options.bioConfig!;
        if (config.autoDetect) {
            updateProgress('Scanning for cast names...', 30);
            const names = await extractTalentFromVideo(
                geminiUri!,
                file.type,
                videoMetadata?.duration || 0,
                undefined,
                (newNames) => {
                    updateProgress(`Scanning cast... Found: ${newNames.slice(0, 3).join(', ')}${newNames.length > 3 ? '...' : ''}`, 0);
                }
            );
            const results = [];
            for (let i = 0; i < names.length; i++) {
                const name = names[i];
                updateProgress(`Generating bio for ${name}...`, 50 + ((i / names.length) * 40));
                const bio = await generateBio(name, 'Actor/Subject in video', config.language || 'English');
                results.push(bio);
                updateProgress(`PARTIAL_RESULT:${JSON.stringify({ data: [bio] })}`, 0);
            }
            return results;
        } else {
            const results = [];
            for (let i = 0; i < (config.talentDetails || []).length; i++) {
                const t = config.talentDetails![i];
                updateProgress(`Generating bio for ${t.name}...`, 20 + ((i / config.talentDetails!.length) * 70));
                const bio = await generateBio(t.name || 'Unknown', t.context || '', config.language || 'English');
                results.push(bio);
                updateProgress(`PARTIAL_RESULT:${JSON.stringify({ data: [bio] })}`, 0);
            }
            return results;
        }
    } else if (mode === 'graphics') {
        const config = options.graphicsConfig!;
        return analyzeGraphicsAndLowerThirds(
            geminiUri!,
            file.type,
            config.videoDuration || 0,
            config.videoFileName || file.name,
            undefined,
            (partialResult) => {
                updateProgress(`PARTIAL_RESULT:${JSON.stringify(partialResult)}`, 0);
            }
        );
    } else if (mode === 'fauna') {
        const config = options.faunaConfig || { primaryLanguage: 'English', secondaryLanguage: 'German' }; // Default
        return analyzeVideoForSpecies(geminiUri!, file.type, config.primaryLanguage, config.secondaryLanguage, videoMetadata?.duration || 0, undefined, (partialSightings) => {
            updateProgress(`PARTIAL_RESULT:${JSON.stringify({ sightings: partialSightings })}`, 0);
        });
    }

    return null;
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULT PROCESSORS
// ═══════════════════════════════════════════════════════════════════════════════

async function processShotList(
    result: VideoAnnotationResults,
    gcsUri: string,
    mimeType: string,
    language: string,
    frameRate: number,
    signal: AbortSignal | undefined,
    onProgress: (message: string, percentage: number) => void,
    cacheName?: string
): Promise<Omit<Shot, 'nr' | 'thumbnail'>[]> {

    const shotAnnotations = result.shotAnnotations || [];
    if (shotAnnotations.length === 0) return [];

    const isDropFrame = detectTimecodeFormat(frameRate) === 'DF';

    // 1. Create Deterministic Skeleton
    const deterministicShots: Omit<Shot, 'nr' | 'thumbnail'>[] = shotAnnotations.map(segment => {
        const startSeconds = parseOffset(segment.startTimeOffset);
        const endSeconds = parseOffset(segment.endTimeOffset);
        const durationSeconds = endSeconds - startSeconds;

        const formatTc = (s: number) => isDropFrame ? secondsToDropFrameTimecode(s, frameRate) : secondsToTimecode(s, frameRate);

        return {
            tcIn: formatTc(startSeconds),
            tcOut: formatTc(endSeconds),
            duration: formatTc(durationSeconds),
            description: "Analyzing...", // Placeholder
            action: "Reading...", // Placeholder
            audio: ""
        };
    });

    // 2. Enrich with Gemini 1.5 Pro (Qualitative analysis on top of quantitative skeleton)
    if (signal?.aborted) throw new Error('Operation Cancelled');

    if (gcsUri === "SKIP_ENRICHMENT") {
        return deterministicShots;
    }

    return enrichShotList(
        gcsUri,
        mimeType,
        deterministicShots,
        language,
        signal || new AbortController().signal,
        (msg, pct) => {
            // Map enrichment progress (0-100) to remaining (85-100)
            onProgress(msg, 85 + (pct * 0.15));
        },
        cacheName
    );
}



// Helper: Parse "3.5s" to 3.5
function parseOffset(offset: string): number {
    if (!offset) return 0;
    return parseFloat(offset.replace('s', ''));
}


