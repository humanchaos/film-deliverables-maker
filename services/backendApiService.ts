
import { JobDocument, FullAnalysisResult } from '../types';

// V2 Backend URL - MUST match gemini-super-app-backend deployment
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://gemini-super-app-backend-193471035724.europe-west3.run.app';

/**
 * Map v2 backend results to frontend FullAnalysisResult format
 * The v2 backend returns { shotList: { shots: [], ... } } but frontend expects { shotList: [] }
 */
export function mapBackendResultsToFullAnalysis(results: unknown): FullAnalysisResult {
    const v2 = results as any;

    // DEBUG: Log raw results structure
    console.log('[Mapping] Raw v2 results:', JSON.stringify(v2, null, 2).slice(0, 2000));
    console.log('[Mapping] v2.shotList:', v2.shotList);
    console.log('[Mapping] v2.shotList?.shots:', v2.shotList?.shots);
    console.log('[Mapping] v2.transcription:', v2.transcription);
    console.log('[Mapping] v2.transcription?.segments:', v2.transcription?.segments);

    // shotList: v2 returns { shots: [], totalShots: n } but frontend expects array
    const shotsSource = v2.shotList?.shots || v2.shotList || [];
    console.log('[Mapping] shotsSource:', shotsSource, 'isArray:', Array.isArray(shotsSource));
    const shotsArray = Array.isArray(shotsSource) ? shotsSource : [];
    console.log('[Mapping] shotsArray length:', shotsArray.length);

    // Transcription segments
    const transcriptionSegments = v2.transcription?.segments || [];
    console.log('[Mapping] transcriptionSegments:', transcriptionSegments);

    const mappedResult: FullAnalysisResult = {
        shotList: shotsArray.map((s: any, index: number) => ({
            nr: s.nr || index + 1,
            tcIn: s.tcIn || s.startTime || '00:00:00:00',
            tcOut: s.tcOut || s.endTime || '00:00:00:00',
            duration: s.duration || '',
            description: s.description || '',
            action: s.action || '',
            audio: s.audio || '',
        })),

        transcription: {
            segments: transcriptionSegments.map((seg: any) => ({
                startTime: seg.startTime || 0,
                endTime: seg.endTime || 0,
                speaker: seg.speaker || 'Speaker',
                transcript: seg.text || seg.transcript || seg.content || '',
            })),
            speakerMap: v2.transcription?.speakerMap || {},
            text: v2.transcription?.fullText || v2.transcription?.text || '',
        },

        graphics: {
            programTitle: v2.graphics?.programTitle || '',
            runtime: v2.graphics?.runtime || '',
            graphics: (v2.graphics?.entries || v2.graphics?.graphics || [])
                .filter((e: any) => e.type !== 'lower_third')
                .map((e: any) => ({
                    description: e.content || e.description || '',
                    timecodeIn: e.timecodeIn || '',
                    timecodeOut: e.timecodeOut || '',
                })),
            lowerThirds: (v2.graphics?.entries || v2.graphics?.lowerThirds || [])
                .filter((e: any) => e.type === 'lower_third')
                .map((e: any) => ({
                    text: e.content || e.text || '',
                    timecodeIn: e.timecodeIn || '',
                    timecodeOut: e.timecodeOut || '',
                })),
        },

        synopsis: {
            title: v2.synopsis?.title || '',
            writtenBy: v2.synopsis?.writtenBy || '',
            directedBy: v2.synopsis?.directedBy || '',
            oneLine: v2.synopsis?.logline || v2.synopsis?.oneLine || '',
            paragraph: v2.synopsis?.summary || v2.synopsis?.paragraph || '',
            fullSynopsis: v2.synopsis?.fullSynopsis || '',
            keyThemes: v2.synopsis?.themes || v2.synopsis?.keyThemes || '',
            targetAudience: v2.synopsis?.targetAudience || '',
        },

        bio: (v2.cast?.people || v2.bio || []).map((p: any) => ({
            name: p.name || '',
            fullName: p.fullName || p.name || '',
            title: p.title || '',
            biography: p.biography || '',
            sources: p.sources || [],
        })),

        fauna: (v2.fauna?.sightings || v2.fauna || []).map((s: any) => ({
            id: s.id || '',
            commonName: s.commonName || '',
            latinName: s.latinName || '',
            germanName: s.localName || s.germanName || '',
            timecode: s.timecode || '',
            category: s.category || '',
            confidence: s.confidence || 0,
            behavior: s.behavior || '',
            iucnStatus: s.iucnStatus || '',
        })),
    };

    console.log('[Mapping] Final mapped shotList:', mappedResult.shotList, 'isArray:', Array.isArray(mappedResult.shotList));
    console.log('[Mapping] Final mapped transcription segments:', mappedResult.transcription.segments);

    return mappedResult;
}

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
                return mapBackendResultsToFullAnalysis(job.results);
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

