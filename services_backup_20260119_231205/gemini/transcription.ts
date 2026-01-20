/**
 * Gemini Transcription Module
 * Protocol 800 Compliant - Isolated Responsibility
 */

import { genAI, safeJsonParse, Type } from './geminiCore';
import { TranscriptionResult } from '../../types';

const TRANSCRIPTION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        segments: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    startTime: { type: Type.STRING },
                    endTime: { type: Type.STRING },
                    text: { type: Type.STRING },
                    speaker: { type: Type.STRING }
                },
                required: ['startTime', 'endTime', 'text']
            }
        }
    },
    required: ['segments']
};

export async function transcribeVideo(
    fileUri: string,
    mimeType: string,
    signal?: AbortSignal
): Promise<TranscriptionResult> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: TRANSCRIPTION_SCHEMA
        } as any
    });

    const prompt = `Transcribe all spoken dialogue in this video. For each segment provide:
- startTime: timestamp in HH:MM:SS format
- endTime: timestamp in HH:MM:SS format  
- text: the exact words spoken
- speaker: speaker identifier if distinguishable (e.g., "Speaker 1", "Narrator")`;

    const response = await model.generateContent([
        { fileData: { fileUri, mimeType } },
        { text: prompt }
    ]);

    const text = response.response.text();
    const parsed = safeJsonParse<{ segments: any[] }>(text);

    return {
        segments: parsed.segments || [],
        speakerMap: {}
    };
}
