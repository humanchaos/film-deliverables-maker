import { GoogleGenerativeAI, SchemaType as Type } from "@google/generative-ai";
import type {
  AnalysisResult,
  Synopsis,
  SynopsisConfig,
  GraphicsAnalysisResult,
  SpeciesSighting,
  TranscriptionResult,
  Shot,
  TemplateConverterResult
} from '../types';
import { ERROR_IDS, UploadProgress } from '../types';
import { retryWithBackoff } from '../utils/retryUtils';
import { secondsToTimecode, secondsToDropFrameTimecode, detectTimecodeFormat } from '../utils/tableUtils';

// Initialize the Official SDK
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const fileManager = {
  uploadFile: async (file: File, options: any) => {
    // Simple client-side upload helper using standard fetch if needed, 
    // OR we use the File API if available in this SDK version.
    // NOTE: The client-side File API is limited. 
    // For simplicity in this fix, we will shim the upload 
    // using the valid endpoint, but first let's see if we can use the main client.
    // Actually, the web SDK doesn't always support direct file upload manager unless using REST.
    // Let's stick to the GenerativeAI client and use inline data for small files if possible,
    // BUT for this app's large video logic, we specifically need the FileManager.
    // Let's rely on our custom 'smartUploadToGemini' primarily.
    // But for consistency with the previous code, we'll try to use the raw fetch for the upload
    // if the SDK doesn't expose it easily in the browser bundle.
    // WAIT: The `@google/generative-ai` package DOES NOT verify browser support for File API 
    // as robustly as the server one. 
    // However, we have a custom `smartUploadToGemini` in `uploadService.ts`.
    // We should primarily rely on that.
    throw new Error("Direct SDK upload not supported in browser-safety mode. Use smartUpload.");
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// Context Caching is an advanced feature not fully exposed in the standard browser SDK yet for all models.
// For stable deployment, we will SKIP explicit cache creation for now and rely on standard context window.
// Context Caching Implementation via REST
export const createContextCache = async (
  fileUri: string,
  mimeType: string,
  ttlSeconds: number = 600
): Promise<string> => {
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-2.5-flash',
        contents: [{
          parts: [{ fileData: { fileUri, mimeType } }],
          role: 'user'
        }],
        ttl: `${ttlSeconds}s`
      })
    });

    if (!response.ok) {
      console.warn('Context Cache creation failed', await response.text());
      return '';
    }

    const data = await response.json();
    console.log('Context Cache created:', data.name);
    return data.name; // Returns "cachedContents/..."
  } catch (error) {
    console.warn('Context Cache error:', error);
    return ''; // Fallback
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

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

  // 4. Fix missing commas between objects (e.g. }{ or ][)
  fixed = fixed.replace(/}(\s*){/g, '},$1{');
  fixed = fixed.replace(/](\s*)\[/g, '],$1[');

  // 5. Attempt to close unclosed arrays/objects
  const openBraces = (fixed.match(/{/g) || []).length;
  const closeBraces = (fixed.match(/}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/]/g) || []).length;

  if (openBraces > closeBraces) fixed += '}'.repeat(openBraces - closeBraces);
  if (openBrackets > closeBrackets) fixed += ']'.repeat(openBrackets - closeBrackets);

  return fixed;
}

