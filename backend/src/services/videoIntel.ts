/**
 * Video Intelligence Service
 * Shot detection using Google Video Intelligence API
 */

import videoIntelligence from '@google-cloud/video-intelligence';

const client = new videoIntelligence.VideoIntelligenceServiceClient();

interface ShotBoundary {
    tcIn: string;
    tcOut: string;
}

/**
 * Detect shot boundaries in a video
 * Returns array of shot start/end timecodes
 */
export async function detectShots(gcsUri: string): Promise<ShotBoundary[]> {
    console.log(`[VideoIntel] Detecting shots in ${gcsUri}...`);

    try {
        const request = {
            inputUri: gcsUri,
            features: ['SHOT_CHANGE_DETECTION'],
        };

        // @ts-ignore - The video intelligence SDK has complex types
        const [operation] = await client.annotateVideo(request);

        console.log('[VideoIntel] Processing...');
        const [result] = await operation.promise();

        const annotations = result.annotationResults?.[0];
        const shotAnnotations = annotations?.shotAnnotations || [];

        const shots: ShotBoundary[] = shotAnnotations.map((shot: any) => ({
            tcIn: formatTimecode(shot.startTimeOffset),
            tcOut: formatTimecode(shot.endTimeOffset),
        }));

        console.log(`[VideoIntel] Detected ${shots.length} shots`);
        return shots;
    } catch (error) {
        console.error('[VideoIntel] Shot detection failed:', error);
        throw error;
    }
}

/**
 * Format protobuf duration to timecode
 */
function formatTimecode(duration: any): string {
    if (!duration) return '00:00:00:00';

    const seconds = parseInt(String(duration.seconds || '0'), 10);
    const nanos = duration.nanos || 0;

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const f = Math.floor(nanos / 40000000); // Convert nanos to frames (25fps)

    return [
        h.toString().padStart(2, '0'),
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0'),
        f.toString().padStart(2, '0'),
    ].join(':');
}
