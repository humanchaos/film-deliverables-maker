import { LLMProvider, LLMOptions } from './LLMProvider';
import { retryWithBackoff } from '../../utils/retryUtils';
import { ERROR_IDS } from '../../types';

// Helper for safe JSON parsing (DeepSeek might allow markdown wrapping)
function safeJsonParse<T>(jsonString: string): T {
    try {
        const cleanString = jsonString.trim().replace(/^```(json)?|```$/g, '');
        if (!cleanString) {
            throw new Error(ERROR_IDS.INVALID_API_RESPONSE);
        }
        return JSON.parse(cleanString);
    } catch (e) {
        console.error("Failed to parse DeepSeek JSON response:", jsonString, e);
        throw new Error(ERROR_IDS.INVALID_API_RESPONSE);
    }
}

export class DeepSeekProvider implements LLMProvider {
    id = 'deepseek';
    name = 'DeepSeek R1';
    description = 'Advanced reasoning model. Great for text, logic, and code. No video support.';

    private apiKey: string;
    private baseUrl = 'https://api.deepseek.com';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async generateText(prompt: string, options?: LLMOptions): Promise<string> {
        const model = options?.model || 'deepseek-chat';

        return await retryWithBackoff(async () => {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: options?.temperature ?? 0.7,
                    stream: false
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`DeepSeek API Error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        }, options?.maxRetries ?? 3, 1000);
    }

    async generateJSON<T>(prompt: string, _schema?: any, options?: LLMOptions): Promise<T> {
        const model = options?.model || 'deepseek-chat';

        // DeepSeek might not support 'response_format: { type: "json_object" }' perfectly in all tiers
        // We will prompt engineering it + attempt to use the flag if safe.
        // For safety, we enforce JSON in system prompt.

        return await retryWithBackoff(async () => {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant. Output ONLY valid JSON.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: options?.temperature ?? 0.2,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                throw new Error(`DeepSeek API Error: ${response.status}`);
            }

            const data = await response.json();
            return safeJsonParse<T>(data.choices[0].message.content);
        }, options?.maxRetries ?? 3, 1000);
    }

    async analyzeVideo<T>(
        _fileUri: string,
        _mimeType: string,
        _prompt: string,
        _schema?: any,
        _options?: LLMOptions
    ): Promise<T> {
        throw new Error("DeepSeek does not support Video Analysis yet. Please use Gemini.");
    }

    async analyzeImage(
        _base64Data: string,
        _mimeType: string,
        _prompt: string,
        _options?: LLMOptions
    ): Promise<string> {
        throw new Error("DeepSeek does not support Image Analysis. Please use Gemini.");
    }
}
