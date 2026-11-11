export interface SceneDetectionResult {
    /** Deduplicated cut-point timestamps in seconds (where scene changes occur). */
    scenes: number[];
    /** Total video duration in seconds, parsed from the FFmpeg header. */
    duration: number;
}

/** A single shot: the interval between two consecutive cut points. */
export interface SceneInterval {
    /** 1-based shot number. */
    index: number;
    /** Start of the shot in seconds. */
    start: number;
    /** End of the shot in seconds. */
    end: number;
    /** Duration of the shot in seconds. */
    duration: number;
    /**
     * The representative timestamp for this shot — the exact middle of the interval.
     * This is the timestamp you should extract a frame from and send to AI analysis.
     * It avoids transitional/blurry frames that appear at the cut boundaries.
     */
    midpoint: number;
}

/**
 * Convert raw cut-point timestamps into scene intervals.
 *
 * @param cutPoints  - Array of scene-change timestamps returned by detectScenes().
 * @param totalDuration - Total video duration in seconds.
 * @returns           Array of SceneInterval, one per shot.
 *
 * Example: cutPoints=[5.1, 12.3], duration=20
 *   → [{0→5.1, mid:2.55}, {5.1→12.3, mid:8.7}, {12.3→20, mid:16.15}]
 */
export function buildSceneIntervals(cutPoints: number[], totalDuration: number): SceneInterval[] {
    const boundaries = [0, ...cutPoints, totalDuration];
    return boundaries.slice(0, -1).map((start, i) => {
        const end = boundaries[i + 1];
        const dur = end - start;
        return {
            index: i + 1,
            start,
            end,
            duration: dur,
            midpoint: start + dur / 2,
        };
    });
}

export interface KeyframeExtractionResult {
    blobs: Blob[];
}

export interface VideoMetadataResult {
    container: string;
    duration: string;
    bitrate: string;
    streams: string[];
    rawLogs: string;
}

class FFmpegService {
    private worker: Worker | null = null;

    private getWorker(): Worker {
        if (!this.worker) {
            this.worker = new Worker(new URL('../workers/ffmpeg.worker.ts', import.meta.url), {
                type: 'module',
            });
        }
        return this.worker;
    }

    public detectScenes(videoFile: File, threshold: number = 0.4, onStatus?: (msg: string) => void): Promise<SceneDetectionResult> {
        return this.runCommand('DETECT_SCENES', { videoFile, threshold }, onStatus) as Promise<SceneDetectionResult>;
    }

    /**
     * Convenience: detect scenes and immediately convert to intervals with midpoints.
     * Use this when you want "one representative timestamp per shot" for frame extraction.
     */
    public async detectSceneIntervals(
        videoFile: File,
        threshold: number = 0.4,
        onStatus?: (msg: string) => void,
    ): Promise<SceneInterval[]> {
        const result = await this.detectScenes(videoFile, threshold, onStatus);
        return buildSceneIntervals(result.scenes, result.duration);
    }

    public extractKeyframes(videoFile: File, onStatus?: (msg: string) => void): Promise<KeyframeExtractionResult> {
        return this.runCommand('EXTRACT_KEYFRAMES', { videoFile }, onStatus) as Promise<KeyframeExtractionResult>;
    }

    public getMetadata(videoFile: File, onStatus?: (msg: string) => void): Promise<VideoMetadataResult> {
        return this.runCommand('GET_METADATA', { videoFile }, onStatus) as Promise<VideoMetadataResult>;
    }

    private runCommand(type: string, data: any, onStatus?: (msg: string) => void): Promise<any> {
        return new Promise((resolve, reject) => {
            const worker = this.getWorker();

            const handleMessage = (e: MessageEvent) => {
                const { type: msgType, message, payload } = e.data;

                if (msgType === 'status') {
                    if (onStatus) onStatus(message);
                } else if (msgType === 'result') {
                    worker.removeEventListener('message', handleMessage);
                    resolve(payload);
                } else if (msgType === 'error') {
                    worker.removeEventListener('message', handleMessage);
                    reject(message);
                }
            };

            worker.addEventListener('message', handleMessage);
            worker.postMessage({ type, ...data });
        });
    }

    public terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}

export const ffmpegService = new FFmpegService();
