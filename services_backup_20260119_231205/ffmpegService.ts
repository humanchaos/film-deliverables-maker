export interface SceneDetectionResult {
    scenes: number[]; // Array of timestamps in seconds
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
