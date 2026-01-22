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

/**
 * Clamp timecode to video bounds
 * Ensures timecode is between 0 and maxSeconds
 */
export function clampTimecode(
    timecode: string,
    maxSeconds: number,
    fps: number = 25
): string {
    const seconds = timecodeToSeconds(timecode, fps);

    if (seconds < 0) {
        console.warn(`[Timecode] Negative timecode ${timecode} clamped to 00:00:00:00`);
        return secondsToTimecode(0, fps);
    }

    if (seconds > maxSeconds) {
        console.warn(`[Timecode] Timecode ${timecode} exceeds duration (${maxSeconds}s), clamping`);
        return secondsToTimecode(maxSeconds, fps);
    }

    return timecode;
}

/**
 * Validate and clamp all timecodes in analysis results
 */
export function validateResults(results: any, videoDuration: number): any {
    if (!results || videoDuration <= 0) return results;

    // Deep clone to avoid mutation
    const validated = JSON.parse(JSON.stringify(results));

    // Validate shot list
    if (validated.shotList?.shots) {
        for (const shot of validated.shotList.shots) {
            if (shot.tcIn) shot.tcIn = clampTimecode(shot.tcIn, videoDuration);
            if (shot.tcOut) shot.tcOut = clampTimecode(shot.tcOut, videoDuration);
        }
    }

    // Validate transcript
    if (validated.transcription?.segments) {
        for (const seg of validated.transcription.segments) {
            if (seg.startTime) seg.startTime = clampTimecode(seg.startTime, videoDuration);
            if (seg.endTime) seg.endTime = clampTimecode(seg.endTime, videoDuration);
        }
    }

    // Validate fauna
    if (validated.fauna?.sightings) {
        for (const sight of validated.fauna.sightings) {
            if (sight.timecode) sight.timecode = clampTimecode(sight.timecode, videoDuration);
        }
    }

    // Validate graphics
    if (validated.graphics?.entries) {
        for (const entry of validated.graphics.entries) {
            if (entry.timecodeIn) entry.timecodeIn = clampTimecode(entry.timecodeIn, videoDuration);
            if (entry.timecodeOut) entry.timecodeOut = clampTimecode(entry.timecodeOut, videoDuration);
        }
    }

    // Validate cast
    if (validated.cast?.people) {
        for (const person of validated.cast.people) {
            if (person.firstAppearance) person.firstAppearance = clampTimecode(person.firstAppearance, videoDuration);
        }
    }

    return validated;
}
