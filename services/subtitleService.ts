/**
 * Subtitle Export Service
 * Generates SRT and VTT files for captions and subtitles.
 * Ensures compatibility with NLEs and web players.
 */

import { TranscriptionResult } from '../types';
import { applyTimecodeOffset, parseTimecode, secondsToTimecode } from '../utils/tableUtils';

export type SubtitleFormat = 'srt' | 'vtt';

// Helper to format timecode for SRT (HH:MM:SS,mmm)
// Video standard uses frames, but SRT uses milliseconds
function formatSrtTime(timeStr: string, frameRate: number): string {
    const seconds = parseTimecode(timeStr, frameRate);
    const date = new Date(0);
    date.setMilliseconds(seconds * 1000);
    const iso = date.toISOString().substr(11, 12); // HH:MM:SS.mmm
    return iso.replace('.', ',');
}

// Helper to format timecode for VTT (HH:MM:SS.mmm)
function formatVttTime(timeStr: string, frameRate: number): string {
    const seconds = parseTimecode(timeStr, frameRate);
    const date = new Date(0);
    date.setMilliseconds(seconds * 1000);
    return date.toISOString().substr(11, 12); // HH:MM:SS.mmm
}

export function generateSubtitles(
    result: TranscriptionResult,
    format: SubtitleFormat,
    timecodeOffset?: string,
    frameRate: number = 25
): string {
    let output = '';

    if (format === 'vtt') {
        output += 'WEBVTT\n\n';
    }

    result.segments.forEach((seg, index) => {
        // 1. Calculate Offsets
        const startTc = applyTimecodeOffset(seg.startTime, timecodeOffset, frameRate);
        const endTc = applyTimecodeOffset(seg.endTime, timecodeOffset, frameRate);

        // 2. Format for Subtitle Spec (SRT=Comma, VTT=Dot)
        // Note: applyTimecodeOffset returns HH:MM:SS:FF (video standard)
        // We need to convert that video TC back to seconds, then to SRT/VTT timestamp
        // This seems redundant but ensures the Offset Frame Math happened correctly first.
        // Or we can just calculate seconds directly.
        // Let's rely on applyTimecodeOffset to handle the drop-frame logic correctly if needed,
        // but SRT/VTT are strictly wall-clock time (milliseconds).
        // Drop-frame TC is a labelling convention, but SRT is absolute time.
        // If we want the SRT to MATCH the NLE timecode display, we might need to be careful.
        // NLEs usually import SRT maps to absolute time.
        // So we should calculate the total seconds including offset, then format as MS.

        const baseStartSeconds = parseTimecode(seg.startTime, frameRate);
        const baseEndSeconds = parseTimecode(seg.endTime, frameRate);
        const offsetSeconds = timecodeOffset ? parseTimecode(timecodeOffset, frameRate) : 0;

        const finalStartSeconds = baseStartSeconds + offsetSeconds;
        const finalEndSeconds = baseEndSeconds + offsetSeconds;

        const dateStart = new Date(0); dateStart.setMilliseconds(finalStartSeconds * 1000);
        const dateEnd = new Date(0); dateEnd.setMilliseconds(finalEndSeconds * 1000);

        let startStr = dateStart.toISOString().substr(11, 12);
        let endStr = dateEnd.toISOString().substr(11, 12);

        if (format === 'srt') {
            startStr = startStr.replace('.', ',');
            endStr = endStr.replace('.', ',');

            output += `${index + 1}\n`;
            output += `${startStr} --> ${endStr}\n`;
            output += `${seg.transcript}\n\n`;
        } else {
            // VTT
            output += `${startStr} --> ${endStr}\n`;
            output += `${seg.transcript}\n\n`;
        }
    });

    return output;
}

export function downloadSubtitle(content: string, fileName: string, format: SubtitleFormat) {
    const mimeType = format === 'vtt' ? 'text/vtt' : 'text/plain'; // .srt is technically text/plain or application/x-subrip
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
