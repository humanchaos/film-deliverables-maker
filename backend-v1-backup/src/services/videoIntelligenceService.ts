import { v1 } from '@google-cloud/video-intelligence';
import { google } from '@google-cloud/video-intelligence/build/protos/protos';

const client = new v1.VideoIntelligenceServiceClient();

export type Feature = google.cloud.videointelligence.v1.Feature;

export interface VideoAnnotationResults extends google.cloud.videointelligence.v1.IVideoAnnotationResults { }

/**
 * Annotates a video using Google Cloud Video Intelligence API.
 * 
 * @param gcsUri The GCS URI of the video (gs://...).
 * @param features List of features to detect.
 * @param context Optional video context.
 */
export async function annotateVideo(
    gcsUri: string,
    features: Feature[],
    context?: google.cloud.videointelligence.v1.IVideoContext
): Promise<VideoAnnotationResults> {
    console.log(`Starting Video Intelligence Analysis for: ${gcsUri}`);

    const request = {
        inputUri: gcsUri,
        features: features,
        videoContext: context,
    };

    try {
        // Start the Long Running Operation
        const [operation] = await client.annotateVideo(request);
        console.log(`Video Intelligence LRO started: ${operation.name}`);

        // Wait for operation to complete (with customized 30m timeout)
        const timeoutMs = 30 * 60 * 1000; // 30 minutes

        const resultPromise = operation.promise();

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Video Intelligence Analysis timed out after 30 minutes')), timeoutMs)
        );

        const [operationResult] = await Promise.race([resultPromise, timeoutPromise]);

        // The result is an array of annotation results (one per input video)
        const annotationResults = operationResult.annotationResults;

        if (annotationResults && annotationResults.length > 0) {
            return annotationResults[0];
        } else {
            throw new Error('Video Intelligence completed but returned no results.');
        }

    } catch (error) {
        console.error('Video Intelligence API Error:', error);
        throw error;
    }
}
