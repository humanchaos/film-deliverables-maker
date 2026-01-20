/**
 * Gemini Service
 * 
 * SINGLE source of truth for ALL Gemini API operations.
 * No duplicates anywhere else in the codebase.
 */

import { GoogleGenAI, Type } from '@google/genai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../config/env.js';
import * as storage from './storage.js';
import { retry, isRetryableError } from '../utils/retry.js';
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

// Model to use for all operations
const MODEL = 'gemini-2.0-flash';

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
        console.log(`[Gemini] Downloaded ${(stats.size / 1024 / 1024).toFixed(1)}MB`);

        // Upload to Gemini
        const fileData = fs.readFileSync(tempPath);
        const uploadResult = await genai.files.upload({
            file: new Blob([fileData], { type: mimeType }),
            config: {
                mimeType,
                displayName: `job_${jobId}`,
            },
        });

        console.log(`[Gemini] Upload started: ${uploadResult.name}`);

        // Wait for processing
        let file = uploadResult;
        while (file.state === 'PROCESSING') {
            console.log(`[Gemini] Processing...`);
            await sleep(5000);
            file = await genai.files.get({ name: file.name! });
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
    }
): Promise<SynopsisResult> {
    console.log(`[Gemini] Generating synopsis...`);

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
    });

    console.log(`[Gemini] Synopsis complete: "${response.title}"`);
    return response as SynopsisResult;
}

// ═══════════════════════════════════════════════════════════════════════════
// FAUNA DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export async function detectFauna(
    fileUri: string,
    mimeType: string,
    faunaConfig: FaunaConfig = { primaryLanguage: 'English', secondaryLanguage: 'German' }
): Promise<FaunaResult> {
    console.log(`[Gemini] Detecting fauna...`);

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
    });

    const sightings = (response.sightings || []).map((s: any, i: number) => ({
        id: `fauna_${i}`,
        ...s,
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
    duration: number
): Promise<GraphicsResult> {
    console.log(`[Gemini] Detecting graphics...`);

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
    });

    console.log(`[Gemini] Graphics detection complete: ${response.entries?.length || 0} entries`);
    return {
        entries: response.entries || [],
        programTitle: response.programTitle,
        runtime: secondsToTime(duration),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// CAST/PEOPLE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export async function detectCast(
    fileUri: string,
    mimeType: string
): Promise<CastResult> {
    console.log(`[Gemini] Detecting cast...`);

    const prompt = `Identify all people visible in this video.

For each person provide:
- name: Their name if identified, or description ("Man in red jacket")
- fullName: Full name if known
- title: Their role or profession if apparent
- biography: Brief bio (2-3 sentences) if they're a known figure, otherwise describe their appearance/role in the video
- firstAppearance: Timecode when first seen (HH:MM:SS)

If someone is identified by name in lower thirds or narration, use that name.
For unidentified people, use descriptive names.`;

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
    });

    const people = (response.people || []).map((p: any, i: number) => ({
        id: `person_${i}`,
        name: p.name,
        fullName: p.fullName || p.name,
        title: p.title,
        biography: p.biography,
        firstAppearance: p.firstAppearance,
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

export async function enrichShots(
    fileUri: string,
    mimeType: string,
    shots: Array<{ tcIn: string; tcOut: string }>,
    language = 'English'
): Promise<Shot[]> {
    console.log(`[Gemini] Enriching ${shots.length} shots...`);

    const BATCH_SIZE = 50;

    if (shots.length <= BATCH_SIZE) {
        return enrichShotsBatch(fileUri, mimeType, shots, language);
    }

    const enrichedShots: Shot[] = [];
    for (let i = 0; i < shots.length; i += BATCH_SIZE) {
        const batch = shots.slice(i, i + BATCH_SIZE);
        console.log(`[Gemini] Enriching batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(shots.length / BATCH_SIZE)}...`);

        const batchResults = await enrichShotsBatch(fileUri, mimeType, batch, language);
        enrichedShots.push(...batchResults.map((s, j) => ({ ...s, index: i + j + 1 })));

        if (i + BATCH_SIZE < shots.length) {
            await sleep(1000);
        }
    }

    return enrichedShots;
}

async function enrichShotsBatch(
    fileUri: string,
    mimeType: string,
    shots: Array<{ tcIn: string; tcOut: string }>,
    language: string
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
    });

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

async function callGemini(
    prompt: string,
    fileUri: string,
    mimeType: string,
    schema: any
): Promise<any> {
    return retry(
        async () => {
            const response = await genai.models.generateContent({
                model: MODEL,
                contents: [
                    { fileData: { fileUri, mimeType } },
                    { text: prompt },
                ],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                },
            });

            const text = response.text || '';
            if (!text || text.trim().length < 10) {
                return schema.type === Type.ARRAY ? [] : {};
            }

            return parseJson(text);
        },
        {
            maxAttempts: 3,
            retryIf: isRetryableError,
        }
    );
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
        console.error('[Gemini] JSON parse failed:', clean.substring(0, 200));
        throw new Error('Invalid JSON response from Gemini');
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
