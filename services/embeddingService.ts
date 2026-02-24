import { GoogleGenerativeAI } from "@google/generative-ai";
import { retryWithBackoff } from '../utils/retryUtils';

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
    private modelName = 'text-embedding-004';
    private _model: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    /** Lazily instantiate and reuse the embedding model. */
    private getModel() {
        if (!this._model) {
            this._model = this.genAI.getGenerativeModel({ model: this.modelName });
        }
        return this._model;
    }

    /**
     * Generates a vector embedding for the given text.
     */
    async generateEmbedding(text: string): Promise<number[]> {
        try {
            return await retryWithBackoff(async () => {
                const result = await this.getModel().embedContent(text);
                return result.embedding.values;
            }, 3, 1000);
        } catch (error) {
            console.error("[EmbeddingService] Embedding generation failed:", error);
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
     * Bulk add documents using batchEmbedContents for efficiency.
     * Uses the SDK's native batch API to reduce N individual calls to N/BATCH_SIZE calls.
     * Auto-Heal: Replaced N+1 sequential embedding pattern with batch API.
     */
    async addDocumentsBatch(docs: Document[], onProgress?: (completed: number, total: number) => void): Promise<void> {
        const BATCH_SIZE = 5;
        let processed = 0;
        const model = this.getModel();

        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = docs.slice(i, i + BATCH_SIZE);
            // Separate docs that already have embeddings from those that need them
            const needsEmbedding = batch.filter(doc => !doc.embedding);
            const hasEmbedding = batch.filter(doc => !!doc.embedding);

            if (needsEmbedding.length > 0) {
                try {
                    const response = await retryWithBackoff(async () => {
                        return await model.batchEmbedContents({
                            requests: needsEmbedding.map(doc => ({
                                content: { parts: [{ text: doc.text }], role: 'user' as const },
                            })),
                        });
                    }, 3, 1000);

                    response.embeddings.forEach((emb, idx) => {
                        needsEmbedding[idx].embedding = emb.values;
                    });
                } catch (error) {
                    console.error("[EmbeddingService] Batch embedding failed, falling back to sequential:", error);
                    // Fallback: embed individually so partial failures don't lose everything
                    for (const doc of needsEmbedding) {
                        doc.embedding = await this.generateEmbedding(doc.text);
                    }
                }
            }

            // Push all docs (both pre-embedded and newly embedded) to the store
            for (const doc of [...hasEmbedding, ...needsEmbedding]) {
                this.documents.push(doc);
            }

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
