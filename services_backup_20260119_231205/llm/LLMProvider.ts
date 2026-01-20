
export interface LLMProvider {
    id: string;
    name: string;
    description?: string;

    /**
     * Generates text based on a prompt.
     * Useful for internal logic, summarization, or chat.
     */
    generateText(prompt: string, options?: LLMOptions): Promise<string>;

    /**
     * Generates structured JSON based on a prompt.
     * Critical for application logic (e.g. bio generation, synopsis).
     */
    generateJSON<T>(prompt: string, schema?: any, options?: LLMOptions): Promise<T>;

    /**
     * Analyzes a video file (multimodal).
     * Note: Some providers (like DeepSeek) might not support this natively.
     * They might throw an error or require a "Vision Adapter" (out of scope for now).
     */
    analyzeVideo<T>(
        fileUri: string,
        mimeType: string,
        prompt: string,
        schema?: any,
        options?: LLMOptions
    ): Promise<T>;

    /**
     * Analyzes a single image (Base64).
     * Useful for frame-by-frame analysis.
     */
    analyzeImage(
        base64Data: string,
        mimeType: string,
        prompt: string,
        options?: LLMOptions
    ): Promise<string>;
}

export interface LLMOptions {
    temperature?: number;
    model?: string;
    signal?: AbortSignal;
    cacheName?: string;
    maxRetries?: number;
}
