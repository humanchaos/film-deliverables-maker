/**
 * Gemini Core - Shared Utilities and SDK Initialization
 * Protocol 800 Compliant Module
 */

import { GoogleGenerativeAI, SchemaType as Type } from "@google/generative-ai";
import { ERROR_IDS } from '../../types';

export const genAI = new GoogleGenerativeAI((import.meta as any).env.VITE_GEMINI_API_KEY);
export { Type };

// ═══════════════════════════════════════════════════════════════════════════════
// JSON REPAIR UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

export function repairJson(jsonString: string): string {
    let fixed = jsonString.trim();
    fixed = fixed.replace(/^```(json)?|```$/g, '');
    const jsonMatch = fixed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) fixed = jsonMatch[0];
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    fixed = fixed.replace(/}(\s*){/g, '},$1{');
    fixed = fixed.replace(/](\s*)\[/g, '],$1[');

    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/]/g) || []).length;

    if (openBraces > closeBraces) fixed += '}'.repeat(openBraces - closeBraces);
    if (openBrackets > closeBrackets) fixed += ']'.repeat(openBrackets - closeBrackets);

    return fixed;
}

export function safeJsonParse<T>(jsonString: string): T {
    try {
        const cleanString = repairJson(jsonString);
        if (!cleanString) throw new Error(ERROR_IDS.INVALID_API_RESPONSE);
        return JSON.parse(cleanString);
    } catch (e) {
        console.warn("Initial JSON parse failed, attempting aggressive repair...", e);
        try {
            let aggressiveFix = jsonString.replace(/,(\s*)/g, ',$1');
            aggressiveFix = aggressiveFix.replace(/([}\]])[\s\S]*$/, '$1');
            return JSON.parse(repairJson(aggressiveFix));
        } catch (e2) {
            console.error("Failed to parse JSON response:", jsonString, e2);
            throw new Error(ERROR_IDS.INVALID_API_RESPONSE);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIME UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

export function formatDuration(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return "00:00:00";
    const totalSeconds = Math.floor(seconds);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

export function formatTimeSegment(seconds: number): string {
    if (seconds === 0) return "";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEGMENT GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface TimeSegment { start: number; end: number; }

export function createTimeSegments(duration: number, segmentLength: number = 300): TimeSegment[] {
    const segments: TimeSegment[] = [];
    if (duration > segmentLength) {
        for (let t = 0; t < duration; t += segmentLength) {
            segments.push({ start: t, end: Math.min(t + segmentLength, duration) });
        }
    } else {
        segments.push({ start: 0, end: duration });
    }
    return segments;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKPOINTING FOR CRASH RECOVERY
// ═══════════════════════════════════════════════════════════════════════════════

const CHECKPOINT_PREFIX = 'gemini_checkpoint_';

export interface CheckpointData<T> {
    jobId: string;
    module: string;
    lastBatchIndex: number;
    partialResults: T[];
    timestamp: number;
}

export function saveCheckpoint<T>(jobId: string, module: string, batchIndex: number, results: T[]): void {
    const key = `${CHECKPOINT_PREFIX}${jobId}_${module}`;
    const checkpoint: CheckpointData<T> = {
        jobId, module, lastBatchIndex: batchIndex, partialResults: results, timestamp: Date.now()
    };
    try {
        localStorage.setItem(key, JSON.stringify(checkpoint));
        console.log(`[Checkpoint] Saved batch ${batchIndex} for ${module} (${results.length} items)`);
    } catch (e) {
        console.warn('[Checkpoint] Failed to save:', e);
    }
}

export function loadCheckpoint<T>(jobId: string, module: string): CheckpointData<T> | null {
    const key = `${CHECKPOINT_PREFIX}${jobId}_${module}`;
    try {
        const stored = localStorage.getItem(key);
        if (!stored) return null;
        const checkpoint = JSON.parse(stored) as CheckpointData<T>;
        if (Date.now() - checkpoint.timestamp > 60 * 60 * 1000) {
            localStorage.removeItem(key);
            return null;
        }
        return checkpoint;
    } catch (e) {
        return null;
    }
}

export function clearCheckpoint(jobId: string, module: string): void {
    localStorage.removeItem(`${CHECKPOINT_PREFIX}${jobId}_${module}`);
}

export function generateJobId(fileIdentifier: string): string {
    return `${fileIdentifier}_${Date.now()}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT CACHE
// ═══════════════════════════════════════════════════════════════════════════════

export const createContextCache = async (
    fileUri: string, mimeType: string, ttlSeconds: number = 600
): Promise<string> => {
    try {
        const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-2.5-flash',
                contents: [{ parts: [{ fileData: { fileUri, mimeType } }], role: 'user' }],
                ttl: `${ttlSeconds}s`
            })
        });
        if (!response.ok) return '';
        const data = await response.json();
        return data.name;
    } catch (error) {
        return '';
    }
};
