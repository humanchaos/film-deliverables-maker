import { ERROR_IDS, MAX_VIDEO_DURATION_SECONDS, MAX_FRAMES_LONG_VIDEO, MAX_FRAMES_SHORT_VIDEO } from '../types';

const FRAME_EXTRACTION_TIMEOUT = 1800000; // 30 minutes
const MAX_FRAME_DIMENSION = 720; // Scale frames to max 720p for performance
const YIELD_EVERY_N_FRAMES = 5; // Yield to main thread to keep UI responsive

export const extractFramesFromVideo = (
    videoUrl: string, 
    signal: AbortSignal, 
    density: 'low' | 'medium' | 'high' = 'low'
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error(ERROR_IDS.OPERATION_CANCELLED));

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.src = videoUrl;
    video.crossOrigin = "anonymous";

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      return reject(new Error('Could not get canvas context. Your browser may not be supported.'));
    }

    const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(ERROR_IDS.EXTRACTION_TIMEOUT));
    }, FRAME_EXTRACTION_TIMEOUT);
    
    const frames: string[] = [];
    let captureInterval = 1;
    let maxFrames = MAX_FRAMES_SHORT_VIDEO;
    
    const cleanup = () => {
        clearTimeout(timeoutId);
        video.removeEventListener('loadedmetadata', onMetadataLoaded);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
        video.remove();
        canvas.remove();
    };

    const onAbort = () => {
        cleanup();
        reject(new Error(ERROR_IDS.OPERATION_CANCELLED));
    };
    signal.addEventListener('abort', onAbort);

    const captureFrameAt = (time: number) => {
        video.currentTime = time;
    };
    
    const onSeeked = () => {
        if (signal.aborted) return cleanup();

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Data = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
        if (base64Data) {
            frames.push(base64Data);
        }

        const nextTime = frames.length * captureInterval;
        if (frames.length < maxFrames && nextTime <= video.duration) {
             if (frames.length % YIELD_EVERY_N_FRAMES === 0) {
                setTimeout(() => captureFrameAt(nextTime), 0);
            } else {
                captureFrameAt(nextTime);
            }
        } else {
            cleanup();
            resolve(frames);
        }
    };
    
    const onCanPlay = () => {
        if (signal.aborted) return cleanup();
        video.addEventListener('seeked', onSeeked);
        if (video.duration > 0) {
            captureFrameAt(0);
        } else {
            setTimeout(() => {
                if (signal.aborted) return cleanup();
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const base64Data = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
                 if (base64Data) frames.push(base64Data);
                 cleanup();
                 resolve(frames);
            }, 500);
        }
    };
    
    const onMetadataLoaded = () => {
        if (signal.aborted) return cleanup();
        
        if (video.duration > MAX_VIDEO_DURATION_SECONDS) {
            cleanup();
            return reject(new Error(ERROR_IDS.VIDEO_TOO_LONG));
        }

        let { videoWidth, videoHeight } = video;
        if (videoWidth > MAX_FRAME_DIMENSION || videoHeight > MAX_FRAME_DIMENSION) {
            const ratio = videoWidth > videoHeight ? MAX_FRAME_DIMENSION / videoWidth : MAX_FRAME_DIMENSION / videoHeight;
            videoWidth = Math.round(videoWidth * ratio);
            videoHeight = Math.round(videoHeight * ratio);
        }
        
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        
        const duration = video.duration;
        const HARD_FRAME_CAP = 500;

        switch(density) {
            case 'high':
                maxFrames = Math.floor(duration); // ~1 frame per second
                break;
            case 'medium':
                maxFrames = Math.floor(duration / 5); // ~1 frame every 5 seconds
                break;
            case 'low':
            default:
                maxFrames = Math.ceil(duration / 10);
                if (duration > 300) {
                    maxFrames = Math.min(maxFrames, MAX_FRAMES_LONG_VIDEO);
                } else {
                    maxFrames = Math.min(maxFrames, MAX_FRAMES_SHORT_VIDEO);
                }
                break;
        }

        maxFrames = Math.min(maxFrames, HARD_FRAME_CAP);
        captureInterval = Math.max(1, duration / maxFrames);
    };

    const onError = () => {
        cleanup();
        reject(new Error(ERROR_IDS.VIDEO_LOAD_FAIL));
    };

    video.addEventListener('loadedmetadata', onMetadataLoaded);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
  });
};


function audioBufferToWavBase64(buffer: AudioBuffer): string {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let pos = 0;

    const writeString = (view: DataView, offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(view, pos, 'RIFF'); pos += 4;
    view.setUint32(pos, length - 8, true); pos += 4;
    writeString(view, pos, 'WAVE'); pos += 4;
    writeString(view, pos, 'fmt '); pos += 4;
    view.setUint32(pos, 16, true); pos += 4;
    view.setUint16(pos, 1, true); pos += 2;
    view.setUint16(pos, numOfChan, true); pos += 2;
    view.setUint32(pos, buffer.sampleRate, true); pos += 4;
    view.setUint32(pos, buffer.sampleRate * 2 * numOfChan, true); pos += 4;
    view.setUint16(pos, numOfChan * 2, true); pos += 2;
    view.setUint16(pos, 16, true); pos += 2;
    writeString(view, pos, 'data'); pos += 4;
    view.setUint32(pos, length - pos - 4, true); pos += 4;

    for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    let offset = pos;
    for (let i = 0; i < buffer.length; i++) {
        for (let ch = 0; ch < numOfChan; ch++) {
            const sample = Math.max(-1, Math.min(1, channels[ch][i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
            offset += 2;
        }
    }
    
    const uint8Array = new Uint8Array(bufferArr);
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    return window.btoa(binary);
}


export const extractAudioFromVideo = (videoFile: File): Promise<string | null> => {
    return new Promise((resolve) => {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const arrayBuffer = event.target?.result as ArrayBuffer;
                if (!arrayBuffer) {
                    return resolve(null);
                }
                
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                const wavBase64 = audioBufferToWavBase64(audioBuffer);
                resolve(wavBase64);
            } catch (error) {
                console.warn("Could not decode audio from video file. It might not contain an audio track.", error);
                resolve(null);
            }
        };

        reader.onerror = (error) => {
            console.error("FileReader error while extracting audio:", error);
            resolve(null);
        };

        reader.readAsArrayBuffer(videoFile);
    });
};
