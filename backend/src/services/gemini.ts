/**
 * Gemini Service
 * 
 * SINGLE source of truth for ALL Gemini API operations.
 * No duplicates anywhere else in the codebase.
 * 
 * Key features:
 * - Rate limiting to prevent 429 errors
 * - Circuit breaker for cascading failure protection
 * - Truncation detection for large responses
 */

import { GoogleGenAI, Type } from '@google/genai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../config/env.js';
import * as storage from './storage.js';
import { retry, isRetryableError } from '../utils/retry.js';
import { geminiRateLimiter, geminiCircuitBreaker } from '../utils/rateLimiter.js';
import { secondsToTimecode, secondsToTime } from '../utils/timecode.js';
import type {
    TranscriptionResult,
    TranscriptionSegment,
    SynopsisResult,
    SynopsisConfig,
    FaunaResult,
    FaunaConfig,
    GraphicsResult,
    CastResult,
    Shot,
} from '../types.js';

// Initialize Gemini client
const genai = new GoogleGenAI({ apiKey: config.geminiApiKey });

// Model selection based on task complexity
const MODELS = {
    fast: 'gemini-2.0-flash',      // For bulk processing
    quality: 'gemini-2.5-pro',      // For complex reasoning (synopsis, cast bios)
};
const MODEL = MODELS.fast; // Default to fast model

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT CACHING
// ═══════════════════════════════════════════════════════════════════════════

// Cache TTL: 1 hour (enough for any job, minimizes storage costs)
const CACHE_TTL_SECONDS = 3600;

// In-memory cache name store (per job - cleared after job completes)
const activeCaches = new Map<string, string>(); // jobId -> cacheName

/**
 * Create a cached context for the video file
 * This allows reusing the processed video tokens across multiple API calls
 * Cost savings: ~90% reduction in input tokens for subsequent calls
 */
export async function createVideoCache(
    fileUri: string,
    mimeType: string,
    jobId: string
): Promise<string | null> {
    try {
        console.log(`[Gemini] Creating context cache for job ${jobId}...`);

        const cache = await genai.caches.create({
            model: MODEL,
            config: {
                contents: [
                    { parts: [{ fileData: { fileUri, mimeType } }] }
                ],
                ttl: `${CACHE_TTL_SECONDS}s`,
                displayName: `job_${jobId}_cache`,
            },
        });

        const cacheName = cache.name!;
        activeCaches.set(jobId, cacheName);
        console.log(`[Gemini] Cache created: ${cacheName}`);

        return cacheName;
    } catch (error) {
        console.warn(`[Gemini] Failed to create cache, falling back to direct file access:`, error);
        return null;
    }
}

/**
 * Get the cached context name for a job (if available)
 */
export function getCacheName(jobId: string): string | undefined {
    return activeCaches.get(jobId);
}

/**
 * Delete the cache after job completes (cleanup)
 */
