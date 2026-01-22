/**
 * Speaker Matching Utility
 * Match generic speaker labels to real names from graphics
 */

import type { TranscriptionResult, GraphicsResult } from '../types.js';
import { timecodeToSeconds } from './timecode.js';

/**
 * Match generic speaker labels (SPEAKER_01, SPEAKER_02) to real names
 * detected in lower third graphics
 */
export function matchSpeakersToNames(
    transcript: TranscriptionResult,
    graphics: GraphicsResult
): TranscriptionResult {
    if (!transcript?.segments || !graphics?.entries) {
        return transcript;
    }

    // Build map of timecode → real name from lower thirds
    const nameAtTime: { time: number; name: string }[] = [];

    for (const entry of graphics.entries) {
        if (entry.type === 'lower_third') {
            const name = extractPersonName(entry.content);
            if (name) {
                nameAtTime.push({
                    time: timecodeToSeconds(entry.timecodeIn),
                    name
                });
            }
        }
    }

    if (nameAtTime.length === 0) {
        return transcript;
    }

    // Sort by time to process in order
    nameAtTime.sort((a, b) => a.time - b.time);

    // Map generic labels to real names
    // Strategy: Find the first SPEAKER_XX segment that STARTS after the lower third appears
    // (Lower thirds often appear during narrator B-roll, person speaks AFTER)
    const labelToName = new Map<string, string>();

    for (const { time, name } of nameAtTime) {
        // Find segment that STARTS after lower third appears (within 15 second window)
        const segment = transcript.segments.find(s => {
            const start = timecodeToSeconds(s.startTime);
            // Must start AFTER the lower third appears, within 15 second window
            return start >= time - 2 && start <= time + 15 && s.speaker.match(/^SPEAKER_\d+$/);
        });

        if (segment) {
            // Don't overwrite if we already have a mapping for this speaker
            if (!labelToName.has(segment.speaker)) {
                labelToName.set(segment.speaker, name);
            }
        }
    }

    // Replace all generic labels with real names
    if (labelToName.size > 0) {
        for (const segment of transcript.segments) {
            if (labelToName.has(segment.speaker)) {
                segment.speaker = labelToName.get(segment.speaker)!;
            }
        }
        console.log(`[Speakers] Matched ${labelToName.size} speaker names from graphics`);
    } else {
        console.log(`[Speakers] No speaker matches found (${nameAtTime.length} lower thirds, ${transcript.segments.filter(s => s.speaker.match(/^SPEAKER_\d+$/)).length} generic speakers)`);
    }

    return transcript;
}

/**
 * Extract person name from lower third content
 * "Dr. Sarah Chen | Marine Biologist" → "Dr. Sarah Chen"
 * "John Smith, CEO" → "John Smith"
 */
function extractPersonName(content: string): string | null {
    if (!content) return null;

    // Split by common delimiters
    const parts = content.split(/[|,\n\-–—]/);
    const name = parts[0]?.trim();

    // Validate it looks like a name (not a location or date)
    if (!name || name.length < 3) return null;
    if (/^\d/.test(name)) return null;  // Starts with number
    if (/^\d{4}$/.test(name)) return null;  // Year
    if (/^(Location|Time|Date|Day \d)/i.test(name)) return null;

    return name;
}
