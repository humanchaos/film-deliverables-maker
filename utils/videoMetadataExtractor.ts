/**
 * Video Metadata Extractor
 * Extracts technical details (Frame Rate, Resolution, Codec) using Browser APIs.
 */

import { VideoMetadata } from '../types';

/**
 * Extracts metadata from a given Video File object.
 * 
 * @param file The video file to analyze.
 * @returns Promise resolving to VideoMetadata.
 */
export async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        const objectUrl = URL.createObjectURL(file);
        video.src = objectUrl;

        // Timeout scales with file size: 5s base + 1s per 50MB, max 60s
        const fileSizeMB = file.size / (1024 * 1024);
        const timeoutMs = Math.min(60000, 5000 + Math.floor(fileSizeMB / 50) * 1000);
        console.log(`[Metadata] Extracting metadata for ${file.name} (${fileSizeMB.toFixed(1)}MB), timeout: ${timeoutMs}ms`);

        // Timeout safety
        const timeout = setTimeout(() => {
            console.error(`[Metadata] Extraction timed out after ${timeoutMs}ms for ${file.name}`);
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Metadata extraction timed out'));
        }, timeoutMs);

        video.onloadedmetadata = async () => {
            clearTimeout(timeout);

            const width = video.videoWidth;
            const height = video.videoHeight;
            const duration = video.duration;
            let frameRate = 30; // Default fallback

            // 1. Try to get Frame Rate from MediaStreamTrack settings (Chrome/Edge/Firefox)
            // This is the most reliable "browser-native" way without libraries
            try {
                // @ts-ignore - captureStream is valid in modern browsers but TS might complain
                if (video.captureStream) {
                    // @ts-ignore
                    const stream = video.captureStream();
                    const track = stream.getVideoTracks()[0];
                    if (track) {
                        const settings = track.getSettings();
                        if (settings.frameRate) {
                            frameRate = settings.frameRate;
                        }
                    }
                } else if ((video as any).mozCaptureStream) { // Firefox
                    const stream = (video as any).mozCaptureStream();
                    const track = stream.getVideoTracks()[0];
                    if (track && track.getSettings().frameRate) {
                        frameRate = track.getSettings().frameRate;
                    }
                }
            } catch (e) {
                console.warn('Could not extract precise frame rate via MediaStream API, using fallback.', e);
            }

            // Round common frame rates to standard values for cleaner UI/Timecode match
            if (Math.abs(frameRate - 23.976) < 0.1) frameRate = 23.976;
            else if (Math.abs(frameRate - 24) < 0.1) frameRate = 24;
            else if (Math.abs(frameRate - 25) < 0.1) frameRate = 25;
            else if (Math.abs(frameRate - 29.97) < 0.1) frameRate = 29.97;
            else if (Math.abs(frameRate - 30) < 0.1) frameRate = 30;
            else if (Math.abs(frameRate - 59.94) < 0.1) frameRate = 59.94;
            else if (Math.abs(frameRate - 60) < 0.1) frameRate = 60;

            // Detect codec (basic)
            // Note: "video/mp4; codecs=avc1..." is hard to get from File object reliably without parsing atoms.
            // We return the MIME type as a proxy.
            const mimeType = file.type;
            let codec = '';
            if (mimeType.includes('mp4')) codec = 'H.264 (AVC) / H.265 (HEVC)';
            if (mimeType.includes('webm')) codec = 'VP8 / VP9 / AV1';
            if (mimeType.includes('quicktime')) codec = 'ProRes / H.264';

            URL.revokeObjectURL(objectUrl);

            resolve({
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                width,
                height,
                duration,
                frameRate,
                aspectRatio: calculateAspectRatio(width, height),
                hasAudio: true, // simplified assumption, would need AudioContext to verify
                hasVideo: true,
                codec,
                format: file.name.split('.').pop()?.toUpperCase() || 'UNKNOWN'
            });
        };

        video.onerror = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to load video metadata.'));
        };
    });
}

function calculateAspectRatio(w: number, h: number): string {
    const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
    const divisor = gcd(w, h);
    const wRatio = w / divisor;
    const hRatio = h / divisor;

    // Common video approximations
    const ratio = w / h;
    if (Math.abs(ratio - 1.777) < 0.05) return '16:9';
    if (Math.abs(ratio - 1.333) < 0.05) return '4:3';
    if (Math.abs(ratio - 2.39) < 0.05) return '2.39:1';

    return `${wRatio}:${hRatio}`;
}
