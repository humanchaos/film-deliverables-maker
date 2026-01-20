import { getGenAIClient, createFileDataPart } from './genaiClient';
import { Type } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { config } from '../config/env';
import {
    AnalysisResult,
    Synopsis,
    SynopsisConfig,
    GraphicsAnalysisResult,
    TranscriptionResult,
    SpeciesSighting
} from '../types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const storage = new Storage();

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT CACHING SUPPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for using cached context instead of re-uploading video
 * When cacheName is provided, we use the cached video context (77% token savings)
 * When cacheName is null/undefined, we fall back to the original fileUri approach
 */
export interface CacheOptions {
    cacheName?: string | null;  // Name of the cached content from contextCacheManager
}

/**
 * Helper to get model - uses cached content if available, otherwise standard model
 */
function getModelWithOptionalCache(
    modelName: string,
    generationConfig: any,
    cacheName?: string | null
): { generateContent: (request: any) => Promise<any> } {
    const ai = getGenAIClient();

    // Return a wrapper object that mimics the model interface
    if (cacheName) {
        // Use cached content - 75% token savings
        console.log(`[CacheSupport] Using cached context: ${cacheName}`);
        return {
            generateContent: async (request: any) => {
                try {
                    return await ai.models.generateContent({
                        model: modelName,
                        contents: request.contents,
                        config: {
                            ...generationConfig,
                            cachedContent: cacheName,
                        },
                    });
                } catch (e: any) {
                    console.warn(`[CacheSupport] Failed to use cache, falling back to direct:`, e.message);
                    return await ai.models.generateContent({
                        model: modelName,
                        contents: request.contents,
                        config: generationConfig,
                    });
                }
            }
        };
    }
    // Fallback: standard model without cache
    return {
        generateContent: async (request: any) => {
            return await ai.models.generateContent({
                model: modelName,
                contents: request.contents,
                config: generationConfig,
            });
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEMINI FILES API UPLOAD (Download from GCS, upload to Gemini)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Downloads a video from GCS and uploads it to Gemini Files API.
 * Returns the Gemini file URI for use in analysis.
 * Caches the URI in Firestore to avoid re-uploading.
 */
export async function uploadGCSVideoToGemini(gcsUri: string, mimeType: string, jobId: string): Promise<string> {
    console.log(`[GeminiUpload] Uploading ${gcsUri} to Gemini Files API...`);

    // Parse GCS URI: gs://bucket/path/to/file.mp4
    const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
    if (!match) {
        throw new Error(`Invalid GCS URI: ${gcsUri}`);
    }
    const [, bucket, filePath] = match;

    // Create temp file path
    const tempFileName = `gemini_upload_${jobId}_${Date.now()}${path.extname(filePath)}`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    try {
        // 1. Download from GCS to temp file
        console.log(`[GeminiUpload] Downloading from GCS to ${tempFilePath}...`);
        await storage.bucket(bucket).file(filePath).download({
            destination: tempFilePath
        });

        const stats = fs.statSync(tempFilePath);
        console.log(`[GeminiUpload] Downloaded ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        // 2. Upload to Gemini Files API
        console.log(`[GeminiUpload] Uploading to Gemini Files API...`);
        const ai = getGenAIClient();

        // New SDK uses createFileFromPath or upload with file buffer
        const fileData = fs.readFileSync(tempFilePath);
        const uploadResult = await ai.files.upload({
            file: new Blob([fileData], { type: mimeType }),
            config: {
                mimeType: mimeType,
                displayName: `job_${jobId}_video`,
            },
        });

        console.log(`[GeminiUpload] Upload started, file: ${uploadResult.name}`);

        // 3. Wait for file processing to complete
        let file = uploadResult;
        while (file.state === 'PROCESSING') {
            console.log(`[GeminiUpload] Waiting for file processing...`);
            await new Promise(r => setTimeout(r, 5000));
            file = await ai.files.get({ name: file.name! });
        }

        if (file.state === 'FAILED') {
            throw new Error(`Gemini file processing failed: ${file.name}`);
        }

        console.log(`[GeminiUpload] File ready: ${file.uri}`);
        return file.uri!;

    } finally {
        // Clean up temp file
        try {
            fs.unlinkSync(tempFilePath);
            console.log(`[GeminiUpload] Cleaned up temp file`);
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function repairJson(jsonString: string): string {
    let fixed = jsonString.trim();
    // 1. Remove Markdown code blocks
    fixed = fixed.replace(/^```(json)?|```$/g, '');
    // 2. Extract JSON object/array if embedded in text
    const jsonMatch = fixed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
        fixed = jsonMatch[0];
    }
    // 3. Fix trailing commas (common AI error)
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    return fixed;
}

function safeJsonParse<T>(jsonString: string): T {
    try {
        const cleanString = repairJson(jsonString);
        if (!cleanString) throw new Error("Empty JSON response");
        return JSON.parse(cleanString);
    } catch (e) {
        console.warn("Initial JSON parse failed, attempting aggressive repair...", e);
        try {
            let aggressiveFix = jsonString.replace(/,(\s*)/g, ',$1');
            aggressiveFix = aggressiveFix.replace(/([}\]])[\s\S]*$/, '$1');
            return JSON.parse(repairJson(aggressiveFix));
        } catch (e2) {
            console.error("Failed to parse JSON response:", jsonString, e2);
            throw new Error("INVALID_API_RESPONSE");
        }
    }
}

function formatDuration(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return "00:00:00";
    const totalSeconds = Math.floor(seconds);
    const h = Math.floor(totalSeconds / 3600), m = Math.floor((totalSeconds % 3600) / 60), s = totalSeconds % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNOPSIS GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

export const analyzeVideoContent = async (
    fileUri: string,
    mimeType: string,
    cacheOptions?: CacheOptions
): Promise<AnalysisResult> => {
    console.log(`[DEEP-DEBUG] analyzeVideoContent called`);
    console.log(`[DEEP-DEBUG] fileUri: ${fileUri}`);
    console.log(`[DEEP-DEBUG] mimeType: ${mimeType}`);
    console.log(`[DEEP-DEBUG] cacheName: ${cacheOptions?.cacheName || 'none (using direct fileUri)'}`);
    console.log(`[DEEP-DEBUG] API Key present: ${!!config.geminiApiKey}`);
    console.log(`[DEEP-DEBUG] API Key first 10 chars: ${config.geminiApiKey?.substring(0, 10)}...`);

    try {
        const prompt = `
      You are an expert video analysis AI. Analyze the provided video file.
      Your task is to synthesize all information into a final, cohesive analysis in JSON format.
      - Transcribe spoken words if present.
      - Summarize the entire video in one sentence.
      - Create a single, chronological list of the most important key events.
      - Infer any potential dialogue or important sounds based on visual cues if audio is unclear.
      
      **CRITICAL:** Base all descriptions strictly on the video content. Do not invent details not present in the video.
    `;

        const modelConfig: any = {
            model: 'gemini-2.0-flash', // Updated to 2.0 Flash (1.5 models deprecated)
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        summary: { type: Type.STRING, description: "A brief, one-sentence summary of the video's content." },
                        events: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    timestamp: { type: Type.STRING, description: "Approximate time or sequence of the event (e.g., '00:05', 'Beginning', 'Middle')." },
                                    description: { type: Type.STRING, description: "A detailed description of what is happening in the event." },
                                },
                                required: ['timestamp', 'description'],
                            },
                        },
                        inferred_dialogue: { type: Type.STRING, description: "An inferred transcription of what might be said, based on visual cues." },
                        transcription: { type: Type.STRING, description: "A transcription of the spoken content from the audio track. If no audio was provided, state that." },
                    },
                    required: ['summary', 'events', 'inferred_dialogue', 'transcription'],
                },
            }
        };

        console.log(`[DEEP-DEBUG] Getting model with config:`, JSON.stringify(modelConfig.model));
        const model = getModelWithOptionalCache(
            modelConfig.model,
            modelConfig.generationConfig,
            cacheOptions?.cacheName
        );

        // Build content array - skip fileData if using cached context
        const contentParts: any[] = [];
        if (!cacheOptions?.cacheName) {
            contentParts.push({ fileData: { fileUri: fileUri, mimeType: mimeType } });
        }
        contentParts.push({ text: prompt });

        console.log(`[DEEP-DEBUG] Calling generateContent (cached: ${!!cacheOptions?.cacheName})...`);
        const result = await model.generateContent({ contents: contentParts });

        console.log(`[DEEP-DEBUG] generateContent returned successfully`);
        const rawText = result.text || '';
        console.log(`[DEEP-DEBUG] Response text length: ${rawText.length}`);

        // Graceful handling for empty/minimal responses (content-sparse videos)
        if (!rawText || rawText.trim().length < 10) {
            console.warn(`[Synopsis] Empty or minimal response - returning default analysis`);
            return {
                summary: 'Video content could not be analyzed (no detectable content)',
                events: [],
                inferred_dialogue: '',
                transcription: ''
            };
        }
        return safeJsonParse<AnalysisResult>(rawText);

    } catch (error: any) {
        console.error(`[Synopsis] ✗ Analysis failed: ${error.message}`);
        // Return default result instead of throwing for graceful degradation
        return {
            summary: 'Analysis failed - video may not contain analyzable content',
            events: [],
            inferred_dialogue: '',
            transcription: ''
        };
    }
};

export const generateSynopsisFromAnalysis = async (
    analysis: AnalysisResult,
    writer: string,
    director: string,
    language: string,
    keywords: string,
    synopsisConfig: SynopsisConfig
): Promise<Synopsis> => {

    try {
        const prompt = `
          You are a master screenwriter and film marketing expert. Your task is to transform raw video analysis data into a compelling, professional film synopsis and marketing profile. Your writing should be evocative and ready for a pitch deck.

          **Your Constraints:**
          - **Language:** Generate all content in: ${language}.
          - **Title:** Maximum ${synopsisConfig.titleMaxChars} characters.
          - **One Line (Logline):** Approximately ${synopsisConfig.loglineMaxWords} words.
          - **Paragraph (Summary):** Approximately ${synopsisConfig.summaryMaxWords} words.
          - **Key Themes:** Approximately ${synopsisConfig.keyThemesMaxWords} words.
          - **Target Audience:** Approximately ${synopsisConfig.targetAudienceMaxWords} words.
          
          **Video Analysis Data:**
          - Transcription: "${analysis.transcription}"
          - Summary: "${analysis.summary}"
          - Key Events: ${JSON.stringify(analysis.events.map(e => e.description))}
          - Inferred Dialogue: "${analysis.inferred_dialogue}"

          Your output must be a single JSON object with keys: "title", "oneLine", "paragraph", "fullSynopsis", "keyThemes", "targetAudience".
      `;

        const ai = getGenAIClient();
        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        oneLine: { type: Type.STRING },
                        paragraph: { type: Type.STRING },
                        fullSynopsis: { type: Type.STRING },
                        keyThemes: { type: Type.STRING },
                        targetAudience: { type: Type.STRING }
                    },
                    required: ['title', 'oneLine', 'paragraph', 'fullSynopsis', 'keyThemes', 'targetAudience']
                }
            }
        });

        const aiGeneratedContent = safeJsonParse<any>(result.text || '');

        return {
            ...aiGeneratedContent,
            writtenBy: writer,
            directedBy: director,
        };

    } catch (error: any) {
        console.error("Error generating synopsis with Gemini:", error);
        throw new Error("SYNOPSIS_FAIL");
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPHICS
// ═══════════════════════════════════════════════════════════════════════════════

export async function analyzeGraphicsAndLowerThirds(
    fileUri: string, mimeType: string, duration: number, filmTitle: string,
    cacheOptions?: CacheOptions
): Promise<GraphicsAnalysisResult> {
    console.log(`[DEEP-DEBUG] analyzeGraphicsAndLowerThirds (GRAPHICS) called`);
    console.log(`[DEEP-DEBUG] fileUri: ${fileUri?.substring(0, 80)}...`);
    console.log(`[DEEP-DEBUG] mimeType: ${mimeType}, duration: ${duration}`);
    console.log(`[DEEP-DEBUG] cacheName: ${cacheOptions?.cacheName || 'none'}`);

    const prompt = `You are a post-production assistant with excellent OCR skills. Analyze the provided video file. Your task is to identify and transcribe all on-screen graphics (e.g., title cards, location indicators) and lower thirds. Output strictly JSON.`;

    try {
        console.log(`[DEEP-DEBUG] Creating gemini-2.0-flash model for graphics analysis`);
        const generationConfig = {
            responseMimeType: 'application/json',
            temperature: 0.2,
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    programTitle: { type: Type.STRING },
                    runtime: { type: Type.STRING },
                    graphics: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT, properties: {
                                description: { type: Type.STRING },
                                timecodeIn: { type: Type.STRING },
                                timecodeOut: { type: Type.STRING },
                                cleanTimecodeIn: { type: Type.STRING },
                                cleanTimecodeOut: { type: Type.STRING },
                            },
                            required: ["description", "timecodeIn", "timecodeOut"],
                        },
                    },
                    lowerThirds: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT, properties: {
                                text: { type: Type.STRING },
                                timecodeIn: { type: Type.STRING },
                                timecodeOut: { type: Type.STRING }
                            },
                            required: ["text", "timecodeIn", "timecodeOut"],
                        },
                    },
                },
                required: ["programTitle", "runtime", "graphics", "lowerThirds"],
            },
        };
        const model = getModelWithOptionalCache('gemini-2.0-flash', generationConfig, cacheOptions?.cacheName);

        // Build content array - skip fileData if using cached context
        const contentParts: any[] = [];
        if (!cacheOptions?.cacheName) {
            contentParts.push({ fileData: { fileUri: fileUri, mimeType: mimeType } });
        }
        contentParts.push({ text: prompt });

        console.log(`[Graphics] Calling generateContent (cached: ${!!cacheOptions?.cacheName})...`);
        const result = await model.generateContent({ contents: contentParts });

        console.log(`[Graphics] generateContent returned successfully`);
        const rawText = result.text || '';

        // Graceful handling for empty responses (no graphics detected)
        if (!rawText || rawText.trim().length < 10) {
            console.warn(`[Graphics] Empty response - no graphics detected in video`);
            return {
                programTitle: filmTitle,
                runtime: formatDuration(duration),
                graphics: [],
                lowerThirds: []
            };
        }

        const parsedResult = safeJsonParse<GraphicsAnalysisResult>(rawText);
        console.log(`[Graphics] Found ${parsedResult.graphics?.length || 0} graphics, ${parsedResult.lowerThirds?.length || 0} lower thirds`);
        parsedResult.programTitle = filmTitle;
        parsedResult.runtime = formatDuration(duration);
        return parsedResult;
    } catch (e: any) {
        console.warn(`[Graphics] Analysis failed: ${e.message} - returning empty result`);
        // Return empty result instead of throwing for graceful degradation
        return {
            programTitle: filmTitle,
            runtime: formatDuration(duration),
            graphics: [],
            lowerThirds: []
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FAUNA FINDER
// ═══════════════════════════════════════════════════════════════════════════════

export async function analyzeVideoForSpecies(
    fileUri: string,
    mimeType: string,
    primaryLanguage: string,
    secondaryLanguage: string,
    videoDuration: number = 0,
    cacheOptions?: CacheOptions
): Promise<Omit<SpeciesSighting, 'id' | 'thumbnail'>[]> {
    console.log(`[DEEP-DEBUG] analyzeVideoForSpecies (FAUNA) called`);
    console.log(`[DEEP-DEBUG] fileUri: ${fileUri?.substring(0, 80)}...`);
    console.log(`[DEEP-DEBUG] mimeType: ${mimeType}, duration: ${videoDuration}`);
    console.log(`[DEEP-DEBUG] cacheName: ${cacheOptions?.cacheName || 'none'}`);

    const prompt = `Analyze this video. Your task is to identify **every single animal sighting**. 
    Provide: 
    - 'commonName': The common name in ${primaryLanguage}.
    - 'latinName': The scientific name.
    - 'germanName': The common name in ${secondaryLanguage}.
    - 'timecode': The EXACT timecode.
    - 'category': (e.g., "Mammal", "Bird").
    - 'confidence': 0.0 to 1.0.
    - 'behavior': Brief description.
    - 'iucnStatus': IUCN status if known.
    - 'encounterGroup': Group ID if same individual seen multiple times.
    
    The final output must be a valid JSON object with a single key "sightings".`;

    try {
        console.log(`[DEEP-DEBUG] Creating gemini-2.0-flash model for fauna analysis`);
        const generationConfig = {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    sightings: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                commonName: { type: Type.STRING },
                                latinName: { type: Type.STRING },
                                germanName: { type: Type.STRING },
                                timecode: { type: Type.STRING },
                                category: { type: Type.STRING },
                                confidence: { type: Type.NUMBER },
                                behavior: { type: Type.STRING },
                                iucnStatus: { type: Type.STRING },
                                encounterGroup: { type: Type.STRING },
                            },
                            required: ["commonName", "latinName", "timecode", "category", "confidence"],
                        },
                    },
                },
                required: ["sightings"],
            },
        };
        const model = getModelWithOptionalCache('gemini-2.0-flash', generationConfig, cacheOptions?.cacheName);

        // Build content array - skip fileData if using cached context
        const contentParts: any[] = [];
        if (!cacheOptions?.cacheName) {
            contentParts.push({ fileData: { fileUri: fileUri, mimeType: mimeType } });
        }
        contentParts.push({ text: prompt });

        console.log(`[Fauna] Calling generateContent (cached: ${!!cacheOptions?.cacheName})...`);
        const result = await model.generateContent({ contents: contentParts });

        console.log(`[Fauna] generateContent returned successfully`);
        const rawText = result.text || '';

        // Graceful handling for empty responses (no animals detected)
        if (!rawText || rawText.trim().length < 10) {
            console.warn(`[Fauna] Empty response - no species detected in video`);
            return [];
        }

        const parsed = safeJsonParse<any>(rawText);
        console.log(`[Fauna] Found ${parsed.sightings?.length || 0} sightings`);
        return parsed.sightings || [];

    } catch (e: any) {
        console.warn(`[Fauna] Analysis failed: ${e.message} - returning empty result`);
        // Return empty array instead of throwing for graceful degradation
        return [];
    }
}

export async function transcribeMedia(
    fileUri: string, mimeType: string, videoDuration: number = 0,
    cacheOptions?: CacheOptions
): Promise<Omit<TranscriptionResult, 'speakerMap'>> {
    console.log(`[DEEP-DEBUG] transcribeMedia called`);
    console.log(`[DEEP-DEBUG] fileUri: ${fileUri?.substring(0, 80)}...`);
    console.log(`[DEEP-DEBUG] mimeType: ${mimeType}, duration: ${videoDuration}`);
    console.log(`[DEEP-DEBUG] cacheName: ${cacheOptions?.cacheName || 'none'}`);

    // For short videos (< 10 min), use single-pass
    if (videoDuration < 600 || videoDuration === 0) {
        console.log(`[DEEP-DEBUG] Using single-pass transcription (short video)`);
        return transcribeMediaSinglePass(fileUri, mimeType, cacheOptions);
    }

    // For long videos, use segmented processing (5-minute segments)
    const SEGMENT_DURATION = 300; // 5 minutes
    const segments: { start: number; end: number }[] = [];
    for (let start = 0; start < videoDuration; start += SEGMENT_DURATION) {
        segments.push({ start, end: Math.min(start + SEGMENT_DURATION, videoDuration) });
    }

    const allSegments: any[] = [];
    // SEQUENTIAL PROCESSING: Avoid 429 rate limits on long videos
    // Changed from BATCH_SIZE=3/50ms to BATCH_SIZE=1/2000ms for rate limit safety
    const BATCH_SIZE = 1;  // Process one segment at a time
    const DELAY_BETWEEN_SEGMENTS_MS = 2000;  // 2 seconds between segments

    console.log(`[Transcribe] Processing ${segments.length} segments SEQUENTIALLY with ${DELAY_BETWEEN_SEGMENTS_MS}ms delays...`);

    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
        const batch = segments.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(seg => transcribeSegment(fileUri, mimeType, seg.start, seg.end))
        );

        batchResults.forEach(result => {
            if (result?.segments) {
                // Map 'text' to 'transcript' for consistency
                const mapped = result.segments.map((seg: any) => ({
                    startTime: seg.startTime,
                    endTime: seg.endTime,
                    speaker: seg.speaker,
                    transcript: seg.text || seg.transcript || ''
                }));
                allSegments.push(...mapped);
            }
        });

        // Rate limit protection: wait between segments
        if (i < segments.length - 1) {
            console.log(`[Transcribe] Segment ${i + 1}/${segments.length} done, waiting ${DELAY_BETWEEN_SEGMENTS_MS}ms...`);
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_SEGMENTS_MS));
        }
    }

    return { segments: allSegments };
}

async function transcribeMediaSinglePass(
    fileUri: string, mimeType: string, cacheOptions?: CacheOptions
): Promise<Omit<TranscriptionResult, 'speakerMap'>> {
    console.log(`[Transcription] Starting single-pass transcription for: ${fileUri?.substring(0, 60)}...`);
    console.log(`[Transcription] cacheName: ${cacheOptions?.cacheName || 'none'}`);

    // Improved prompt with multi-language support
    const prompt = `You are an expert audio transcription AI with excellent multilingual capabilities.
    
    TASK: Transcribe ALL spoken content from the provided video/audio, regardless of language.
    
    IMPORTANT:
    - Detect the language automatically (common: English, German, French, Spanish, Italian)
    - Transcribe verbatim - capture every word spoken
    - If there is background music but speech on top, still transcribe the speech
    - Identify different speakers as SPEAKER_00, SPEAKER_01, etc.
    - Include timestamps for each segment
    - If no speech is detected, return an empty segments array
    
    Provide the output as a time-coded transcript in a JSON object adhering to the schema.`;

    try {
        console.log(`[Transcription] Creating gemini-2.0-flash model`);
        const generationConfig = {
            responseMimeType: 'application/json',
            responseSchema: {
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
                            required: ["startTime", "endTime", "speaker", "text"],
                        },
                    },
                },
                required: ["segments"],
            },
        };
        const model = getModelWithOptionalCache('gemini-2.0-flash', generationConfig, cacheOptions?.cacheName);

        // Build content array - skip fileData if using cached context
        const contentParts: any[] = [];
        if (!cacheOptions?.cacheName) {
            contentParts.push({ fileData: { fileUri: fileUri, mimeType: mimeType } });
        }
        contentParts.push({ text: prompt });

        console.log(`[Transcription] Calling generateContent (cached: ${!!cacheOptions?.cacheName})...`);
        const result = await model.generateContent({ contents: contentParts });

        const rawText = result.text || '';
        console.log(`[Transcription] Raw response length: ${rawText.length} chars`);
        console.log(`[Transcription] Raw response preview: ${rawText.substring(0, 200)}...`);

        // Graceful handling for empty responses (silent video)
        if (!rawText || rawText.trim().length < 10) {
            console.warn(`[Transcription] Empty response - no speech detected in video`);
            return { segments: [], text: '' };
        }

        const parsed = safeJsonParse<any>(rawText);

        // Log first segment for debugging
        if (parsed.segments && parsed.segments.length > 0) {
            console.log(`[Transcription] First segment: ${JSON.stringify(parsed.segments[0])}`);
        } else {
            console.log(`[Transcription] No segments found in response`);
            return { segments: [], text: '' };
        }

        // Map 'text' field from Gemini schema to 'transcript' expected by frontend
        const mappedSegments = (parsed.segments || []).map((seg: any, idx: number) => {
            let speaker = seg.speaker || 'SPEAKER_00';
            let transcript = seg.text || seg.transcript || '';

            // Fix: Detect when Gemini puts transcript in speaker field
            const isValidSpeaker = /^SPEAKER_\d{1,2}$/.test(speaker) ||
                /^Speaker\s*\d{0,2}$/i.test(speaker) ||
                speaker.length <= 12 && !speaker.includes(' ');

            if (!isValidSpeaker) {
                if (!transcript || transcript.length === 0) {
                    transcript = speaker;
                }
                speaker = `SPEAKER_${String(idx % 10).padStart(2, '0')}`;
            }

            return {
                startTime: seg.startTime,
                endTime: seg.endTime,
                speaker: speaker,
                transcript: transcript
            };
        });

        const text = mappedSegments.map((s: any) => s.transcript).join(' ');
        return { segments: mappedSegments, text };

    } catch (error: any) {
        console.warn(`[Transcription] Failed: ${error.message} - returning empty result`);
        // Return empty result instead of throwing for graceful degradation
        return { segments: [], text: '' };
    }
}

async function transcribeSegment(
    fileUri: string, mimeType: string, startSec: number, endSec: number
): Promise<{ segments: any[] }> {
    const fmtTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const prompt = `You are an expert audio transcription AI. 
    **CRITICAL:** Analyze ONLY the segment from ${fmtTime(startSec)} to ${fmtTime(endSec)}. Ignore anything outside this range.
    Transcribe the audio, identifying different speakers as SPEAKER_00, SPEAKER_01, etc.
    Output timecodes should be ABSOLUTE (relative to video start, e.g., if startSec is 300, timecodes start around 05:00).
    Output valid JSON.`;

    try {
        const ai = getGenAIClient();
        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [
                { fileData: { fileUri, mimeType } },
                { text: prompt }
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
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
                                required: ["startTime", "endTime", "speaker", "text"],
                            },
                        },
                    },
                    required: ["segments"],
                },
            }
        });

        return safeJsonParse<{ segments: any[] }>(result.text || '');
    } catch (e) {
        console.warn(`Segment transcription failed for ${startSec}-${endSec}:`, e);
        return { segments: [] };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHOT LIST ENRICHMENT (Add descriptions to Video Intelligence boundaries)
// ═══════════════════════════════════════════════════════════════════════════════

interface ShotBoundary {
    tcIn: string;
    tcOut: string;
    duration: string;
    description?: string;
    action?: string;
    audio?: string;
}

export async function enrichShotList(
    fileUri: string,
    mimeType: string,
    shots: ShotBoundary[],
    language: string = 'English',
    cacheOptions?: CacheOptions
): Promise<ShotBoundary[]> {
    console.log(`[ShotEnrich] Enriching ${shots.length} shots with Gemini descriptions...`);
    console.log(`[ShotEnrich] cacheName: ${cacheOptions?.cacheName || 'none'}`);

    if (!shots || shots.length === 0) {
        return shots;
    }

    // BATCH PROCESSING: For long videos (50+ shots), process in batches to avoid token limits
    const BATCH_SIZE = 50;
    const needsBatching = shots.length > BATCH_SIZE;

    if (needsBatching) {
        console.log(`[ShotEnrich] Large shot count (${shots.length}) - using batch processing (${BATCH_SIZE} shots per batch)`);
        return enrichShotListBatched(fileUri, mimeType, shots, language, cacheOptions, BATCH_SIZE);
    }

    // Single-pass for short videos (< 50 shots)
    return enrichShotListSinglePass(fileUri, mimeType, shots, language, cacheOptions);
}

async function enrichShotListBatched(
    fileUri: string,
    mimeType: string,
    shots: ShotBoundary[],
    language: string,
    cacheOptions: CacheOptions | undefined,
    batchSize: number
): Promise<ShotBoundary[]> {
    const enrichedShots = [...shots]; // Clone to preserve original order
    const totalBatches = Math.ceil(shots.length / batchSize);

    console.log(`[ShotEnrich] Processing ${shots.length} shots in ${totalBatches} batches...`);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const start = batchIndex * batchSize;
        const end = Math.min(start + batchSize, shots.length);
        const batchShots = shots.slice(start, end);

        console.log(`[ShotEnrich] Batch ${batchIndex + 1}/${totalBatches}: shots ${start}-${end - 1}`);

        try {
            const batchEnriched = await enrichShotListSinglePass(
                fileUri,
                mimeType,
                batchShots.map((s, i) => ({ ...s, _originalIndex: start + i })) as any,
                language,
                cacheOptions
            );

            // Merge back into result array at correct positions
            batchEnriched.forEach((enriched, i) => {
                const originalIndex = start + i;
                enrichedShots[originalIndex] = {
                    ...enrichedShots[originalIndex],
                    description: enriched.description,
                    action: enriched.action,
                    audio: enriched.audio
                };
            });

            console.log(`[ShotEnrich] Batch ${batchIndex + 1}/${totalBatches} complete`);

            // Rate limit protection: wait between batches
            if (batchIndex < totalBatches - 1) {
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (batchError: any) {
            console.error(`[ShotEnrich] Batch ${batchIndex + 1} failed: ${batchError.message}`);
            // Continue with other batches - partial enrichment is better than none
        }
    }

    const enrichedCount = enrichedShots.filter(s =>
        s.description && !s.description.includes('Auto-detected')
    ).length;

    console.log(`[ShotEnrich] ✓ Batch processing complete: ${enrichedCount}/${shots.length} shots enriched`);
    return enrichedShots;
}

async function enrichShotListSinglePass(
    fileUri: string,
    mimeType: string,
    shots: ShotBoundary[],
    language: string,
    cacheOptions?: CacheOptions
): Promise<ShotBoundary[]> {
    const shotListContext = JSON.stringify(shots.map((s, i) => ({
        id: i,
        start: s.tcIn,
        end: s.tcOut
    })));

    const prompt = `
    You are an expert film editor assistant. I have a list of ${shots.length} shots with exact timecodes.
    Your task is to watch the video and provide a brief but descriptive "Visual Description" and "Main Action" for EACH shot.
    - Be precise and specific about what you see.
    - Use professional film terminology.
    - Output MUST be a valid JSON array of objects, where each object corresponds to the input shot ID.
    - Language: ${language}

    Input Shot List:
    ${shotListContext}

    Output Schema:
    Array<{ id: number, description: string, action: string, audio: string }>
    `;

    try {
        const generationConfig = {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.NUMBER },
                        description: { type: Type.STRING },
                        action: { type: Type.STRING },
                        audio: { type: Type.STRING }
                    },
                    required: ['id', 'description', 'action', 'audio']
                }
            }
        };
        const model = getModelWithOptionalCache('gemini-2.0-flash', generationConfig, cacheOptions?.cacheName);

        // Build content array - skip fileData if using cached context
        const contentParts: any[] = [];
        if (!cacheOptions?.cacheName) {
            contentParts.push({ fileData: { fileUri, mimeType } });
        }
        contentParts.push({ text: prompt });

        console.log(`[ShotEnrich] Calling generateContent for ${shots.length} shots (cached: ${!!cacheOptions?.cacheName})...`);
        const result = await model.generateContent({ contents: contentParts });

        const enrichments = safeJsonParse<any>(result.text || '[]');

        // DEBUG: Log raw enrichment type and structure
        console.log(`[ShotEnrich] Raw enrichments type: ${typeof enrichments}`);
        console.log(`[ShotEnrich] Is array: ${Array.isArray(enrichments)}`);

        // FIX: Handle case where Gemini wraps the array in an object
        // This happens with large shot counts (500+) where Gemini returns:
        // { enrichments: [...] } or { shots: [...] } instead of just [...]
        let enrichmentsArray: { id: number; description: string; action: string; audio: string }[];

        if (Array.isArray(enrichments)) {
            // Direct array response (expected)
            enrichmentsArray = enrichments;
        } else if (typeof enrichments === 'object' && enrichments !== null) {
            // Object wrapper - try to find the array inside
            console.log(`[ShotEnrich] Enrichments is object, keys: ${Object.keys(enrichments).join(', ')}`);

            // Try common wrapper keys
            const possibleArrays = ['enrichments', 'shots', 'items', 'data', 'results'];
            let foundArray = null;

            for (const key of possibleArrays) {
                if (Array.isArray(enrichments[key])) {
                    foundArray = enrichments[key];
                    console.log(`[ShotEnrich] Found array under key '${key}' with ${foundArray.length} items`);
                    break;
                }
            }

            // If no known key, look for any array property
            if (!foundArray) {
                for (const key of Object.keys(enrichments)) {
                    if (Array.isArray(enrichments[key])) {
                        foundArray = enrichments[key];
                        console.log(`[ShotEnrich] Found array under unknown key '${key}' with ${foundArray.length} items`);
                        break;
                    }
                }
            }

            enrichmentsArray = foundArray || [];
            if (!foundArray) {
                console.warn(`[ShotEnrich] Could not find array in object response. Keys: ${Object.keys(enrichments).join(', ')}`);
            }
        } else {
            console.warn(`[ShotEnrich] Unexpected enrichments type: ${typeof enrichments}`);
            enrichmentsArray = [];
        }

        // DEBUG: Log enrichment IDs to diagnose mismatch
        if (enrichmentsArray && enrichmentsArray.length > 0) {
            console.log(`[ShotEnrich] Enrichments received: ${enrichmentsArray.length} items`);
            console.log(`[ShotEnrich] First enrichment id: ${enrichmentsArray[0]?.id}, Last enrichment id: ${enrichmentsArray[enrichmentsArray.length - 1]?.id}`);
        }

        // Create a Map for O(1) ID-based lookup instead of position-based matching
        // This correctly handles gaps, out-of-order responses, and 1-indexed IDs from Gemini
        const enrichmentMap = new Map<number, typeof enrichmentsArray[0]>();
        enrichmentsArray.forEach(e => {
            if (e && typeof e.id === 'number') {
                enrichmentMap.set(e.id, e);
            }
        });

        console.log(`[ShotEnrich] Enrichment Map has ${enrichmentMap.size} entries for ${shots.length} shots`);

        // Match enrichments to shots by ID (we sent id: index, so shot[5] should match enrichment with id:5)
        let matchedCount = 0;
        let unmatchedCount = 0;

        const enrichedShots = shots.map((shot, index) => {
            // Try exact ID match first (0-indexed)
            let enrichment = enrichmentMap.get(index);

            // Fallback: try 1-indexed (Gemini sometimes uses 1-based IDs)
            if (!enrichment) {
                enrichment = enrichmentMap.get(index + 1);
                if (enrichment) {
                    console.log(`[ShotEnrich] Shot ${index} matched via 1-indexed ID ${index + 1}`);
                }
            }

            // Log first few shots for debugging
            if (index < 3 || !enrichment) {
                console.log(`[ShotEnrich] Shot ${index}: enrichment found=${!!enrichment}, desc="${enrichment?.description?.substring(0, 40) || 'NONE'}..."`);
            }

            if (enrichment && enrichment.description && enrichment.description.length > 0) {
                matchedCount++;
            } else {
                unmatchedCount++;
            }

            return {
                ...shot,
                description: enrichment?.description || shot.description || `Shot ${index + 1}`,
                action: enrichment?.action || shot.action || '',
                audio: enrichment?.audio || shot.audio || ''
            };
        });

        console.log(`[ShotEnrich] ✓ Successfully enriched ${enrichedShots.length} shots (matched: ${matchedCount}, unmatched: ${unmatchedCount})`);
        return enrichedShots;

    } catch (error: any) {
        console.error(`[ShotEnrich] ✗✗✗ ENRICHMENT FAILED ✗✗✗`);
        console.error(`[ShotEnrich] Error name: ${error.name}`);
        console.error(`[ShotEnrich] Error message: ${error.message}`);
        console.error(`[ShotEnrich] Error code: ${error.code || 'none'}`);
        console.error(`[ShotEnrich] Error status: ${error.status || 'none'}`);
        console.error(`[ShotEnrich] Error details:`, JSON.stringify(error.errorDetails || error.details || 'none'));
        console.error(`[ShotEnrich] Shot count being enriched: ${shots.length}`);
        console.error(`[ShotEnrich] Returning ${shots.length} shots with PLACEHOLDER descriptions`);
        // Return original shots with placeholders if enrichment fails
        return shots;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TALENT/BIO DETECTION (Identify people appearing in video)
// ═══════════════════════════════════════════════════════════════════════════════

interface TalentEntry {
    name: string;
    fullName: string;
    title: string;
    biography: string;
    firstAppearance: string;
}

/**
 * Analyzes video to identify distinct people and generate brief bios
 * Uses Gemini vision to detect and describe individuals appearing on screen
 */
export async function analyzeTalent(
    fileUri: string,
    mimeType: string,
    cacheOptions?: CacheOptions
): Promise<TalentEntry[]> {
    console.log(`[TalentAnalysis] Analyzing video for talent...`);
    console.log(`[TalentAnalysis] cacheName: ${cacheOptions?.cacheName || 'none'}`);

    const prompt = `You are an expert at identifying people in video content.
    
    Analyze this video and identify all DISTINCT people who appear on screen.
    For each person, provide:
    - A descriptive name if their identity is unknown (e.g., "Woman in Red Dress", "Male Narrator", "Elderly Conservationist")
    - If their name is mentioned or shown on screen, use their real name
    - Their apparent role or title in the video (e.g., "Interview Subject", "Narrator", "Wildlife Expert")
    - A brief description of their appearance and what they do in the video
    - The timecode when they first appear (HH:MM:SS format)

    IMPORTANT:
    - Only include people who actually appear ON SCREEN (visible)
    - Do NOT include narrators or voices if they are never shown
    - Provide at least 1 entry if any person appears
    - Maximum 10 people
    - Sort by first appearance time

    Output valid JSON array.`;

    try {
        const generationConfig = {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        fullName: { type: Type.STRING },
                        title: { type: Type.STRING },
                        biography: { type: Type.STRING },
                        firstAppearance: { type: Type.STRING }
                    },
                    required: ['name', 'title', 'biography', 'firstAppearance']
                }
            }
        };

        const model = getModelWithOptionalCache('gemini-2.0-flash', generationConfig, cacheOptions?.cacheName);

        // Build content - skip fileData if using cached context
        const contentParts: any[] = [];
        if (!cacheOptions?.cacheName) {
            contentParts.push({ fileData: { fileUri, mimeType } });
        }
        contentParts.push({ text: prompt });

        console.log(`[TalentAnalysis] Calling generateContent (cached: ${!!cacheOptions?.cacheName})...`);
        const result = await model.generateContent({ contents: contentParts });

        const talent = safeJsonParse<TalentEntry[]>(result.text || '[]');

        // Ensure fullName defaults to name if not provided
        const processedTalent = (talent || []).map(t => ({
            ...t,
            fullName: t.fullName || t.name
        }));

        console.log(`[TalentAnalysis] ✓ Found ${processedTalent.length} people`);

        // Phase 2: Enrich with grounded biographies for named individuals
        console.log(`[TalentAnalysis] Enriching biographies with Google Search...`);
        const enrichedTalent = await Promise.all(
            processedTalent.map(async (person) => {
                if (isRealName(person.name)) {
                    try {
                        const enriched = await enrichBioWithSearch(person.name, person.title);
                        return {
                            ...person,
                            biography: enriched.biography || person.biography,
                            sources: enriched.sources
                        };
                    } catch (e: any) {
                        console.warn(`[TalentAnalysis] Failed to enrich bio for ${person.name}:`, e.message);
                        return person;
                    }
                }
                // For descriptive names, keep the visual description or set empty
                return {
                    ...person,
                    biography: '', // Clear visual description for non-named individuals
                    sources: []
                };
            })
        );

        console.log(`[TalentAnalysis] ✓ Enrichment complete`);
        return enrichedTalent;

    } catch (error: any) {
        console.error(`[TalentAnalysis] ✗ Failed:`, error.message);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BIOGRAPHY GROUNDING (Enrich names with real biographical data via Google Search)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Descriptive name patterns that indicate a person wasn't identified by name
 * These should NOT be sent to Google Search for biography enrichment
 */
const DESCRIPTIVE_NAME_PATTERNS = [
    /^man$/i,
    /^woman$/i,
    /^person$/i,
    /^child$/i,
    /^boy$/i,
    /^girl$/i,
    /\bman\b/i,      // "Man in Red", "Elderly Man"
    /\bwoman\b/i,    // "Woman in Blue", "Young Woman"  
    /\bperson\b/i,   // "Person 1", "Unknown Person"
    /\bnarrator\b/i, // "Male Narrator", "Narrator"
    /\bspeaker\b/i,  // "Speaker 1"
    /\bsubject\b/i,  // "Interview Subject"
    /\bunknown\b/i,  // "Unknown"
    /\bunidentified\b/i,
];

/**
 * Checks if a name appears to be a real person's name vs a descriptive label
 * Real names: "Ellen Conneily", "Luca Mahuni", "David Attenborough"
 * Descriptive: "Man", "Woman in Red Dress", "Male Narrator", "Unknown Person"
 */
export function isRealName(name: string): boolean {
    if (!name || typeof name !== 'string') {
        return false;
    }

    const trimmedName = name.trim();

    // Must have at least 2 characters
    if (trimmedName.length < 2) {
        return false;
    }

    // Check against descriptive patterns
    for (const pattern of DESCRIPTIVE_NAME_PATTERNS) {
        if (pattern.test(trimmedName)) {
            return false;
        }
    }

    // Real names typically have at least one uppercase letter
    if (!/[A-Z]/.test(trimmedName)) {
        return false;
    }

    return true;
}

/**
 * Enriches a person's biography using Google Search grounding
 * Returns a factual 2-3 sentence biography with source URLs
 */
export async function enrichBioWithSearch(
    name: string,
    title: string
): Promise<{ biography: string; sources: string[] }> {
    // Input validation per GEMINI.md defensive coding
    if (!name || typeof name !== 'string') {
        console.warn('[BioEnrichment] Invalid name provided');
        return { biography: '', sources: [] };
    }

    if (!isRealName(name)) {
        console.log(`[BioEnrichment] Skipping grounding for descriptive name: "${name}"`);
        return { biography: '', sources: [] };
    }

    console.log(`[BioEnrichment] Enriching biography for: ${name} (${title})`);

    try {
        const ai = getGenAIClient();

        // Construct a focused prompt for biography generation
        const titleContext = title ? ` who is known as ${title}` : '';
        const prompt = `Write a factual 2-3 sentence professional biography for ${name}${titleContext}. 
Focus on their career, notable achievements, and current role. 
Be concise and accurate. If you cannot find reliable information, respond with "No biographical information available."`;

        // Use Google Search grounding tool
        const groundingTool = { googleSearch: {} };

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                tools: [groundingTool]
            }
        });

        const biography = response.text?.trim() || '';

        // Extract sources from grounding metadata if available
        const sources: string[] = [];
        const groundingMetadata = (response as any).candidates?.[0]?.groundingMetadata;

        if (groundingMetadata?.groundingChunks) {
            for (const chunk of groundingMetadata.groundingChunks) {
                if (chunk.web?.uri) {
                    sources.push(chunk.web.uri);
                }
            }
        }

        // Check if we got a "not found" response
        if (biography.toLowerCase().includes('no biographical information available') ||
            biography.toLowerCase().includes('could not find') ||
            biography.toLowerCase().includes('unable to find')) {
            console.log(`[BioEnrichment] No biography found for: ${name}`);
            return { biography: '', sources: [] };
        }

        console.log(`[BioEnrichment] ✓ Generated ${biography.length} char bio with ${sources.length} sources`);
        return { biography, sources };

    } catch (error: any) {
        // Structured error logging per GEMINI.md
        console.error(`[BioEnrichment] Failed to enrich bio for "${name}":`, error.message);

        if (error.message?.includes('429')) {
            console.warn('[BioEnrichment] Rate limit hit - skipping enrichment');
        } else if (error.message?.includes('403')) {
            console.warn('[BioEnrichment] Google Search grounding may not be available for this API key');
        }

        return { biography: '', sources: [] };
    }
}
