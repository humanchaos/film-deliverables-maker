/**
 * Language Detection Service
 * Detect video language and synchronize output language
 */

import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config/env.js';

const genai = new GoogleGenAI({ apiKey: config.geminiApiKey });
const MODEL = 'gemini-2.0-flash';

export interface DetectedLanguage {
    code: string;      // ISO 639-1 code: "de", "en", "fr"
    name: string;      // Full name: "German", "English", "French"
    confidence: number; // 0.0 - 1.0
}

// Language name lookup
const LANGUAGE_NAMES: Record<string, string> = {
    'af': 'Afrikaans', 'ar': 'Arabic', 'bg': 'Bulgarian', 'bn': 'Bengali',
    'ca': 'Catalan', 'cs': 'Czech', 'da': 'Danish', 'de': 'German',
    'el': 'Greek', 'en': 'English', 'es': 'Spanish', 'et': 'Estonian',
    'fa': 'Persian', 'fi': 'Finnish', 'fr': 'French', 'gu': 'Gujarati',
    'he': 'Hebrew', 'hi': 'Hindi', 'hr': 'Croatian', 'hu': 'Hungarian',
    'id': 'Indonesian', 'it': 'Italian', 'ja': 'Japanese', 'kn': 'Kannada',
    'ko': 'Korean', 'lt': 'Lithuanian', 'lv': 'Latvian', 'mk': 'Macedonian',
    'ml': 'Malayalam', 'mr': 'Marathi', 'ne': 'Nepali', 'nl': 'Dutch',
    'no': 'Norwegian', 'pa': 'Punjabi', 'pl': 'Polish', 'pt': 'Portuguese',
    'ro': 'Romanian', 'ru': 'Russian', 'sk': 'Slovak', 'sl': 'Slovenian',
    'so': 'Somali', 'sq': 'Albanian', 'sv': 'Swedish', 'sw': 'Swahili',
    'ta': 'Tamil', 'te': 'Telugu', 'th': 'Thai', 'tl': 'Tagalog',
    'tr': 'Turkish', 'uk': 'Ukrainian', 'ur': 'Urdu', 'vi': 'Vietnamese',
    'zh': 'Chinese'
};

/**
 * Detect the primary language of the video content
 */
export async function detectLanguage(
    fileUri: string,
    mimeType: string
): Promise<DetectedLanguage> {
    console.log(`[Language] Detecting video language...`);

    try {
        const response = await genai.models.generateContent({
            model: MODEL,
            contents: [
                { fileData: { fileUri, mimeType } },
                {
                    text: `Analyze this video and identify its PRIMARY language.

Consider:
- Spoken dialogue and narration
- On-screen text and graphics
- Title cards

Return ONLY a JSON object:
{
  "code": "ISO 639-1 two-letter code (de, en, fr, es, it, etc.)",
  "name": "Full language name in English",
  "confidence": 0.0 to 1.0
}

If no speech or text is detected, return {"code": "en", "name": "English", "confidence": 0.3}` }
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        code: { type: Type.STRING },
                        name: { type: Type.STRING },
                        confidence: { type: Type.NUMBER }
                    },
                    required: ['code', 'name', 'confidence']
                }
            }
        });

        const text = response.text || '';
        const result = JSON.parse(text);

        // Validate and normalize
        const code = (result.code || 'en').toLowerCase().substring(0, 2);
        const name = result.name || LANGUAGE_NAMES[code] || 'English';
        const confidence = Math.max(0, Math.min(1, result.confidence || 0.5));

        console.log(`[Language] Detected: ${name} (${code}) with ${(confidence * 100).toFixed(0)}% confidence`);

        return { code, name, confidence };
    } catch (error) {
        console.error('[Language] Detection failed, defaulting to English:', error);
        return { code: 'en', name: 'English', confidence: 0.3 };
    }
}

/**
 * Get language name from ISO code
 */
export function getLanguageName(code: string): string {
    return LANGUAGE_NAMES[code.toLowerCase()] || 'English';
}