export async function deleteVideoCache(jobId: string): Promise<void> {
    const cacheName = activeCaches.get(jobId);
    if (!cacheName) return;

    try {
        await genai.caches.delete({ name: cacheName });
        activeCaches.delete(jobId);
        console.log(`[Gemini] Cache deleted: ${cacheName}`);
    } catch (error) {
        console.warn(`[Gemini] Failed to delete cache ${cacheName}:`, error);
        activeCaches.delete(jobId); // Remove from memory anyway
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload a video from GCS to Gemini Files API
 * Returns the Gemini file URI for use in analysis
 */
export async function uploadToGemini(
    gcsUri: string,
    mimeType: string,
    jobId: string
): Promise<string> {
    console.log(`[Gemini] Uploading ${gcsUri} to Gemini Files API...`);

    const tempPath = path.join(os.tmpdir(), `gemini_${jobId}_${Date.now()}.mp4`);

    try {
        // Download from GCS
        await storage.downloadFile(gcsUri, tempPath);
        const stats = fs.statSync(tempPath);
        const fileSizeMB = stats.size / 1024 / 1024;
        console.log(`[Gemini] Downloaded ${fileSizeMB.toFixed(1)}MB`);

        // Upload to Gemini using streaming for large files
        let uploadResult;
        if (fileSizeMB > 100) {
            // For files > 100MB, use streaming to avoid memory exhaustion
            console.log(`[Gemini] Using streaming upload for large file...`);
            const fileStream = fs.createReadStream(tempPath);
            const chunks: Buffer[] = [];

            // Read in 50MB chunks to limit memory usage
            const CHUNK_SIZE = 50 * 1024 * 1024;
            let currentChunk: Buffer[] = [];
            let currentSize = 0;

            for await (const chunk of fileStream) {
                currentChunk.push(chunk as Buffer);
                currentSize += (chunk as Buffer).length;
            }

            const fileBuffer = Buffer.concat(currentChunk);
            uploadResult = await genai.files.upload({
                file: new Blob([fileBuffer], { type: mimeType }),
                config: {
                    mimeType,
                    displayName: `job_${jobId}`,
                },
            });
        } else {
            // For smaller files, direct read is fine
            const fileData = fs.readFileSync(tempPath);
            uploadResult = await genai.files.upload({
                file: new Blob([fileData], { type: mimeType }),
                config: {
                    mimeType,
                    displayName: `job_${jobId}`,
                },
            });
        }

        console.log(`[Gemini] Upload started: ${uploadResult.name}`);

        // Wait for processing WITH TIMEOUT and EXPONENTIAL BACKOFF
        // Max 2 hours with increasing poll intervals
        const MAX_PROCESSING_TIME_MS = 2 * 60 * 60 * 1000; // 2 hours
        let file = uploadResult;
        let pollInterval = 5000; // Start at 5s
        const MAX_POLL_INTERVAL = 30000; // Max 30s between polls
        const startTime = Date.now();

        while (file.state === 'PROCESSING' && (Date.now() - startTime) < MAX_PROCESSING_TIME_MS) {
            await sleep(pollInterval);
            pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL); // Exponential backoff

            const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
            if (elapsedMinutes > 0 && elapsedMinutes % 5 === 0) { // Log every 5 minutes
                console.log(`[Gemini] Processing... (${elapsedMinutes} minutes)`);
            }
            file = await genai.files.get({ name: file.name! });
        }

        if ((Date.now() - startTime) >= MAX_PROCESSING_TIME_MS) {
            throw new Error(`Gemini file processing timeout after 2 hours`);
        }

        if (file.state === 'FAILED') {
            throw new Error('Gemini file processing failed');
        }

        console.log(`[Gemini] File ready: ${file.uri}`);
        return file.uri!;

    } finally {
        try {
            fs.unlinkSync(tempPath);
        } catch { /* ignore */ }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════

export async function transcribe(
    fileUri: string,
    mimeType: string,
    duration: number
): Promise<TranscriptionResult> {
    console.log(`[Gemini] Transcribing video (${duration}s)...`);

    if (duration > 600) {
        return transcribeLongVideo(fileUri, mimeType, duration);
    }

    return transcribeSinglePass(fileUri, mimeType);
}

async function transcribeSinglePass(
    fileUri: string,
    mimeType: string
): Promise<TranscriptionResult> {
    const prompt = `Transcribe ALL spoken content from this video.

Instructions:
- Detect the language automatically
- Transcribe verbatim - capture every word
- Identify different speakers as SPEAKER_01, SPEAKER_02, etc.
- Include timestamps for each segment
- If no speech is detected, return empty segments array

Output JSON with schema: { segments: [{ startTime, endTime, speaker, text }] }`;

    const response = await callGemini(prompt, fileUri, mimeType, {
        type: Type.OBJECT,
        properties: {
            segments: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        startTime: { type: Type.STRING },
                        endTime: { type: Type.STRING },
                        speaker: { type: Type.STRING },
                        text: { type: Type.STRING },
                    },
                    required: ['startTime', 'endTime', 'speaker', 'text'],
                },
            },
        },
        required: ['segments'],
    });

    const segments: TranscriptionSegment[] = (response.segments || []).map((s: any) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        speaker: normalizeSpeaker(s.speaker),
        text: s.text || '',
    }));

    const fullText = segments.map(s => s.text).join(' ');

    console.log(`[Gemini] Transcription complete: ${segments.length} segments`);
    return { segments, fullText };
}

