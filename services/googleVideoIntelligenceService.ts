
import { ERROR_IDS } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES: Google Cloud Video Intelligence API
// ═══════════════════════════════════════════════════════════════════════════════

export interface VideoAnnotationResults {
    inputUri: string;
    segment: {
        startTimeOffset: string;
        endTimeOffset: string;
    };
    shotLabelAnnotations?: LabelAnnotation[];
    shotAnnotations?: VideoSegment[];
    speechTranscriptions?: SpeechTranscription[];
    error?: {
        code: number;
        message: string;
    };
}

export interface VideoSegment {
    startTimeOffset: string;
    endTimeOffset: string;
}

export interface LabelAnnotation {
    entity: {
        entityId: string;
        description: string;
        languageCode: string;
    };
    categoryEntities?: {
        entityId: string;
        description: string;
        languageCode: string;
    }[];
    segments: {
        segment: VideoSegment;
        confidence: number;
    }[];
}

export interface SpeechTranscription {
    alternatives: {
        transcript: string;
        confidence: number;
        words: {
            startTime: string;
            endTime: string;
            word: string;
        }[];
    }[];
    languageCode: string;
}

export interface AnnotateVideoRequest {
    inputUri: string;
    features: Feature[];
    videoContext?: {
        speechTranscriptionConfig?: {
            languageCode: string;
            enableAutomaticPunctuation: boolean;
            enableSpeakerDiarization?: boolean;
            diarizationSpeakerCount?: number;
        };
        shotChangeDetectionConfig?: {
            model: string;
        };
    };
    outputUri?: string; // Optional: Write JSON directly to GCS
}

export type Feature =
    | 'LABEL_DETECTION'
    | 'SHOT_CHANGE_DETECTION'
    | 'EXPLICIT_CONTENT_DETECTION'
    | 'SPEECH_TRANSCRIPTION'
    | 'TEXT_DETECTION'
    | 'OBJECT_TRACKING'
    | 'LOGO_RECOGNITION';

export interface Operation {
    name: string;
    metadata: {
        '@type': string;
        annotationProgress: {
            inputUri: string;
            progressPercent: number;
            startTime: string;
            updateTime: string;
        }[];
    };
    done: boolean;
    error?: {
        code: number;
        message: string;
    };
    response?: {
        '@type': string;
        annotationResults: VideoAnnotationResults[];
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

const API_ENDPOINT = 'https://videointelligence.googleapis.com/v1/videos:annotate';

/**
 * Perform deterministic video analysis using Google Cloud Video Intelligence API
 * Requires: Valid API Key with Video Intelligence API enabled
 * Note: inputUri must be a 'gs://' Google Cloud Storage URI
 */
export async function annotateVideo(
    apiKey: string,
    gcsUri: string,
    features: Feature[],
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
    accessToken?: string,
    projectId?: string
): Promise<VideoAnnotationResults> {

    // 1. Start the Long Running Operation (LRO)
    const requestBody: AnnotateVideoRequest = {
        inputUri: gcsUri,
        features: features,
        videoContext: {
            speechTranscriptionConfig: {
                languageCode: 'en-US',
                enableAutomaticPunctuation: true,
                enableSpeakerDiarization: true,
            },
            shotChangeDetectionConfig: {
                model: 'builtin/stable',
            }
        }
    };

    let operation: Operation;

    try {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };
        if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        }
        if (projectId) {
            headers['X-Goog-User-Project'] = projectId;
        }

        const url = accessToken ? API_ENDPOINT : `${API_ENDPOINT}?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to start Video Intelligence analysis: ${response.status} - ${errorText}`);
        }

        operation = await response.json();
        console.log('Video Intelligence LRO started:', operation.name);

    } catch (error) {
        if (signal?.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);
        throw error;
    }

    // 2. Poll for completion
    return pollForOperationCompletion(apiKey, operation.name, onProgress, signal, accessToken, projectId);
}

async function pollForOperationCompletion(
    apiKey: string,
    operationName: string,
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
    accessToken?: string,
    projectId?: string
): Promise<VideoAnnotationResults> {

    const pollInterval = 1000; // 1 second for smoother updates

    while (true) {
        if (signal?.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

        try {
            const headers: HeadersInit = {};
            if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
            }
            if (projectId) {
                headers['X-Goog-User-Project'] = projectId;
            }

            const url = accessToken
                ? `https://videointelligence.googleapis.com/v1/${operationName}`
                : `https://videointelligence.googleapis.com/v1/${operationName}?key=${apiKey}`;

            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error(`Polling failed: ${response.status}`);
            }

            const opStatus: Operation = await response.json();

            if (opStatus.error) {
                throw new Error(`Analysis failed: ${opStatus.error.message}`);
            }

            // Update progress if available
            if (opStatus.metadata?.annotationProgress?.[0]) {
                const progress = opStatus.metadata.annotationProgress[0].progressPercent;
                if (progress) onProgress(progress);
            }

            if (opStatus.done) {
                // Operation complete!
                // The results are typically inside opStatus.response.annotationResults
                if (opStatus.response?.annotationResults?.[0]) {
                    return opStatus.response.annotationResults[0];
                } else {
                    throw new Error('Operation completed but returned no results.');
                }
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));

        } catch (error) {
            if (signal?.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);
            throw error;
        }
    }
}
