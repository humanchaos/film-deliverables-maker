/**
 * Context Cache Manager for Gemini API
 * 
 * MIGRATED TO @google/genai SDK
 * 
 * This service manages video context caching to avoid re-processing
 * the same video for each analysis module.
 * 
 * Key benefits:
 * - 75% reduction in token costs
 * - Avoids rate limits by not re-uploading video per module
 * - Enables sequential processing without re-processing overhead
 * 
 * FEATURE FLAG: Controlled by USE_CONTEXT_CACHING env var
 */

import { getGenAIClient, createFileDataPart, createUserContent } from './genaiClient';

export interface CacheEntry {
    name: string;
    displayName: string;
    fileUri: string;
    model: string;
    createdAt: Date;
    expireTime: Date;
    tokenCount: number;
}

export interface CacheOptions {
    ttlSeconds?: number;  // Default: 3600 (1 hour)
    displayName?: string;
}

class ContextCacheManager {
    private localCache: Map<string, CacheEntry> = new Map();
    private readonly MODEL_NAME = "gemini-2.0-flash-001";

    constructor() {
        // Lazy initialization - client is obtained when needed
    }

    /**
     * Create a context cache for a video file
     * Returns existing cache if still valid
     */
    async createVideoCache(
        jobId: string,
        fileUri: string,
        options: CacheOptions = {}
    ): Promise<CacheEntry> {
        const { ttlSeconds = 3600, displayName } = options;

        // Check for existing valid cache
        const existing = this.localCache.get(jobId);
        if (existing && new Date() < existing.expireTime) {
            console.log(`[CacheManager] Reusing existing cache for job ${jobId}`);
            return existing;
        }

        console.log(`[CacheManager] Creating new cache for job ${jobId}`);
        console.log(`[CacheManager] File URI: ${fileUri?.substring(0, 80)}...`);
        console.log(`[CacheManager] TTL: ${ttlSeconds}s`);

        try {
            const ai = getGenAIClient();

            // Create cache using new @google/genai SDK
            // Per Google docs: use ai.caches.create() with config object
            const cache = await ai.caches.create({
                model: this.MODEL_NAME,
                config: {
                    displayName: displayName || `video-analysis-${jobId}`,
                    contents: [
                        createUserContent([
                            createFileDataPart(fileUri, this.getMimeType(fileUri))
                        ])
                    ],
                    ttl: `${ttlSeconds}s`,
                },
            });

            const entry: CacheEntry = {
                name: cache.name!,
                displayName: cache.displayName || `video-analysis-${jobId}`,
                fileUri: fileUri,
                model: cache.model!,
                createdAt: new Date(),
                expireTime: new Date(cache.expireTime!),
                tokenCount: cache.usageMetadata?.totalTokenCount || 0,
            };

            this.localCache.set(jobId, entry);

            console.log(`[CacheManager] ✓ Cache created successfully`);
            console.log(`[CacheManager]   Name: ${entry.name}`);
            console.log(`[CacheManager]   Tokens: ${entry.tokenCount.toLocaleString()}`);
            console.log(`[CacheManager]   Expires: ${entry.expireTime.toISOString()}`);

            return entry;

        } catch (error: any) {
            console.error(`[CacheManager] Failed to create cache:`, error.message);
            throw new Error(`Cache creation failed: ${error.message}`);
        }
    }

    /**
     * Get a cached entry by job ID
     * Returns null if cache doesn't exist or is expired
     */
    getCache(jobId: string): CacheEntry | null {
        const entry = this.localCache.get(jobId);

        if (!entry) {
            return null;
        }

        if (new Date() >= entry.expireTime) {
            console.log(`[CacheManager] Cache expired for job ${jobId}`);
            this.localCache.delete(jobId);
            return null;
        }

        return entry;
    }

    /**
     * Delete a specific cache
     */
    async deleteCache(jobId: string): Promise<boolean> {
        const entry = this.localCache.get(jobId);

        if (!entry) {
            return false;
        }

        try {
            const ai = getGenAIClient();
            await ai.caches.delete({ name: entry.name });
            this.localCache.delete(jobId);
            console.log(`[CacheManager] Deleted cache for job ${jobId}`);
            return true;
        } catch (error) {
            console.warn(`[CacheManager] Failed to delete cache:`, error);
            return false;
        }
    }

    /**
     * Get estimated cost savings from using cache
     */
    getStats(): { totalCachedTokens: number; estimatedSavings: number } {
        let totalTokens = 0;
        const modulesPerVideo = 5; // Average modules run per video

        for (const entry of this.localCache.values()) {
            totalTokens += entry.tokenCount;
        }

        // Without caching: tokens × modules
        // With caching: tokens × 1
        const savedTokens = totalTokens * (modulesPerVideo - 1);
        const estimatedSavings = (savedTokens / 1_000_000) * 1.25; // $1.25 per M tokens

        return {
            totalCachedTokens: totalTokens,
            estimatedSavings: Math.round(estimatedSavings * 100) / 100,
        };
    }

    private getMimeType(fileUri: string): string {
        // For Gemini Files API URIs, default to video/mp4
        if (fileUri.includes('generativelanguage.googleapis.com')) {
            return 'video/mp4';
        }
        const ext = fileUri.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
            'mp4': 'video/mp4',
            'mov': 'video/quicktime',
            'avi': 'video/x-msvideo',
            'mkv': 'video/x-matroska',
            'webm': 'video/webm',
        };
        return mimeTypes[ext || ''] || 'video/mp4';
    }
}

// Lazy singleton - only instantiated when first used (after env vars are loaded)
let _cacheManagerInstance: ContextCacheManager | null = null;

export function getCacheManager(): ContextCacheManager {
    if (!_cacheManagerInstance) {
        _cacheManagerInstance = new ContextCacheManager();
    }
    return _cacheManagerInstance;
}

// Export class for testing/custom instances
export { ContextCacheManager };
