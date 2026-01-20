/**
 * Video Analysis Table Utilities
 * Industry-standard SMPTE Timecode Logic
 */

/**
 * Converts a total frame count to a SMPTE timecode string.
 * Supports both Drop-Frame (DF) and Non-Drop-Frame (NDF).
 *
 * @param frameCount The total number of frames.
 * @param frameRate The frame rate (e.g., 23.976, 24, 25, 29.97, 30, 59.94, 60).
 * @param useDropFrame Whether to use Drop-Frame timecode (standard for 29.97/59.94).
 * @returns Formatted timecode string (HH:MM:SS:FF for NDF, HH:MM:SS;FF for DF).
 */
export function framesToTimecode(frameCount: number, frameRate: number, useDropFrame: boolean = false): string {
    // Handle 0 or negative
    if (frameCount < 0) frameCount = 0;

    let fps = Math.round(frameRate);

    // Correction for Drop Frame
    if (useDropFrame && (frameRate === 29.97 || frameRate === 59.94)) {
        // For 29.97 DF: Drop 2 frames every minute, except every 10th minute.
        // Total dropped frames per 10 mins = 18.
        // Frame rate base is 30 (or 60).
        const dropFrames = frameRate === 29.97 ? 2 : 4;
        const framesPerMinute = (fps * 60) - dropFrames;
        const framesPer10Minutes = (fps * 60 * 10) - (dropFrames * 9); // 9 drops in 10 mins

        const D = Math.floor(frameCount / framesPer10Minutes);
        const M = frameCount % framesPer10Minutes;

        if (M > dropFrames) {
            frameCount = frameCount + (dropFrames * 9 * D) + dropFrames * Math.floor((M - dropFrames) / framesPerMinute);
        } else {
            frameCount = frameCount + dropFrames * 9 * D;
        }
    }

    const frames = Math.floor(frameCount % fps);
    const secondsTotal = Math.floor(frameCount / fps);
    const seconds = Math.floor(secondsTotal % 60);
    const minutesTotal = Math.floor(secondsTotal / 60);
    const minutes = Math.floor(minutesTotal % 60);
    const hours = Math.floor(minutesTotal / 60);

    const pad = (n: number) => n.toString().padStart(2, '0');
    const separator = useDropFrame ? ';' : ':';

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(frames)}`;
}

/**
 * Converts a SMPTE timecode string to total frame count.
 *
 * @param timecode Formatted timecode (HH:MM:SS:FF or HH:MM:SS;FF).
 * @param frameRate Video frame rate.
 * @returns Total frame count.
 */
export function timecodeToFrames(timecode: string, frameRate: number): number {
    if (!timecode) return 0;

    // Normalize separator
    const isDropFrame = timecode.includes(';') || (frameRate === 29.97 && timecode.length === 11);
    const parts = timecode.replace(';', ':').split(':').map(Number);

    if (parts.length < 4) return 0;

    const [hours, minutes, seconds, frames] = parts;
    let fps = Math.round(frameRate);

    let totalFrames = (hours * 3600 + minutes * 60 + seconds) * fps + frames;

    if (isDropFrame && (frameRate === 29.97 || frameRate === 59.94)) {
        const dropFrames = frameRate === 29.97 ? 2 : 4;
        const totalMinutes = hours * 60 + minutes;
        const droppedFrames = (dropFrames * totalMinutes) - (dropFrames * Math.floor(totalMinutes / 10));
        totalFrames -= droppedFrames;
    }

    return totalFrames;
}

/**
 * Converts seconds to a SMPTE timecode string.
 * 
 * @param seconds Time in seconds (float).
 * @param frameRate Video frame rate.
 * @param forceDropFrame Force usage of Drop Frame (optional, auto-detected otherwise).
 * @returns Timecode string.
 */
export function secondsToTimecode(seconds: number, frameRate: number, forceDropFrame?: boolean): string {
    const isDropFrame = forceDropFrame ?? (Math.abs(frameRate - 29.97) < 0.01 || Math.abs(frameRate - 59.94) < 0.01);
    const totalFrames = Math.round(seconds * (isDropFrame ? frameRate : Math.round(frameRate)));
    // Note: iterating seconds * frameRate is approximation. 
    // For precise calculations we need to be careful. 
    // If drop frame, 29.97 * seconds gives precise frame count effectively.

    return framesToTimecode(totalFrames, frameRate, isDropFrame);
}

/**
 * Converts timecode to seconds.
 */
export function timecodeToSeconds(timecode: string, frameRate: number): number {
    const frames = timecodeToFrames(timecode, frameRate);
    const isDropFrame = timecode.includes(';') || (Math.abs(frameRate - 29.97) < 0.01);

    // For Drop Frame, we divide by the REAL frame rate (29.97) to get wall-clock time
    // For Non-Drop, we divide by the integer frame rate (e.g. 24 or 25) because NDF drifts from wall clock.
    const divisor = isDropFrame ? frameRate : Math.round(frameRate);

    return frames / divisor;
}

/**
 * Auto-detects if a frame rate should default to Drop Frame.
 */
export function isDropFrame(frameRate: number): boolean {
    return Math.abs(frameRate - 29.97) < 0.01 || Math.abs(frameRate - 59.94) < 0.01;
}

/**
 * Formats a duration in seconds to a human-readable string (e.g., "1h 20m").
 */
export function formatDuration(seconds: number): string {
    if (!seconds) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);

    return parts.join(' ');
}