function safeJsonParse<T>(jsonString: string): T {
  try {
    const cleanString = repairJson(jsonString);
    if (!cleanString) throw new Error(ERROR_IDS.INVALID_API_RESPONSE);
    return JSON.parse(cleanString);
  } catch (e) {
    console.warn("Initial JSON parse failed, attempting aggressive repair...", e);
    try {
      // Secondary aggressive repair for specific edge cases like "Expected ',' or ']'"
      let aggressiveFix = jsonString.replace(/,(\s*)/g, ',$1'); // Ensure spacing
      // Remove any trailing text after the last closing brace/bracket
      aggressiveFix = aggressiveFix.replace(/([}\]])[\s\S]*$/, '$1');
      return JSON.parse(repairJson(aggressiveFix));
    } catch (e2) {
      console.error("Failed to parse JSON response:", jsonString, e2);
      throw new Error(ERROR_IDS.INVALID_API_RESPONSE);
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
// FILE UPLOAD MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

import { smartUploadToGemini } from './uploadService';

// Threshold for using chunked upload (files >= 50MB use chunked)
const CHUNKED_UPLOAD_THRESHOLD = 50 * 1024 * 1024;

/**
 * Upload a file to Gemini for analysis
 * 
 * Automatically chooses the best upload method:
 * - Small files (< 50MB): SDK's built-in upload (simpler, faster)
 * - Large files (>= 50MB): Chunked resumable upload (handles multi-GB files)
 */
export const uploadFileToGemini = async (
  file: File,
  progressCallback: (message: string, percentage: number) => void,
  signal?: AbortSignal
): Promise<string> => {
  // For ANY file size, use smartUploadToGemini to ensure consistency
  // logic simplified to direct return of the robust uploader
  return smartUploadToGemini({
    apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
    file,
    onProgress: (progress: UploadProgress) => {
      progressCallback(progress.message, progress.percentage);
    },
    signal,
  });
};

// ... (existing helper functions)

// ═══════════════════════════════════════════════════════════════════════════════
// SYNOPSIS GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

export const analyzeVideoContent = async (
  fileUri: string,
  mimeType: string,
  signal: AbortSignal,
  progressCallback: (message: string, percentage: number) => void,
  cacheName?: string,
  onIntermediateResult?: (analysis: Partial<AnalysisResult>) => void,
  videoDuration: number = 0
): Promise<AnalysisResult> => {

  const SEGMENT_LENGTH = 300;
  const segments: { start: number; end: number }[] = [];

  if (videoDuration > SEGMENT_LENGTH) {
    for (let t = 0; t < videoDuration; t += SEGMENT_LENGTH) {
      segments.push({ start: t, end: Math.min(t + SEGMENT_LENGTH, videoDuration) });
    }
  } else {
    segments.push({ start: 0, end: videoDuration });
  }

  // Aggregated Results
  const accumulatedEvents: { timestamp: string; description: string }[] = [];
  const accumulatedTranscripts: string[] = [];
  let combinedDialogue = "";
  let finalSummary = "";

  // Helper for formatted timestamp
  const fmtTime = (s: number) => {
    if (s === 0 && segments.length === 1 && segments[0].end === 0) return "";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const processSegment = async (segment: { start: number; end: number }, index: number) => {
    const { start, end } = segment;
    const isSegmented = segments.length > 1;

    const timeInstruction = (isSegmented && end > 0)
      ? `**CRITICAL FOCUS:** Analyze ONLY the video segment from ${fmtTime(start)} to ${fmtTime(end)}. Ignore anything outside this timeframe.`
      : `Analyze the entire video.`;

    const prompt = `
      You are an expert video analysis AI. ${timeInstruction}
      Your task is to synthesize all information from this segment into JSON format.
      - Transcribe spoken words if present.
      - Summarize this segment in one sentence.
      - List key events in this segment.
      - Infer any potential dialogue or important sounds based on visual cues if audio is unclear.
      
      **CRITICAL:** Base all descriptions strictly on the video content.
    `;

    try {
      const response = await retryWithBackoff(async () => {
        if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

        const modelConfig: any = {
          model: 'gemini-2.5-flash', // COST FIX: Was Pro (10-30x more expensive)
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING, description: "A brief, one-sentence summary of this segment's content." },
                events: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      timestamp: { type: Type.STRING, description: "Approximate time or sequence (e.g., '00:05')." },
                      description: { type: Type.STRING, description: "Detailed description of event." },
                    },
                    required: ['timestamp', 'description'],
                  },
                },
                inferred_dialogue: { type: Type.STRING },
                transcription: { type: Type.STRING },
              },
              required: ['summary', 'events', 'inferred_dialogue', 'transcription'],
            },
          }
        };

        if (cacheName) modelConfig.cachedContent = cacheName;
        const model = genAI.getGenerativeModel(modelConfig);
        const parts = cacheName ? [{ text: prompt }] : [{ fileData: { fileUri, mimeType } }, { text: prompt }];

        return await model.generateContent({ contents: [{ role: 'user', parts }] });
      }, 3, 2000);

      const rawText = response.response.text();
      return { success: true, data: safeJsonParse<AnalysisResult>(rawText || '') };

    } catch (error) {
      console.warn(`Error analyzing synopsis segment ${index}:`, error);
      return { success: false, data: null, segmentIndex: index };
    }
  };

  // P0 Fix: Track segment failures to surface to user
  let failedSegments: number[] = [];
  let successfulSegments = 0;

  const BATCH_SIZE = 3;
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

    const percent = 30 + ((i / segments.length) * 70);
    const failureInfo = failedSegments.length > 0 ? ` (${failedSegments.length} failed)` : '';
    progressCallback(`Analyzing synopsis segment ${i + 1}-${Math.min(i + BATCH_SIZE, segments.length)} of ${segments.length}${failureInfo}...`, percent);

    const batch = segments.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((seg, idx) => processSegment(seg, i + idx))
    );

    batchResults.forEach((result, idx) => {
      if (result.success && result.data) {
        successfulSegments++;
        const res = result.data;
        if (res.events) accumulatedEvents.push(...res.events);
        if (res.transcription) accumulatedTranscripts.push(res.transcription);
        if (res.inferred_dialogue) combinedDialogue += (res.inferred_dialogue + " ");
        if (res.summary) finalSummary += (res.summary + " ");
      } else {
        failedSegments.push(i + idx + 1); // 1-indexed for user display
      }
    });

    // Partial Checkpoint (optional, Synopsis UI doesn't display partials well yet, but we emit anyway)
    if (onIntermediateResult) {
      onIntermediateResult({
        events: accumulatedEvents,
        summary: finalSummary,
        transcription: accumulatedTranscripts.join(' '),
        inferred_dialogue: combinedDialogue
      });
    }

    // Memory Management (Audit Recommendation)
    // @ts-ignore
    // Memory cleanup handled by garbage collector
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // P0 Fix: Surface segment failures in final result/progress
  if (failedSegments.length > 0) {
    const warningMsg = `⚠️ ${failedSegments.length} of ${segments.length} segments failed to analyze (segments: ${failedSegments.slice(0, 5).join(', ')}${failedSegments.length > 5 ? '...' : ''})`;
    progressCallback(warningMsg, 100);
    console.warn(warningMsg);
  }

  return {
    summary: finalSummary.trim() || "Analysis complete.",
    events: accumulatedEvents,
    transcription: accumulatedTranscripts.join(' '),
    inferred_dialogue: combinedDialogue.trim()
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// SYNOPSIS GENERATION (TEXT ONLY FALLBACK)
// ═══════════════════════════════════════════════════════════════════════════════

export const generateSynopsisFromText = async (
  transcriptText: string,
  config: SynopsisConfig
): Promise<Synopsis> => {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash', // COST FIX
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          writtenBy: { type: Type.STRING },
          directedBy: { type: Type.STRING },
          oneLine: { type: Type.STRING },
          paragraph: { type: Type.STRING },
          fullSynopsis: { type: Type.STRING },
          keyThemes: { type: Type.STRING },
          targetAudience: { type: Type.STRING },
        }
      }
    }
  });

  const prompt = `
    You are a professional film screenwriter.
    Analyze the following TRANSCRIPT of a video to generate a professional synopsis.
    
    TRANSCRIPT:
    "${transcriptText.slice(0, 100000)}..." (Truncated for context limit if needed)

    Generate a JSON object with:
    1. Title: Creative title based on content.
    2. WrittenBy: "${config.writer || 'Unknown'}"
    3. DirectedBy: "${config.director || 'Unknown'}"
    4. OneLine: A compelling logline (${config.loglineMaxWords} words).
    5. Paragraph: A summary paragraph (${config.summaryMaxWords} words).
    6. FullSynopsis: Detailed synopsis.
    7. KeyThemes: Comma-separated themes.
    8. TargetAudience: Likely audience demographic.
  `;

  try {
    const response = await model.generateContent(prompt);
    return safeJsonParse<Synopsis>(response.response.text());
  } catch (e) {
    console.error("Text-Only Synopsis Failed:", e);
    throw e;
  }
};