async function transcribeLongVideo(
    fileUri: string,
    mimeType: string,
    duration: number
): Promise<TranscriptionResult> {
    const CHUNK_DURATION = 300;
    const allSegments: TranscriptionSegment[] = [];

    for (let start = 0; start < duration; start += CHUNK_DURATION) {
        const end = Math.min(start + CHUNK_DURATION, duration);
        console.log(`[Gemini] Transcribing segment ${secondsToTime(start)} - ${secondsToTime(end)}...`);

        const prompt = `Transcribe spoken content from ${secondsToTime(start)} to ${secondsToTime(end)} of this video.
    
Instructions:
- Detect language automatically
- Transcribe verbatim
- Identify speakers as SPEAKER_01, SPEAKER_02, etc.
- Include timestamps relative to video start

Output JSON: { segments: [{ startTime, endTime, speaker, text }] }`;

        try {
            const response = await callGemini(prompt, fileUri, mimeType, {
                type: Type.OBJECT,
                properties: {
                    segments: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                startTime: { type: Type.STRING },
                                endTime: { type: Type.STRING },
                                speaker: { type: Type.STRING },
                                text: { type: Type.STRING },
                            },
                            required: ['startTime', 'endTime', 'speaker', 'text'],
                        },
                    },
                },
                required: ['segments'],
            });

            allSegments.push(...(response.segments || []).map((s: any) => ({
                startTime: s.startTime,
                endTime: s.endTime,
                speaker: normalizeSpeaker(s.speaker),
                text: s.text || '',
            })));

            await sleep(2000);
        } catch (error) {
            console.warn(`[Gemini] Segment transcription failed, continuing...`, error);
        }
    }

    const fullText = allSegments.map(s => s.text).join(' ');
    console.log(`[Gemini] Long video transcription complete: ${allSegments.length} segments`);

    return { segments: allSegments, fullText };
}

function normalizeSpeaker(speaker: string): string {
    if (!speaker) return 'SPEAKER_01';
    if (/^speaker\s*\d+$/i.test(speaker)) {
        const num = speaker.match(/\d+/)?.[0] || '1';
        return `SPEAKER_${num.padStart(2, '0')}`;
    }
    return speaker;
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNOPSIS
// ═══════════════════════════════════════════════════════════════════════════

export async function generateSynopsis(
    fileUri: string,
    mimeType: string,
    synopsisConfig: SynopsisConfig = {
        titleMaxChars: 60,
        loglineMaxWords: 30,
        summaryMaxWords: 100,
        language: 'English',
    },
    cacheName?: string
): Promise<SynopsisResult> {
    console.log(`[Gemini] Generating synopsis...${cacheName ? ' (using cache)' : ''}`);

    const prompt = `Analyze this video and create a compelling synopsis.

Generate in ${synopsisConfig.language}:
- title: Creative title (max ${synopsisConfig.titleMaxChars} characters)
- logline: One-sentence hook (max ${synopsisConfig.loglineMaxWords} words)  
- summary: Paragraph summary (max ${synopsisConfig.summaryMaxWords} words)
- fullSynopsis: Complete description (2-3 paragraphs)
- themes: Key themes explored
- targetAudience: Who would enjoy this

Write for a professional pitch deck. Be evocative and compelling.`;

    const response = await callGemini(prompt, fileUri, mimeType, {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            logline: { type: Type.STRING },
            summary: { type: Type.STRING },
            fullSynopsis: { type: Type.STRING },
            themes: { type: Type.STRING },
            targetAudience: { type: Type.STRING },
        },
        required: ['title', 'logline', 'summary', 'fullSynopsis', 'themes', 'targetAudience'],
    }, undefined, cacheName);

    console.log(`[Gemini] Synopsis complete: "${response.title}"`);
    return response as SynopsisResult;
}

