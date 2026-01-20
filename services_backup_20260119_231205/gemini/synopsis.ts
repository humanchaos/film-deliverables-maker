/**
 * Gemini Synopsis Module
 * Protocol 800 Compliant - Isolated Responsibility
 */

import { genAI, safeJsonParse, Type } from './geminiCore';
import { Synopsis, SynopsisConfig } from '../../types';

const SYNOPSIS_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        logline: { type: Type.STRING },
        summary: { type: Type.STRING },
        keyThemes: { type: Type.STRING },
        targetAudience: { type: Type.STRING }
    },
    required: ['title', 'logline', 'summary']
};

export async function generateSynopsis(
    fileUri: string,
    mimeType: string,
    config: SynopsisConfig,
    signal?: AbortSignal
): Promise<Synopsis> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: SYNOPSIS_SCHEMA
        } as any
    });

    const prompt = `Generate a professional synopsis for this video content:

Requirements:
- title: A compelling title (max ${config.titleMaxChars} characters)
- logline: A one-sentence hook (max ${config.loglineMaxWords} words)
- summary: A detailed synopsis (max ${config.summaryMaxWords} words)
- keyThemes: Main themes explored (max ${config.keyThemesMaxWords} words)
- targetAudience: Who this appeals to (max ${config.targetAudienceMaxWords} words)

Write in a professional, engaging style suitable for industry use.`;

    const response = await model.generateContent([
        { fileData: { fileUri, mimeType } },
        { text: prompt }
    ]);

    const text = response.response.text();
    return safeJsonParse<Synopsis>(text);
}
