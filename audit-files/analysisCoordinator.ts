/**
 * Analysis Coordinator - V2 Clean Version
 * 
 * All analysis is routed through the Cloud Run backend.
 * Frontend ONLY uploads to GCS via signed URL, then backend handles everything.
 */

import { uploadAndCreateJob, getJob } from './api';
import { AnalysisMode, FullAnalysisResult, UploadProgress, VideoMetadata } from '../types';
import type { Job, AnalysisConfig } from '../types_v2';

export interface AnalysisOptions {
    file: File;
    mode: AnalysisMode;
    onProgress: (message: string, percentage: number) => void;
    signal?: AbortSignal;
    videoMetadata?: VideoMetadata | null;
}

/**
 * Map v1 AnalysisMode to v2 AnalysisConfig
 */
function modeToConfig(mode: AnalysisMode): Partial<AnalysisConfig> {
    // For full_analysis, enable all modules
    if (mode === 'full_analysis') {
        return {
            transcription: true,
            shotList: true,
            synopsis: true,
            fauna: true,
            graphics: true,
            cast: true,
        };
    }

    // For single module modes
    const config: Partial<AnalysisConfig> = {
        transcription: false,
        shotList: false,
        synopsis: false,
        fauna: false,
        graphics: false,
        cast: false,
    };

    switch (mode) {
        case 'transcription':
            config.transcription = true;
            break;
        case 'shotlist':
            config.shotList = true;
            break;
        case 'synopsis':
            config.synopsis = true;
            break;
        case 'fauna':
            config.fauna = true;
            break;
        case 'graphics':
            config.graphics = true;
            break;
        case 'bio':
            config.cast = true;
            break;
    }

    return config;
}

/**
 * Map v2 backend results to v1 frontend format
 */
function mapResultsToV1Format(results: any): FullAnalysisResult {
    return {
        // Shot list: v2 has { shots, totalShots }, v1 expects array directly in some places
        shotList: results.shotList?.shots?.map((shot: any, index: number) => ({
            nr: shot.index || index + 1,
            tcIn: shot.tcIn,
            tcOut: shot.tcOut,
            duration: shot.duration,
            description: shot.description,
            action: shot.action,
            audio: shot.audio,
            thumbnail: shot.thumbnail,
        })) || [],

        // Transcription: v2 uses 'text', v1 uses 'transcript'
        transcription: results.transcription ? {
            segments: (results.transcription.segments || []).map((seg: any) => ({
                startTime: seg.startTime,
                endTime: seg.endTime,
                speaker: seg.speaker,
                transcript: seg.text || seg.transcript || '',
            })),
            speakerMap: results.transcription.speakerMap || {},
            text: results.transcription.fullText || results.transcription.text || '',
        } : undefined,

        // Synopsis: v2 uses 'logline'/'summary', v1 uses 'oneLine'/'paragraph'
        synopsis: results.synopsis ? {
            title: results.synopsis.title,
            oneLine: results.synopsis.logline,
            paragraph: results.synopsis.summary,
            fullSynopsis: results.synopsis.fullSynopsis,
            themes: results.synopsis.themes,
            targetAudience: results.synopsis.targetAudience,
        } : undefined,

        // Fauna: v2 has { sightings }, map to flat array
        fauna: results.fauna?.sightings || [],

        // Graphics: v2 has { entries }, map to split arrays
        graphics: results.graphics ? {
            graphics: (results.graphics.entries || []).filter((e: any) => e.type !== 'lower_third'),
            lowerThirds: (results.graphics.entries || []).filter((e: any) => e.type === 'lower_third'),
            programTitle: results.graphics.programTitle,
            runtime: results.graphics.runtime,
        } : undefined,

        // Bio/Cast: v2 uses 'cast.people', v1 uses 'bio' array
        bio: results.cast?.people?.map((p: any) => ({
            name: p.name,
            fullName: p.fullName,
            title: p.title,
            biography: p.biography,
            firstAppearance: p.firstAppearance,
            isIdentified: p.isIdentified,
        })) || [],
    };
}

/**
 * Perform analysis via backend
 */
export async function performAnalysis(options: AnalysisOptions): Promise<FullAnalysisResult> {
    const { file, mode, onProgress, signal, videoMetadata } = options;

    // STEP 1: Upload and create job via new API
    onProgress('Uploading video...', 5);

    const duration = videoMetadata?.duration || 0;
    const config = modeToConfig(mode);

    let jobId: string;
    try {
        jobId = await uploadAndCreateJob(
            file,
            duration,
            config,
            (stage, progress) => {
                onProgress(stage, progress * 0.5); // 0-50% for upload
            }
        );
    } catch (error) {
        throw new Error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log(`[Coordinator] Job created: ${jobId}`);

    // STEP 2: Poll for completion
    onProgress('Analyzing video...', 50);

    const startTime = Date.now();
    const JOB_TIMEOUT = 180 * 60 * 1000; // 180 minutes
    const POLL_INTERVAL = 3000;

    while (true) {
        // Check timeout
        if (Date.now() - startTime > JOB_TIMEOUT) {
            throw new Error('Analysis timed out. Please try again.');
        }

        // Check abort signal
        if (signal?.aborted) {
            throw new Error('Analysis cancelled');
        }

        try {
            const job = await getJob(jobId);

            // Update progress
            const progress = job.progress?.overall || 0;
            const currentModule = job.progress?.currentModule || 'processing';
            onProgress(`Analyzing: ${currentModule}...`, 50 + (progress * 0.5)); // 50-100%

            // Check completion
            if (job.status === 'completed') {
                console.log('[Coordinator] Job completed');
                onProgress('Analysis complete!', 100);
                return mapResultsToV1Format(job.results || {});
            }

            if (job.status === 'failed') {
                throw new Error(job.error?.message || 'Analysis failed');
            }
        } catch (error) {
            // Only throw if it's a real error, not a transient network issue
            if (error instanceof Error && error.message.includes('not found')) {
                throw error;
            }
            console.warn('[Coordinator] Poll error, retrying...', error);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
}