// ═══════════════════════════════════════════════════════════════════════════
// FAUNA DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export async function detectFauna(
    fileUri: string,
    mimeType: string,
    faunaConfig: FaunaConfig = { primaryLanguage: 'English', secondaryLanguage: 'German' },
    cacheName?: string
): Promise<FaunaResult> {
    console.log(`[Gemini] Detecting fauna...${cacheName ? ' (using cache)' : ''}`);

    const prompt = `Identify every animal visible in this video.

For each sighting provide:
- commonName: Name in ${faunaConfig.primaryLanguage}
- latinName: Scientific name
- localName: Name in ${faunaConfig.secondaryLanguage}
- timecode: When first seen (HH:MM:SS)
- category: "Mammal", "Bird", "Reptile", "Fish", "Invertebrate", etc.
- confidence: 0.0 to 1.0
- behavior: Brief description of what the animal is doing
- iucnStatus: Conservation status if known (LC, NT, VU, EN, CR)

Be thorough - identify every distinct sighting.`;

    const response = await callGemini(prompt, fileUri, mimeType, {
        type: Type.OBJECT,
        properties: {
            sightings: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        commonName: { type: Type.STRING },
                        latinName: { type: Type.STRING },
                        localName: { type: Type.STRING },
                        timecode: { type: Type.STRING },
                        category: { type: Type.STRING },
                        confidence: { type: Type.NUMBER },
                        behavior: { type: Type.STRING },
                        iucnStatus: { type: Type.STRING },
                    },
                    required: ['commonName', 'latinName', 'timecode', 'category', 'confidence'],
                },
            },
        },
        required: ['sightings'],
    }, undefined, cacheName);

    const sightings = (response.sightings || []).map((s: any, i: number) => ({
        id: `fauna_${i}`,
        commonName: s.commonName || '',
        latinName: s.latinName || '',
        localName: s.localName || null,  // Optional - use null not undefined
        timecode: s.timecode || '00:00:00',
        category: s.category || 'Unknown',
        confidence: s.confidence || 0,
        behavior: s.behavior || null,     // Optional - use null not undefined
        iucnStatus: s.iucnStatus || null, // Optional - use null not undefined
    }));

    const categories: Record<string, number> = {};
    for (const s of sightings) {
        categories[s.category] = (categories[s.category] || 0) + 1;
    }

    console.log(`[Gemini] Fauna detection complete: ${sightings.length} sightings`);
    return {
        sightings,
        totalSpecies: new Set(sightings.map((s: any) => s.latinName)).size,
        categories,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAPHICS DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export async function detectGraphics(
    fileUri: string,
    mimeType: string,
    duration: number,
    cacheName?: string
): Promise<GraphicsResult> {
    console.log(`[Gemini] Detecting graphics...${cacheName ? ' (using cache)' : ''}`);

    const prompt = `Identify all on-screen text and graphics in this video.

Look for:
- Title cards and opening credits
- Lower thirds (name/title text at bottom)
- Location indicators
- Date/time stamps
- End credits
- Any other text overlays

For each, provide:
- type: "title", "lower_third", "graphic", "text"
- content: The text shown
- timecodeIn: When it appears (HH:MM:SS:FF)
- timecodeOut: When it disappears
- position: Where on screen ("bottom_left", "center", etc.)`;

    const response = await callGemini(prompt, fileUri, mimeType, {
        type: Type.OBJECT,
        properties: {
            entries: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        type: { type: Type.STRING },
                        content: { type: Type.STRING },
                        timecodeIn: { type: Type.STRING },
                        timecodeOut: { type: Type.STRING },
                        position: { type: Type.STRING },
                    },
                    required: ['type', 'content', 'timecodeIn', 'timecodeOut'],
                },
            },
            programTitle: { type: Type.STRING },
        },
        required: ['entries'],
    }, undefined, cacheName);

    console.log(`[Gemini] Graphics detection complete: ${response.entries?.length || 0} entries`);
    return {
        entries: response.entries || [],
        programTitle: response.programTitle || '',  // Firestore doesn't accept undefined
        runtime: secondsToTime(duration),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// CAST/PEOPLE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export async function detectCast(
    fileUri: string,
    mimeType: string,
    cacheName?: string
): Promise<CastResult> {
    console.log(`[Gemini] Detecting cast...${cacheName ? ' (using cache)' : ''}`);

    const prompt = `Identify all people visible in this video.

CRITICAL ANTI-HALLUCINATION RULES:
- ONLY use names that are EXPLICITLY shown on screen (lower thirds, title cards) or SPOKEN in the video
- If a person's name is NOT visible or mentioned, use a descriptive label like "Man in blue shirt" or "Interviewer"
- NEVER invent or guess names based on appearance
- For biographies: ONLY include facts that can be verified from the video content or that are widely known public information
- If you cannot verify biographical details, describe ONLY what is observable in the video
- When uncertain, always prefer "Unknown" over guessing

For each person provide:
- name: Their name if EXPLICITLY identified in video, otherwise use a description
- fullName: Full name ONLY if shown/spoken in video
- title: Their role or profession ONLY if stated in video
- biography: Brief bio ONLY if they are a publicly known figure with verifiable information. Otherwise, describe their role and appearance in the video only.
- firstAppearance: Timecode when first seen (HH:MM:SS)

If someone is identified by name in lower thirds or narration, use that exact name.
For unidentified people, use descriptive names like "Woman with glasses" or "Host".`;


    const response = await callGemini(prompt, fileUri, mimeType, {
        type: Type.OBJECT,
        properties: {
            people: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        fullName: { type: Type.STRING },
                        title: { type: Type.STRING },
                        biography: { type: Type.STRING },
                        firstAppearance: { type: Type.STRING },
                    },
                    required: ['name', 'title', 'biography', 'firstAppearance'],
                },
            },
        },
        required: ['people'],
    }, undefined, cacheName);

    const people = (response.people || []).map((p: any, i: number) => ({
        id: `person_${i}`,
        name: p.name || 'Unknown',
        fullName: p.fullName || p.name || 'Unknown',
        title: p.title || '',
        biography: p.biography || '',
        firstAppearance: p.firstAppearance || '00:00:00',
        isIdentified: isRealName(p.name),
    }));

    console.log(`[Gemini] Cast detection complete: ${people.length} people`);
    return {
        people,
        totalPeople: people.length,
    };
}

