import { LLMProvider, LLMOptions } from './LLMProvider';
import { GeminiProvider } from './GeminiProvider';
import { DeepSeekProvider } from './DeepSeekProvider';

export class ModelRouter {
    private static instance: ModelRouter;
    private providers: Map<string, LLMProvider> = new Map();
    private activeProviderId: string = 'gemini'; // Default

    private constructor() {
        // Initialize with Gemini from env if available
        const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (geminiKey) {
            this.registerProvider(new GeminiProvider(geminiKey));
        }

        // Initialize DeepSeek from localStorage if available
        // Note: In a real app we'd have a more robust key manager
        const deepSeekKey = localStorage.getItem('DEEPSEEK_API_KEY');
        if (deepSeekKey) {
            this.registerProvider(new DeepSeekProvider(deepSeekKey));
        }
    }

    public static getInstance(): ModelRouter {
        if (!ModelRouter.instance) {
            ModelRouter.instance = new ModelRouter();
        }
        return ModelRouter.instance;
    }

    public registerProvider(provider: LLMProvider) {
        this.providers.set(provider.id, provider);
    }

    public setActiveProvider(id: string) {
        if (this.providers.has(id)) {
            this.activeProviderId = id;
        } else {
            console.warn(`Provider ${id} not found. Keeping ${this.activeProviderId}`);
        }
    }

    public getActiveProvider(): LLMProvider {
        const provider = this.providers.get(this.activeProviderId);
        if (!provider) {
            // Fallback to Gemini if active is missing
            return this.providers.get('gemini')!;
        }
        return provider;
    }

    public getProvider(id: string): LLMProvider | undefined {
        return this.providers.get(id);
    }

    public getAllProviders(): LLMProvider[] {
        return Array.from(this.providers.values());
    }

    // --- Routing Methods ---

    public async generateText(prompt: string, options?: LLMOptions): Promise<string> {
        return this.getActiveProvider().generateText(prompt, options);
    }

    public async generateJSON<T>(prompt: string, schema?: any, options?: LLMOptions): Promise<T> {
        return this.getActiveProvider().generateJSON<T>(prompt, schema, options);
    }

    public async analyzeVideo<T>(
        fileUri: string,
        mimeType: string,
        prompt: string,
        schema?: any,
        options?: LLMOptions
    ): Promise<T> {
        const provider = this.getActiveProvider();

        // simple capability check (try/catch is another way)
        if (provider.id === 'deepseek') {
            console.warn("DeepSeek selected for Video task. Falling back to Gemini.");
            const gemini = this.getProvider('gemini');
            if (gemini) return gemini.analyzeVideo(fileUri, mimeType, prompt, schema, options);
            throw new Error("No video-capable model available.");
        }

        return provider.analyzeVideo(fileUri, mimeType, prompt, schema, options);
    }

    public async analyzeImage(
        base64Data: string,
        mimeType: string,
        prompt: string,
        options?: LLMOptions
    ): Promise<string> {
        const provider = this.getActiveProvider();

        if (provider.id === 'deepseek') {
            // Fallback for visual tasks
            const gemini = this.getProvider('gemini');
            if (gemini) return gemini.analyzeImage(base64Data, mimeType, prompt, options);
            throw new Error("No image-capable model available.");
        }

        return provider.analyzeImage(base64Data, mimeType, prompt, options);
    }
}

export const modelRouter = ModelRouter.getInstance();
