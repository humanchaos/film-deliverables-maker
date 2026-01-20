import { GoogleGenerativeAI } from "@google/generative-ai";
import { retryWithBackoff } from '../utils/retryUtils';
import { ERROR_IDS } from '../types';

export interface Document {
    id: string; // e.g. "scene_0"
    text: string; // The description
    embedding?: number[];
    metadata?: any; // e.g. timestamp, thumbnail
}

export interface SearchResult extends Document {
    similarity: number;
}

export class EmbeddingService {
    private genAI: GoogleGenerativeAI;
    private documents: Document[] = [];
    private model = 'text-embedding-004';

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    /**
     * Generates a vector embedding for the given text.
     */
    async generateEmbedding(text: string): Promise<number[]> {
        try {
            return await retryWithBackoff(async () => {
                const model = this.genAI.getGenerativeModel({ model: this.model });
                const result = await model.embedContent(text);
                return result.embedding.values;
            }, 3, 1000);
        } catch (error) {
            console.error("Embedding generation failed:", error);
            throw new Error("Failed to generate embedding.");
        }
    }

    /**
     * Adds a document to the store (calculating embedding if missing).
     */
    async addDocument(doc: Document): Promise<void> {
        if (!doc.embedding) {
            doc.embedding = await this.generateEmbedding(doc.text);
        }
        this.documents.push(doc);
    }

    /**
     * Bulk add documents for efficiency.
     * Note: The Gemini API supports batch embedding, but for simplicity/reliability with current SDK version,
     * we'll do parallelized individual calls for MVP or batch if SDK supports it well.
     * Batch is cleaner.
     */
    async addDocumentsBatch(docs: Document[], onProgress?: (completed: number, total: number) => void): Promise<void> {
        // We will process in chunks to avoid rate limits
        const BATCH_SIZE = 5;
        let processed = 0;

        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = docs.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (doc) => {
                await this.addDocument(doc);
            }));
            processed += batch.length;
            if (onProgress) onProgress(processed, docs.length);
        }
    }

    /**
     * Searches for similar documents using cosine similarity.
     */
    async search(query: string, limit: number = 5): Promise<SearchResult[]> {
        const queryEmbedding = await this.generateEmbedding(query);

        const results = this.documents.map(doc => {
            if (!doc.embedding) return { ...doc, similarity: 0 };
            const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
            return { ...doc, similarity };
        });

        return results
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }

    /**
     * Clears the vector store.
     */
    clear(): void {
        this.documents = [];
    }

    // --- Math Utils ---

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0);
        const magA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
        const magB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));

        if (magA === 0 || magB === 0) return 0;
        return dotProduct / (magA * magB);
    }
}

// Singleton for simplicity in the App
export const embeddingService = new EmbeddingService(import.meta.env.VITE_GEMINI_API_KEY || '');