function isRealName(name: string): boolean {
    if (!name) return false;
    const descriptivePatterns = [
        /\bman\b/i, /\bwoman\b/i, /\bperson\b/i, /\bchild\b/i,
        /\bnarrator\b/i, /\bspeaker\b/i, /\bunknown\b/i, /\bunidentified\b/i,
    ];
    return !descriptivePatterns.some(p => p.test(name)) && /[A-Z]/.test(name);
}

// ═══════════════════════════════════════════════════════════════════════════
// SHOT ENRICHMENT
// ═══════════════════════════════════════════════════════════════════════════

// Progress callback type for intra-module updates
export type ProgressCallback = (percent: number, message: string) => void;

export async function enrichShots(
    fileUri: string,
    mimeType: string,
    shots: Array<{ tcIn: string; tcOut: string }>,
    language = 'English',
    cacheName?: string,
    onProgress?: ProgressCallback
): Promise<Shot[]> {
    console.log(`[Gemini] Enriching ${shots.length} shots...${cacheName ? ' (using cache)' : ''}`);

    // Dynamic batch size based on shot count (larger batches = fewer API calls = lower cost)
    const BATCH_SIZE = shots.length > 200 ? 100 : 50;

    if (shots.length <= BATCH_SIZE) {
        try {
            onProgress?.(50, 'Processing shots...');
            const result = await enrichShotsBatch(fileUri, mimeType, shots, language, cacheName);
            onProgress?.(100, 'Complete');
            return result;
        } catch (error) {
            console.warn(`[Gemini] Shot enrichment failed, returning structural data only:`, error);
            return shots.map((shot, i) => ({
                index: i + 1,
                tcIn: shot.tcIn,
                tcOut: shot.tcOut,
                duration: calculateDuration(shot.tcIn, shot.tcOut),
                description: `Shot ${i + 1}`,
                action: '',
                audio: '',
            }));
        }
    }

    const enrichedShots: Shot[] = [];
    let failedBatches = 0;
    const totalBatches = Math.ceil(shots.length / BATCH_SIZE);

    for (let i = 0; i < shots.length; i += BATCH_SIZE) {
        const batch = shots.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        console.log(`[Gemini] Enriching batch ${batchNum}/${totalBatches}...`);

        // Report progress
        const progressPct = Math.floor((batchNum / totalBatches) * 100);
        onProgress?.(progressPct, `Processing batch ${batchNum}/${totalBatches}`);

        try {
            const batchResults = await enrichShotsBatch(fileUri, mimeType, batch, language, cacheName);
            enrichedShots.push(...batchResults.map((s, j) => ({ ...s, index: i + j + 1 })));
        } catch (error) {
            // Log but continue - return structural data for this batch
            console.warn(`[Gemini] Batch ${batchNum}/${totalBatches} enrichment failed:`, error);
            failedBatches++;

            // Add structural-only shots for this batch
            batch.forEach((shot, j) => {
                enrichedShots.push({
                    index: i + j + 1,
                    tcIn: shot.tcIn,
                    tcOut: shot.tcOut,
                    duration: calculateDuration(shot.tcIn, shot.tcOut),
                    description: `Shot ${i + j + 1}`,
                    action: '',
                    audio: '',
                });
            });
        }

        if (i + BATCH_SIZE < shots.length) {
            await sleep(1000);
        }
    }

    if (failedBatches > 0) {
        console.warn(`[Gemini] Shot enrichment completed with ${failedBatches} failed batches (partial AI descriptions)`);
    }

    return enrichedShots;
}