export const generateSynopsisFromAnalysis = async (
  analysis: AnalysisResult,
  writer: string,
  director: string,
  language: string,
  keywords: string,
  signal: AbortSignal,
  synopsisConfig: SynopsisConfig
): Promise<Synopsis> => {
  if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

  try {
    const prompt = `
          You are a master screenwriter and film marketing expert. Your task is to transform raw video analysis data into a compelling, professional film synopsis and marketing profile. Your writing should be evocative and ready for a pitch deck.

          **Content to Generate:**
          1.  **Title:** A creative, fitting title for the video.
          2.  **One Line (Logline):** A single, powerful sentence capturing the core story.
          3.  **Paragraph (Summary):** An engaging paragraph setting the scene and narrative.
          4.  **Full Synopsis:** A detailed, multi-paragraph synopsis with a clear beginning, middle, and end.
          5.  **Key Themes:** A concise summary of the central themes and ideas.
          6.  **Target Audience:** A description of the ideal viewer for this content.

          **Your Constraints:**
          - **Language:** Generate all content in: ${language}.
          - **Title:** Maximum ${synopsisConfig.titleMaxChars} characters.
          - **One Line (Logline):** Approximately ${synopsisConfig.loglineMaxWords} words.
          - **Paragraph (Summary):** Approximately ${synopsisConfig.summaryMaxWords} words.
          - **Key Themes:** Approximately ${synopsisConfig.keyThemesMaxWords} words.
          - **Target Audience:** Approximately ${synopsisConfig.targetAudienceMaxWords} words.
          - **Full Synopsis:** No strict length limit, but should be comprehensive and well-structured.

${keywords ? `
          **Guiding Keywords:** Use these to guide the tone and focus: ${keywords}.` : ''}

          **Video Analysis Data:**
          - Transcription: "${analysis.transcription}"
          - Summary: "${analysis.summary}"
          - Key Events: ${JSON.stringify(analysis.events.map(e => e.description))}
          - Inferred Dialogue: "${analysis.inferred_dialogue}"

          Your output must be a single JSON object with keys: "title", "oneLine", "paragraph", "fullSynopsis", "keyThemes", "targetAudience".
      `;

    if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

    const response = await retryWithBackoff(async () => {
      if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash', // COST FIX
        generationConfig: {
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
      return await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
    }, 3, 2000);

    const aiGeneratedContent = safeJsonParse<any>(response.response.text() || '');

    const resultJson: Synopsis = {
      ...aiGeneratedContent,
      writtenBy: writer,
      directedBy: director,
    };

    return resultJson;

  } catch (error) {
    console.error("Error generating synopsis with Gemini:", error);
    if (error instanceof Error && error.message === ERROR_IDS.OPERATION_CANCELLED) {
      throw error;
    }
    throw new Error(ERROR_IDS.SYNOPSIS_FAIL);
  }
};

// ... Bio Generation Wrapper ...

export const extractTalentFromVideo = async (
  fileUri: string,
  mimeType: string,
  duration: number = 0,
  cacheName?: string,
  onIntermediateResult?: (names: string[]) => void
): Promise<string[]> => {

  // Strategy: Segmented Analysis (Safe for 1.5GB+ files)
  const SEGMENT_LENGTH = 300;
  const segments: { start: number; end: number }[] = [];

  if (duration > SEGMENT_LENGTH) {
    for (let t = 0; t < duration; t += SEGMENT_LENGTH) {
      segments.push({ start: t, end: Math.min(t + SEGMENT_LENGTH, duration) });
    }
  } else {
    segments.push({ start: 0, end: duration });
  }

  const allNames = new Set<string>();

  // Helper for formatted timestamp
  const fmtTime = (s: number) => {
    if (s === 0 && segments.length === 1 && segments[0].end === 0) return "";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const processSegment = async (segment: { start: number; end: number }, index: number) => {
    const { start, end } = segment;
    const isSegmented = segments.length > 1;

    const timeInstruction = (isSegmented && end > 0)
      ? `**CRITICAL FOCUS:** Analyze ONLY the video segment from ${fmtTime(start)} to ${fmtTime(end)}. Ignore lower thirds outside this timeframe.`
      : `Analyze the entire video.`;

    const prompt = `Analyze this video segment. Identify any people introduced with text on the screen, commonly known as a 'lower third'. 
    ${timeInstruction}
    Extract their full names. Return the result as a valid JSON object with a single key 'names' which is an array of strings. 
    For example: {"names": ["Lisa Hywood", "Ellen Connelly"]}. 
    If no names are found, return an empty array. Do not include titles or roles, only full names.`;

    try {
      const response = await retryWithBackoff(async () => {
        const modelConfig: any = {
          model: 'gemini-2.5-flash',
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        };
        if (cacheName) modelConfig.cachedContent = cacheName;
        const model = genAI.getGenerativeModel(modelConfig);
        const parts = cacheName ? [{ text: prompt }] : [{ fileData: { fileUri, mimeType } }, { text: prompt }];

        return await model.generateContent({ contents: [{ role: 'user', parts }] });
      }, 3, 1000);

      const parsed = safeJsonParse<{ names: any }>(response.response.text() || '');
      if (parsed.names && Array.isArray(parsed.names)) {
        return parsed.names.filter((name: any): name is string => typeof name === 'string' && name.trim() !== '');
      }
      return [];
    } catch (e) {
      console.error(`Error analyzing talent segment ${index}:`, e);
      return [];
    }
  };

  const BATCH_SIZE = 3;
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);

    // Process Batch
    const batchResults = await Promise.all(
      batch.map((seg, idx) => processSegment(seg, i + idx))
    );

    const newNames: string[] = [];
    batchResults.flat().forEach(name => {
      if (!allNames.has(name)) {
        allNames.add(name);
        newNames.push(name);
      }
    });

    // Fire Checkpoint
    if (newNames.length > 0 && onIntermediateResult) {
      onIntermediateResult(newNames);
    }

    // Memory Management (Audit Recommendation)
    // @ts-ignore
    // Memory cleanup handled by garbage collector
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return Array.from(allNames);
};

// ... generateBio Wrapper needed ...


// ... Extract Talent (Done in previous step) ...

interface BioResponse {
  fullName: string;
  title: string;
  biography: string;
  sources?: string[];
}

export const generateBio = async (talentName: string, context: string, language: string): Promise<BioResponse> => {
  const prompt = `You are a professional biographer. Research and write a professional biography for the person named "${talentName}". Their specific context or role is: "${context}". Use this context to find the correct person. The biography should be engaging, accurate, and suitable for promotional materials. The entire response must be written in ${language}. 
  
  **CRITICAL OUTPUT RULE:**
  - You must return a SINGLE, VALID JSON object.
  - Do NOT output any markdown, conversational text, or explanations outside the JSON.
  - Do NOT start with "##".
  
  **JSON Structure:**
  {
    "fullName": "Name",
    "title": "Role/Title",
    "biography": "The biography text...",
    "found": boolean
  }
  
  **If you are NOT 100% sure:**
  - Do NOT return "Information Not Found" as plain text.
  - Instead, return the JSON with "found": false, or provide your **best educated guess** based on visual appearance and context (e.g., "This appears to be [Name], known for...").
  - If guessing, explicitly state in the biography: "Likely [Name], pending verification." and append: "Is this [Name]?"
  
  **If you cannot find sufficient information:**
  Return exactly: {"fullName": "${talentName}", "title": "Information Not Found", "biography": "Could not find sufficient information to generate a biography.", "found": false}`;

  try {
    const response = await retryWithBackoff(async () => {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash', // COST FIX
        tools: [{ googleSearch: {} } as any], // Cast to allow Google Search despite potential type definition lag
        generationConfig: {
          temperature: 0.2, // Lowered temperature for more factual responses
        },
      });
      return await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
    }, 3, 2000);

    const parsed = safeJsonParse<any>(response.response.text() || '');

    // Extract Grounding Sources
    const sources: string[] = [];
    if (response.response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri) {
          sources.push(chunk.web.uri);
        }
      });
    }

    return { ...parsed, sources: [...new Set(sources)] } as BioResponse;
  } catch (e) {
    console.error(`Error generating bio for ${talentName}:`, e);
    throw new Error(`Failed to generate biography for "${talentName}".`);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPHICS & LOWER THIRDS ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

export async function analyzeGraphicsAndLowerThirds(
  fileUri: string,
  mimeType: string,
  duration: number,
  filmTitle: string,
  cacheName?: string,
  onIntermediateResult?: (result: Partial<GraphicsAnalysisResult>) => void
): Promise<GraphicsAnalysisResult> {

  const SEGMENT_LENGTH = 300;
  const segments: { start: number; end: number }[] = [];

  if (duration > SEGMENT_LENGTH) {
    for (let t = 0; t < duration; t += SEGMENT_LENGTH) {
      segments.push({ start: t, end: Math.min(t + SEGMENT_LENGTH, duration) });
    }
  } else {
    segments.push({ start: 0, end: duration });
  }

  const allGraphics: any[] = [];
  const allLowerThirds: any[] = [];

  // Helper for formatted timestamp
  const fmtTime = (s: number) => {
    if (s === 0 && segments.length === 1 && segments[0].end === 0) return "";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const processSegment = async (segment: { start: number; end: number }, index: number) => {
    const { start, end } = segment;
    const isSegmented = segments.length > 1;

    const timeInstruction = (isSegmented && end > 0)
      ? `**CRITICAL FOCUS:** Analyze ONLY the video segment from ${fmtTime(start)} to ${fmtTime(end)}. Ignore anything outside this timeframe. OFFSET your timings: The segment starts at ${start} seconds.`
      : `Analyze the entire video.`;

    const prompt = `You are a post-production assistant with excellent OCR skills. Analyze this video segment. Your task is to identify and transcribe all on-screen graphics (e.g., title cards, location indicators) and lower thirds (text identifying a person or place, usually at the bottom of the screen). 
    ${timeInstruction}
    
    **CRITICAL RULES:**
    - Be extremely accurate. 
    - Output ONLY text that is clearly visible on screen. 
    - Do NOT correct spelling errors in the source text. Transcribe exactly what you see.
    - Do NOT invent text that is not there.
    
    Output must be a single, valid JSON object strictly adhering to the schema.`;

    try {
      const response = await retryWithBackoff(async () => {
        const modelConfig: any = {
          model: 'gemini-2.5-flash',
          generationConfig: {
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
          }
        };

        if (cacheName) modelConfig.cachedContent = cacheName;
        const model = genAI.getGenerativeModel(modelConfig);
        const parts = cacheName ? [{ text: prompt }] : [{ fileData: { fileUri, mimeType } }, { text: prompt }];

        return await model.generateContent({ contents: [{ role: 'user', parts }] });
      }, 3, 2000);

      const rawText = response.response.text();
      return safeJsonParse<GraphicsAnalysisResult>(rawText || '');

    } catch (e) {
      console.warn(`Error analyzing graphics segment ${index}:`, e);
      return null;
    }
  };

  const BATCH_SIZE = 3;
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((seg, idx) => processSegment(seg, i + idx))
    );

    const newGraphics: any[] = [];
    const newLowerThirds: any[] = [];

    batchResults.forEach(res => {
      if (res) {
        if (res.graphics) newGraphics.push(...res.graphics);
        if (res.lowerThirds) newLowerThirds.push(...res.lowerThirds);
      }
    });

    if (newGraphics.length > 0) allGraphics.push(...newGraphics);
    if (newLowerThirds.length > 0) allLowerThirds.push(...newLowerThirds);

    // Partial Checkpoint
    if (onIntermediateResult && (newGraphics.length > 0 || newLowerThirds.length > 0)) {
      onIntermediateResult({
        graphics: allGraphics,
        lowerThirds: allLowerThirds
      });
    }

    // Memory Management (Audit Recommendation)
    // @ts-ignore
    // Memory cleanup handled by garbage collector
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return {
    programTitle: filmTitle,
    runtime: formatDuration(duration),
    graphics: allGraphics,
    lowerThirds: allLowerThirds
  };
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
  cacheName?: string,
  onIntermediateResult?: (sightings: Omit<SpeciesSighting, 'id' | 'thumbnail'>[]) => void
): Promise<Omit<SpeciesSighting, 'id' | 'thumbnail'>[]> {

  // Strategy: Segmented Analysis with Checkpointing & Garbage Collection
  const SEGMENT_LENGTH = 300; // 5 minutes per segment
  const segments: { start: number; end: number }[] = [];

  if (videoDuration > SEGMENT_LENGTH) {
    for (let t = 0; t < videoDuration; t += SEGMENT_LENGTH) {
      segments.push({ start: t, end: Math.min(t + SEGMENT_LENGTH, videoDuration) });
    }
  } else {
    segments.push({ start: 0, end: videoDuration });
  }

  const allSightings: Omit<SpeciesSighting, 'id' | 'thumbnail'>[] = [];

  // Helper for formatted timestamp strings
  const fmtTime = (s: number) => {
    if (s === 0 && segments.length === 1 && segments[0].end === 0) return "";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // Helper function to process a single segment
  const processSegment = async (segment: { start: number; end: number }, index: number) => {
    const { start, end } = segment;
    const isSegmented = segments.length > 1;

    // Construct Prompt
    const timeInstruction = isSegmented
      ? `**CRITICAL FOCUS:** Analyze ONLY the video segment from ${fmtTime(start)} to ${fmtTime(end)}. Ignore anything outside this timeframe.`
      : `Analyze the entire video.`;

    const prompt = `Analyze this video. Your task is to identify **every single animal sighting**. 
    ${timeInstruction}
    Do not summarize or group them. If the same animal appears in multiple shots, create a separate entry for each sighting. 
    For each sighting, provide: 
    - 'commonName': The common name in ${primaryLanguage}.
    - 'latinName': The scientific name.
    - 'germanName': The common name in ${secondaryLanguage}.
    - 'timecode': The EXACT timecode of the frame where the animal is seen.
    - 'category': A simple category (e.g., "Mammal", "Bird", "Insect", "Fish").
    - 'confidence': A score from 0.0 to 1.0 indicating your confidence in the identification.
    - 'behavior': Briefly describe what the animal is doing (e.g., "Grazing", "Hunting", "Resting", "Flying").
    - 'iucnStatus': The IUCN Red List status if known (e.g., "LC", "VU", "EN", "CR").
    - 'encounterGroup': If the same individual animal is seen in a continuous sequence of shots, assign a unique simple ID (e.g., "Lion_1") to group these sightings. If unsure or isolated, leave blank.
    
    **CRITICAL ANTI-HALLUCINATION RULES:**
    - If you are not 100% sure of the exact species, provide the Genus or Family name instead. 
    - Do NOT guess a specific species without clear visual evidence.
    - If the animal is too blurry or distant to identify, do not invent a name.

    The final output must be a valid JSON object with a single key "sightings" containing the list of sightings.`;

    try {
      const response = await retryWithBackoff(async () => {
        const modelConfig: any = {
          model: 'gemini-2.5-flash',
          generationConfig: {
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
          },
        };

        if (cacheName) {
          modelConfig.cachedContent = cacheName;
        }

        const model = genAI.getGenerativeModel(modelConfig);

        const parts = cacheName
          ? [{ text: prompt }]
          : [{ fileData: { fileUri, mimeType } }, { text: prompt }];

        const result = await model.generateContent({
          contents: [{ role: 'user', parts }]
        });
        return result;
      }, 3, 2000);

      const parsed = safeJsonParse<any>(response.response.text() || '');
      let segmentSightings: any[] = [];
      if (Array.isArray(parsed)) {
        segmentSightings = parsed;
      } else if (parsed && typeof parsed === 'object') {
        const potentialArray = parsed.sightings || parsed.animals || parsed.fauna || parsed.result;
        if (Array.isArray(potentialArray)) {
          segmentSightings = potentialArray;
        }
      }
      return segmentSightings;

    } catch (e) {
      console.error(`Error analyzing fauna segment ${index} (${fmtTime(start)}-${fmtTime(end)}):`, e);
      return []; // Return empty on failure to keep flow going
    }
  };

  // Concurrency Control: Process in chunks of 3
  const BATCH_SIZE = 3;

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    // 1. Prepare Batch
    const batch = segments.slice(i, i + BATCH_SIZE);

    // 2. Process Batch in Parallel
    const batchResults = await Promise.all(
      batch.map((seg, batchIndex) => processSegment(seg, i + batchIndex))
    );

    // 3. Collect & Checkpoint Results
    const newSightings: any[] = [];
    batchResults.forEach(res => {
      if (res && res.length > 0) {
        newSightings.push(...res);
      }
    });

    if (newSightings.length > 0) {
      allSightings.push(...newSightings);

      // FIRE CHECKPOINT: Allow UI to save/display progress immediately
      if (onIntermediateResult) {
        onIntermediateResult(newSightings);
      }
    }

    // 4. Memory Management: Let garbage collector handle cleanup

    // 5. Event Loop Breath (Audit Recommendation)
    // Small pause to let UI breathe and GC run
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  if (allSightings.length === 0 && segments.length > 1) {
    console.warn("Fauna analysis returned 0 results across all segments.");
  }

  return allSightings;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════════

export async function transcribeMedia(
  fileUri: string,
  mimeType: string,
  signal: AbortSignal,
  progressCallback: (message: string, percentage: number) => void,
  cacheName?: string,
  onIntermediateResult?: (segments: any[]) => void,
  videoDuration: number = 0
): Promise<Omit<TranscriptionResult, 'speakerMap'>> {

  const SEGMENT_LENGTH = 300;
  const segments: { start: number; end: number }[] = [];

  if (videoDuration > SEGMENT_LENGTH) {
    for (let t = 0; t < videoDuration; t += SEGMENT_LENGTH) {
      segments.push({ start: t, end: Math.min(t + SEGMENT_LENGTH, videoDuration) });
    }
  } else {
    segments.push({ start: 0, end: videoDuration });
  }

  const allSegments: any[] = [];

  // Helper for formatted timestamp
  const fmtTime = (s: number) => {
    if (s === 0 && segments.length === 1 && segments[0].end === 0) return "";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const processSegment = async (segment: { start: number; end: number }, index: number) => {
    const { start, end } = segment;
    const isSegmented = segments.length > 1;

    const timeInstruction = (isSegmented && end > 0)
      ? `**CRITICAL FOCUS:** Transcribe ONLY the audio from ${fmtTime(start)} to ${fmtTime(end)}. Ignore anything outside this timeframe.`
      : `Transcribe the entire audio.`;

    const prompt = `You are an expert audio transcription AI. ${timeInstruction}
    Identify different speakers as SPEAKER_00, SPEAKER_01, etc based on the audio in this segment.
    Provide the output as a time-coded transcript in a JSON object adhering to the schema.
    
    IMPORTANT: Timestamps must be relative to the START of the VIDEO, so offset them by ${start} seconds if needed.`;

    try {
      const response = await retryWithBackoff(async () => {
        if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

        const modelConfig: any = {
          model: 'gemini-2.5-flash',
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT, properties: {
                segments: {
                  type: Type.ARRAY, items: {
                    type: Type.OBJECT, properties: {
                      startTime: { type: Type.STRING, description: "Start time in HH:MM:SS.mmm format." },
                      endTime: { type: Type.STRING, description: "End time in HH:MM:SS.mmm format." },
                      speaker: { type: Type.STRING, description: "Speaker identifier (e.g., SPEAKER_00)." },
                      transcript: { type: Type.STRING, description: "Transcribed text." },
                    }, required: ['startTime', 'endTime', 'speaker', 'transcript'],
                  },
                },
              }, required: ['segments'],
            },
          },
        };

        if (cacheName) modelConfig.cachedContent = cacheName;
        const model = genAI.getGenerativeModel(modelConfig);
        const parts = cacheName ? [{ text: prompt }] : [{ fileData: { fileUri, mimeType } }, { text: prompt }];

        return await model.generateContent({ contents: [{ role: 'user', parts }] });
      }, 3, 2000);

      const rawText = response.response.text();
      const result = safeJsonParse<{ segments: any[] }>(rawText || '');

      // FIX: Validate speaker fields - Gemini sometimes puts transcript in speaker
      const validatedSegments = (result.segments || []).map((seg: any, idx: number) => {
        let speaker = seg.speaker || 'SPEAKER_00';
        let transcript = seg.transcript || seg.text || '';

        // Valid speakers match SPEAKER_XX pattern or are short without spaces
        const isValidSpeaker = /^SPEAKER_\d{1,2}$/.test(speaker) ||
          /^Speaker\s*\d{0,2}$/i.test(speaker) ||
          (speaker.length <= 12 && !speaker.includes(' '));

        if (!isValidSpeaker) {
          console.log(`[TRANSCRIPTION-FIX] Segment ${idx}: Invalid speaker "${speaker.substring(0, 30)}...", fixing`);
          // If transcript is empty, use the invalid speaker text as transcript
          if (!transcript || transcript.length === 0) {
            transcript = speaker;
          }
          speaker = `SPEAKER_${String(idx % 10).padStart(2, '0')}`;
        }

        return { ...seg, speaker, transcript };
      });

      return validatedSegments;

    } catch (maxError) {
      console.warn(`Error transcribing segment ${index}:`, maxError);
      return [];
    }
  };

  const BATCH_SIZE = 3;
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

    const percent = 10 + ((i / segments.length) * 80);
    progressCallback(`Transcribing segment ${i + 1}-${Math.min(i + BATCH_SIZE, segments.length)} of ${segments.length}...`, percent);

    const batch = segments.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((seg, idx) => processSegment(seg, i + idx))
    );

    const newSegments: any[] = [];
    batchResults.forEach(res => {
      if (res && res.length > 0) newSegments.push(...res);
    });

    if (newSegments.length > 0) {
      allSegments.push(...newSegments);
      if (onIntermediateResult) onIntermediateResult(newSegments);
    }

    // Memory Management (Audit Recommendation)
    // @ts-ignore
    // Memory cleanup handled by garbage collector
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return { segments: allSegments, text: allSegments.map(s => s.transcript).join(' ') };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHOT LIST GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateShotList(
  fileUri: string,
  mimeType: string,
  language: string,
  frameRate: number,
  signal: AbortSignal,
  progressCallback: (message: string, percentage: number) => void,
  cacheName?: string,
  onIntermediateResult?: (shots: Omit<Shot, 'nr' | 'thumbnail'>[]) => void,
  videoDuration: number = 0 // New optional param
): Promise<Omit<Shot, 'nr' | 'thumbnail'>[]> {

  const SEGMENT_LENGTH = 300;
  const segments: { start: number; end: number }[] = [];

  if (videoDuration > SEGMENT_LENGTH) {
    for (let t = 0; t < videoDuration; t += SEGMENT_LENGTH) {
      segments.push({ start: t, end: Math.min(t + SEGMENT_LENGTH, videoDuration) });
    }
  } else {
    // Default / Short Video
    // If duration is 0 (unknown), we assume single pass.
    segments.push({ start: 0, end: videoDuration });
  }

  const allShots: Omit<Shot, 'nr' | 'thumbnail'>[] = [];

  // Helper for formatted timestamp strings (same as Fauna)
  const fmtTime = (s: number) => {
    if (s === 0 && segments.length === 1 && segments[0].end === 0) return "";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const processSegment = async (segment: { start: number; end: number }, index: number) => {
    const { start, end } = segment;
    const isSegmented = segments.length > 1;

    // Fix: Ensure we don't request 0-0 segment if duration is unknown (0)
    // If duration is 0, we treat it as infinite/unknown -> standard prompt.
    // Logic: If segments=[{start:0, end:0}], then timeInstruction might be weird.
    // If videoDuration=0, we should skip detailed time instruction or assume "Full Video".

    const timeInstruction = (isSegmented && end > 0)
      ? `**CRITICAL FOCUS:** Analyze ONLY the video segment from ${fmtTime(start)} to ${fmtTime(end)}. Ignore anything outside this timeframe. OFFSET your timings: The segment starts at ${start} seconds. Returned timings must be relative to the VIDEO START (e.g. if a shot happens at 00:01 into this segment, output ${start + 1.0}).`
      : `Analyze the entire video.`;

    const prompt = `You are an expert film editor. Analyze this video segment to identify distinct shots. 
  A shot change is defined by any change in camera angle, framing, or location. 
  ${timeInstruction}
  
  For each shot:
  1. Identify the start and end time in SECONDS (e.0, 5.2, 12.5).
  2. Provide a description, action, and audio cues in ${language}.
  
  **CRITICAL RULES:**
  - Start times must be sequential.
  - No gaps between shots.
  
  Output valid JSON.`;

    try {
      const response = await retryWithBackoff(async () => {
        if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

        const modelConfig: any = {
          model: 'gemini-2.5-flash',
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT, properties: {
                shots: {
                  type: Type.ARRAY, items: {
                    type: Type.OBJECT, properties: {
                      start_seconds: { type: Type.NUMBER, description: "Start time in seconds (float)" },
                      end_seconds: { type: Type.NUMBER, description: "End time in seconds (float)" },
                      description: { type: Type.STRING, description: `Visual description in ${language}.` },
                      action: { type: Type.STRING, description: `Main action in ${language}.` },
                      audio: { type: Type.STRING, description: `Audio description in ${language}.` },
                    }, required: ['start_seconds', 'end_seconds', 'description', 'action', 'audio'],
                  },
                },
              }, required: ['shots'],
            },
          },
        };

        if (cacheName) modelConfig.cachedContent = cacheName;
        const model = genAI.getGenerativeModel(modelConfig);
        const parts = cacheName ? [{ text: prompt }] : [{ fileData: { fileUri, mimeType } }, { text: prompt }];

        return await model.generateContent({ contents: [{ role: 'user', parts }] });
      }, 3, 2500);

      const rawText = response.response.text();
      const result = safeJsonParse<{ shots: any[] }>(rawText || '');

      if (!result || !Array.isArray(result.shots)) return [];

      const isDropFrame = detectTimecodeFormat(frameRate) === 'DF';
      const format = (s: number) => isDropFrame ? secondsToDropFrameTimecode(s, frameRate) : secondsToTimecode(s, frameRate);

      return result.shots.map((shot, idx) => {
        // DEBUG: Log raw shot data to diagnose missing timecodes
        if (idx === 0) {
          console.log(`[SHOTLIST-DEBUG] First shot raw data:`, JSON.stringify(shot, null, 2));
          console.log(`[SHOTLIST-DEBUG] start_seconds type: ${typeof shot.start_seconds}, value: ${shot.start_seconds}`);
          console.log(`[SHOTLIST-DEBUG] end_seconds type: ${typeof shot.end_seconds}, value: ${shot.end_seconds}`);
        }
        const duration = (shot.end_seconds || 0) - (shot.start_seconds || 0);
        return {
          tcIn: format(shot.start_seconds || 0),
          tcOut: format(shot.end_seconds || 0),
          duration: format(duration),
          description: shot.description || '',
          action: shot.action || '',
          audio: shot.audio || '',
          // nr will be assigned later or by consumer
        };
      });

    } catch (e) {
      console.warn(`Error analyzing shotlist segment ${index}:`, e);
      return [];
    }
  };

  const BATCH_SIZE = 3;
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

    const percent = 10 + ((i / segments.length) * 80);
    progressCallback(`Analyzing segments ${i + 1}-${Math.min(i + BATCH_SIZE, segments.length)} of ${segments.length}...`, percent);

    const batch = segments.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((seg, idx) => processSegment(seg, i + idx))
    );

    const newShots: Omit<Shot, 'nr' | 'thumbnail'>[] = [];
    batchResults.forEach(res => {
      if (res && res.length > 0) newShots.push(...res);
    });

    if (newShots.length > 0) {
      allShots.push(...newShots);
      // Important: We should assign 'nr' here or let the caller do it?
      // The return type is Omit<Shot, 'nr'>.
      // The caller assigns 'nr'.
      if (onIntermediateResult) onIntermediateResult(newShots);
    }

    // Memory Management: Allow GC to reclaim
    // Note: batch and batchResults go out of scope after loop iteration anyway
  }

  return allShots;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HYBRID WORKFLOW: ENRICHMENT
