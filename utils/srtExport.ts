/**
 * SRT Export Utility
 * Generates properly formatted SRT subtitle files
 */
import { TranscriptionSegment } from '../types';

/**
 * Format timecode for SRT format
 * SRT uses COMMA for milliseconds: HH:MM:SS,mmm
 */
function formatSRTTime(timecode: string): string {
    // Handle various input formats
    const parts = timecode.split(/[:;]/);

    if (parts.length < 3) {
        return '00:00:00,000';
    }

    const hours = parts[0].padStart(2, '0');
    const minutes = parts[1].padStart(2, '0');
    const seconds = parts[2].padStart(2, '0');

    // Handle frames (convert to milliseconds) or milliseconds
    let milliseconds = '000';
    if (parts[3]) {
        const frameOrMs = parseInt(parts[3], 10);
        if (parts[3].length <= 2) {
            // Frames at 25fps
            const ms = Math.round((frameOrMs / 25) * 1000);
            milliseconds = ms.toString().padStart(3, '0');
        } else {
            // Already milliseconds
            milliseconds = parts[3].padStart(3, '0');
        }
    }

    // SRT uses COMMA for milliseconds separator
    return `${hours}:${minutes}:${seconds},${milliseconds}`;
}

/**
 * Generate SRT subtitle content
 */
export function generateSRT(segments: TranscriptionSegment[]): string {
    return segments
        .map((seg, index) => {
            const startTime = formatSRTTime(seg.startTime);
            const endTime = formatSRTTime(seg.endTime);
            const text = seg.transcript || '';

            return [
                (index + 1).toString(),
                `${startTime} --> ${endTime}`,
                text,
                '', // Empty line between entries
            ].join('\n');
        })
        .join('\n');
}

/**
 * Generate SRT with speaker names included
 */
export function generateSRTWithSpeakers(segments: TranscriptionSegment[]): string {
    return segments
        .map((seg, index) => {
            const startTime = formatSRTTime(seg.startTime);
            const endTime = formatSRTTime(seg.endTime);
            const speaker = seg.speaker ? `[${seg.speaker}] ` : '';
            const text = seg.transcript || '';

            return [
                (index + 1).toString(),
                `${startTime} --> ${endTime}`,
                `${speaker}${text}`,
                '',
            ].join('\n');
        })
        .join('\n');
}

/**
 * Download SRT file
 */
export function downloadSRT(
    segments: TranscriptionSegment[],
    filename: string,
    includeSpeakers: boolean = false
): void {
    const content = includeSpeakers
        ? generateSRTWithSpeakers(segments)
        : generateSRT(segments);

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.srt') ? filename : `${filename}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