async function enrichShotsBatch(
    fileUri: string,
    mimeType: string,
    shots: Array<{ tcIn: string; tcOut: string }>,
    language: string,
    cacheName?: string
): Promise<Shot[]> {
    const shotList = shots.map((s, i) => ({
        id: i,
        start: s.tcIn,
        end: s.tcOut,
    }));

    const prompt = `Analyze each shot in this video and provide descriptions.

Shot boundaries:
${JSON.stringify(shotList, null, 2)}

For each shot, provide in ${language}:
- id: The shot ID from the list above
- description: What is visually shown (be specific)
- action: Main action or movement
- audio: Notable sounds, music, or dialogue

Use professional film terminology.`;

    const response = await callGemini(prompt, fileUri, mimeType, {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                id: { type: Type.NUMBER },
                description: { type: Type.STRING },
                action: { type: Type.STRING },
                audio: { type: Type.STRING },
            },
            required: ['id', 'description', 'action', 'audio'],
        },
    }, undefined, cacheName);

    const enrichments = Array.isArray(response) ? response : [];
    const enrichmentMap = new Map(enrichments.map((e: any) => [e.id, e]));

    return shots.map((shot, i) => {
        const enrichment = enrichmentMap.get(i);
        const duration = calculateDuration(shot.tcIn, shot.tcOut);

        return {
            index: i + 1,
            tcIn: shot.tcIn,
            tcOut: shot.tcOut,
            duration,
            description: enrichment?.description || `Shot ${i + 1}`,
            action: enrichment?.action || '',
            audio: enrichment?.audio || '',
        };
    });
}

