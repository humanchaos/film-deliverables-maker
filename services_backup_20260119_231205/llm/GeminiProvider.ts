import { GoogleGenerativeAI } from "@google/generative-ai";
import { LLMProvider, LLMOptions } from './LLMProvider';
import { retryWithBackoff } from '../../utils/retryUtils';
import { ERROR_IDS } from '../../types';

// Helper for safe JSON parsing
function safeJsonParse<T>(jsonString: string): T {
    try {
        const cleanString = jsonString.trim().replace(/^```(json)?|```$/g, '');
        if (!cleanString) {
            throw new Error(ERROR_IDS.INVALID_API_RESPONSE);
        }
        return JSON.parse(cleanString);
    } catch (e) {
        console.error("Failed to parse JSON response:", jsonString, e);
        throw new Error(ERROR_IDS.INVALID_API_RESPONSE);
    }
}

export class GeminiProvider implements LLMProvider {
    id = 'gemini';
    name = 'Google Gemini';
    description = 'Multimodal Native (Video, Audio, Text). Best for large context analysis.';

    private genAI: GoogleGenerativeAI;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async generateText(prompt: string, options?: LLMOptions): Promise<string> {
        const modelName = options?.model || 'gemini-2.5-flash';

        return await retryWithBackoff(async () => {
            const model = this.genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: options?.temperature ?? 0.7,
                }
            });

            const result = await model.generateContent(prompt);
            return result.response.text();
        }, options?.maxRetries ?? 3, 1000);
    }

    async generateJSON<T>(prompt: string, schema?: any, options?: LLMOptions): Promise<T> {
        const modelName = options?.model || 'gemini-2.5-flash';

        // Convert schema to Gemini format if passed (simplified for now, assuming schema is already Gemini-compatible or generic)
        // In a robust implementation, we might need a schema adapter.

        return await retryWithBackoff(async () => {
            const model = this.genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: options?.temperature ?? 0.2,
                    responseMimeType: 'application/json',
                    responseSchema: schema // Pass strict schema if provided
                }
            });

            const result = await model.generateContent(prompt);
            return safeJsonParse<T>(result.response.text());
        }, options?.maxRetries ?? 3, 1000);
    }

    async analyzeVideo<T>(
        fileUri: string,
        mimeType: string,
        prompt: string,
        schema?: any,
        options?: LLMOptions
    ): Promise<T> {
        const modelName = options?.model || 'gemini-2.5-flash'; // COST FIX: Was Pro (10-30x more expensive)

        return await retryWithBackoff(async () => {
            if (options?.signal?.aborted) throw new Error(ERROR_IDS.OPERATION_CANCELLED);

            const config: any = {
                model: modelName,
                generationConfig: {
                    temperature: options?.temperature ?? 0.2,
                    responseMimeType: 'application/json',
                    responseSchema: schema
                }
            };

            if (options?.cacheName) {
                config.cachedContent = options.cacheName;
            }

            const model = this.genAI.getGenerativeModel(config);

            const parts = options?.cacheName
                ? [{ text: prompt }]
                : [{ fileData: { fileUri, mimeType } }, { text: prompt }];

            const result = await model.generateContent({
                contents: [{ role: 'user', parts }]
            });

            return safeJsonParse<T>(result.response.text());

        }, options?.maxRetries ?? 3, 2000);
    }

    async analyzeImage(
        base64Data: string,
        mimeType: string,
        prompt: string,
        options?: LLMOptions
    ): Promise<string> {
        const modelName = options?.model || 'gemini-2.5-flash';

        return await retryWithBackoff(async () => {
            const model = this.genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent([
                { inlineData: { data: base64Data, mimeType } },
                { text: prompt }
            ]);
            return result.response.text();
        }, options?.maxRetries ?? 3, 1000);
    }
}
