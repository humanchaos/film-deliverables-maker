/**
 * Timecode Utilities
 * Format and parse timecodes for video analysis
 */

/**
 * Convert seconds to HH:MM:SS format
 */
export function secondsToTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    return [
        h.toString().padStart(2, '0'),
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0'),
    ].join(':');
}

/**
 * Convert seconds to HH:MM:SS:FF timecode format (25fps default)
 */
export function secondsToTimecode(seconds: number, fps: number = 25): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * fps);

    return [
        h.toString().padStart(2, '0'),
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0'),
        f.toString().padStart(2, '0'),
    ].join(':');
}

/**
 * Parse HH:MM:SS or HH:MM:SS:FF to seconds
 */
export function timecodeToSeconds(timecode: string, fps: number = 25): number {
    const parts = timecode.split(':').map(Number);

    if (parts.length === 4) {
        // HH:MM:SS:FF
        const [h, m, s, f] = parts;
        return h * 3600 + m * 60 + s + f / fps;
    } else if (parts.length === 3) {
        // HH:MM:SS
        const [h, m, s] = parts;
        return h * 3600 + m * 60 + s;
    } else if (parts.length === 2) {
        // MM:SS
        const [m, s] = parts;
        return m * 60 + s;
    }

    return 0;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(seconds: number): string {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
        const m = Math.floor(seconds / 60);
        const s = Math.round(seconds % 60);
        return `${m}m ${s}s`;
    } else {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    }
}

/**
 * Validate timecode format
 */
export function isValidTimecode(timecode: string): boolean {
    return /^\d{2}:\d{2}:\d{2}(:\d{2})?$/.test(timecode);
}