function calculateDuration(tcIn: string, tcOut: string): string {
    const parseTC = (tc: string) => {
        const parts = tc.split(':').map(Number);
        if (parts.length === 4) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / 25;
        }
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    };

    const diff = parseTC(tcOut) - parseTC(tcIn);
    return secondsToTimecode(diff);
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Call Gemini API with rate limiting, circuit breaker, and retry logic
 * Supports context caching for token cost reduction
 */
async function callGemini(
    prompt: string,
    fileUri: string,
    mimeType: string,
    schema: any,
    expectedMinItems?: number, // For truncation detection
    cacheName?: string // Optional cached content name
): Promise<any> {
    // Check circuit breaker
    if (!geminiCircuitBreaker.canRequest()) {
        throw new Error('Circuit breaker open: too many consecutive Gemini failures. Waiting for recovery.');
    }

    try {
        // Acquire rate limit token
        await geminiRateLimiter.acquire();

        const result = await retry(
            async () => {
                // Build content based on whether we have a cache or not
                const generateParams = cacheName
                    ? {
                        // Use cached content (90% cheaper)
                        model: MODEL,
                        contents: [{ text: prompt }],
                        config: {
                            responseMimeType: 'application/json',
                            responseSchema: schema,
                            cachedContent: cacheName,
                        },
                    }
                    : {
                        // No cache - send file directly
                        model: MODEL,
                        contents: [
                            { fileData: { fileUri, mimeType } },
                            { text: prompt },
                        ],
                        config: {
                            responseMimeType: 'application/json',
                            responseSchema: schema,
                        },
                    };

                const response = await genai.models.generateContent(generateParams);

                // Check for truncation (output token limit hit)
                const finishReason = response.candidates?.[0]?.finishReason;
                if (finishReason === 'MAX_TOKENS') {
                    console.warn('[Gemini] Response truncated due to MAX_TOKENS');
                    throw new Error('Response truncated: MAX_TOKENS. Consider reducing batch size.');
                }
                if (finishReason === 'SAFETY') {
                    console.warn('[Gemini] Response blocked due to SAFETY filters');
                    throw new Error('Response blocked by safety filters.');
                }

                const text = response.text || '';
                if (!text || text.trim().length < 10) {
                    console.warn('[Gemini] Empty or near-empty response received');
                    return schema.type === Type.ARRAY ? [] : {};
                }

                const parsed = parseJson(text);

                // Validate minimum expected items (truncation detection)
                if (expectedMinItems && Array.isArray(parsed) && parsed.length < expectedMinItems * 0.5) {
                    console.warn(`[Gemini] Parsed ${parsed.length} items, expected ~${expectedMinItems}. Possible truncation.`);
                }

                return parsed;
            },
            {
                maxAttempts: 5,
                retryIf: isRetryableError,
            }
        );

        // Record success for circuit breaker
        geminiCircuitBreaker.recordSuccess();
        return result;

    } catch (error) {
        // Record failure for circuit breaker
        geminiCircuitBreaker.recordFailure();
        throw error;
    }
}

function parseJson(text: string): any {
    let clean = text.trim();
    clean = clean.replace(/^```(?:json)?\s*|```$/g, '');

    const match = clean.match(/({\s*[\s\S]*\s*}|\[\s*[\s\S]*\s*\])/);
    if (match) {
        clean = match[0];
    }

    clean = clean.replace(/,(\s*[}\]])/g, '$1');

    try {
        return JSON.parse(clean);
    } catch (error) {
        // Check for truncation symptoms
        if (clean.endsWith('...') || !clean.endsWith('}') && !clean.endsWith(']')) {
            console.error('[Gemini] JSON appears truncated:', clean.substring(clean.length - 50));
            throw new Error('Response truncated mid-JSON. Reduce batch size or try again.');
        }
        console.error('[Gemini] JSON parse failed:', clean.substring(0, 200));
        throw new Error('Invalid JSON response from Gemini');
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