// ═══════════════════════════════════════════════════════════════════════════════

export async function enrichShotList(
  fileUri: string,
  mimeType: string,
  shots: Omit<Shot, 'nr' | 'thumbnail'>[],
  language: string,
  signal: AbortSignal,
  progressCallback: (message: string, percentage: number) => void,
  cacheName?: string
): Promise<Omit<Shot, 'nr' | 'thumbnail'>[]> {

  progressCallback('Enriching shot descriptions with AI...', 10);

  const shotListContext = JSON.stringify(shots.map((s, i) => ({ id: i, start: s.tcIn, end: s.tcOut })));

  const prompt = `
    You are an expert film editor assistant. I have a list of ${shots.length} shots with exact timecodes.
    Your task is to watch the video and provide a brief but descriptive "Visual Description" and "Main Action" for EACH shot.
    - Be precise.
    - Use professional film terminology.
    - Output MUST be a valid JSON array of objects, where each object corresponds to the input shot ID.
    - Language: ${language}

    Input Shot List:
    ${shotListContext}

    Output Schema:
    Array<{ id: number, description: string, action: string, audio: string }>
  `;

  try {
    const response = await retryWithBackoff(async () => {
      if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

      const modelConfig: any = {
        model: 'gemini-2.5-flash',
        generationConfig: {
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
        }
      };

      if (cacheName) {
        modelConfig.cachedContent = cacheName;
      }

      const model = genAI.getGenerativeModel(modelConfig);

      const parts = cacheName
        ? [{ text: prompt }]
        : [{ fileData: { fileUri, mimeType } }, { text: prompt }];

      return await model.generateContent({
        contents: [{ role: 'user', parts: parts }]
      });
    }, 3, 2000);

    if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);
    const enrichedData = safeJsonParse<any[]>(response.response.text() || '');

    // Sort by ID to ensure correct order, then use position-based matching
    const sortedEnrichments = (enrichedData || []).sort((a, b) => (a.id || 0) - (b.id || 0));

    return shots.map((shot, index) => {
      // Use position-based matching: enrichment at index matches shot at index
      const enrichment = sortedEnrichments[index];
      if (enrichment) {
        return {
          ...shot,
          description: enrichment.description || shot.description,
          action: enrichment.action || shot.action,
          audio: enrichment.audio || shot.audio
        };
      }
      return shot;
    });

  } catch (error) {
    console.error("Error enriching shot list:", error);
    return shots;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE CONVERTER
// ═══════════════════════════════════════════════════════════════════════════════

export const convertTemplate = async (
  sourceFileUri: string,
  targetFileUri: string,
  sourceMimeType: string,
  targetMimeType: string,
  originalFileName: string,
  targetTemplateName: string,
  signal: AbortSignal,
  progressCallback: (message: string, percentage: number) => void
): Promise<TemplateConverterResult> => {

  progressCallback('Analyzing template structure...', 20);

  const prompt = `
    You are an expert document formatter and layout specialist.
    
    I have provided two files:
    1. A **Source File** (first file) containing specific content/text.
    2. A **Target File** (second file) containing a specific layout, format, or style (e.g., a specific screenplay format, a report style, a invoice layout).

    **Your Task:**
    Extract **all** the content/text from the **Source File** and rewrite it so that it perfectly matches the structural, stylistic, and formatting rules of the **Target File**.
    
    - **Do not** change the meaning of the source content.
    - **Do not** use the specific content of the Target file (it is just a blueprint).
    - **Do** adopt the Target's headers, indentation, bullet styles, font hierarchy (simulated in Markdown), and sectioning.
    - If the Target is a screenplay, format the Source as a screenplay.
    - If the Target is a technical report, format the Source as a technical report.
    
    **Output:**
    Provide the final result as a raw Markdown string that replicates the visual structure of the Target as closely as possible.
  `;

  if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

  try {
    const response = await retryWithBackoff(async () => {
      if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash', // COST FIX: Was Pro
        generationConfig: {
          temperature: 0.2, // Low temp for precision
          responseMimeType: 'text/plain', // We want raw text/markdown, NOT JSON, for the document content
        }
      });

      return await model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { fileData: { fileUri: sourceFileUri, mimeType: sourceMimeType } },
            { fileData: { fileUri: targetFileUri, mimeType: targetMimeType } },
            { text: prompt }
          ]
        }]
      });
    }, 3, 2000);

    if (signal.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);
    progressCallback('Finalizing conversion...', 90);

    const convertedContent = response.response.text() || "Conversion failed to generate text.";

    return {
      convertedContent,
      originalFileName,
      targetTemplateName
    };

  } catch (error) {
    console.error("Error converting template:", error);
    if (error instanceof Error && error.message === ERROR_IDS.OPERATION_CANCELLED) throw error;
    throw new Error('Template conversion failed.');
  }
};
