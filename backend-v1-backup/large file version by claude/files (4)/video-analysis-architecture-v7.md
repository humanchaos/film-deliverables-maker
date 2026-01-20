# Video Analysis Platform - Architecture V7
## Context Caching + Model Routing + Sequential Processing

**Date:** 2026-01-08  
**Status:** Proposed Architecture  
**Target:** Handle 60+ minute videos without rate limiting

---

## Executive Summary

The current architecture fails on long videos because:
1. All modules run in parallel, exhausting TPM quota instantly
2. No context caching — video is re-processed for each module
3. Single model choice regardless of task complexity
4. Shot enrichment sends 500+ shots in one request

This document proposes a complete architectural overhaul.

---

## Current vs Proposed Architecture

```
CURRENT (BROKEN)
================
Video Upload → Gemini Files API
                    ↓
        ┌──────────┼──────────┬──────────┬──────────┐
        ↓          ↓          ↓          ↓          ↓
    Synopsis   Shot List  Transcribe  Graphics   Fauna
        ↓          ↓          ↓          ↓          ↓
   [gemini-2.0-flash-exp for ALL modules, ALL parallel]
        ↓
   💥 429 Rate Limit (250K TPM exceeded instantly)


PROPOSED (V7)
=============
Video Upload → Gemini Files API
                    ↓
            Context Cache (TTL: 1 hour)
                    ↓
            ┌───────┴───────┐
            ↓               ↓
      Long Video Path   Short Video Path
      (sequential)      (parallel OK)
            ↓
    ┌───────┼───────┬───────┬───────┐
    ↓       ↓       ↓       ↓       ↓
Synopsis  Shots   Trans   Graph   Fauna
(1.5 Pro) (2.5 Flash batched)  (2.5 Flash sequential)
    ↓
   ✅ Completes successfully
```

---

## Implementation Details

### 1. Model Router Configuration

```typescript
// src/config/modelConfig.ts

export const MODEL_CONFIG = {
  // Best for long-context understanding and complex analysis
  HEAVY: {
    model: 'gemini-1.5-pro-002',
    description: 'Synopsis, full transcription, complex reasoning',
    contextWindow: 2_000_000,
    outputLimit: 8_192,
  },
  
  // Best balance of speed and quality
  BALANCED: {
    model: 'gemini-2.5-flash',
    description: 'Shot enrichment, graphics detection, fauna ID',
    contextWindow: 1_000_000,
    outputLimit: 8_192,
  },
  
  // Fastest, highest rate limits
  FAST: {
    model: 'gemini-2.0-flash',
    description: 'Simple extractions, metadata, fallback',
    contextWindow: 1_000_000,
    outputLimit: 8_192,
  }
};

// Task-to-model mapping
export const TASK_MODEL_MAP: Record<string, keyof typeof MODEL_CONFIG> = {
  synopsis: 'HEAVY',        // Needs full video understanding
  transcription: 'HEAVY',   // Benefits from 2M context
  shotList: 'BALANCED',     // Speed matters, batched anyway
  shotEnrich: 'BALANCED',   // High volume, batched
  graphics: 'BALANCED',     // Visual detection
  fauna: 'BALANCED',        // Species identification
  cast: 'FAST',             // Simple face/name extraction
};

export function getModelForTask(task: string): string {
  const tier = TASK_MODEL_MAP[task] || 'BALANCED';
  return MODEL_CONFIG[tier].model;
}
```

### 2. Context Cache Manager

```typescript
// src/services/contextCacheManager.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

interface CacheEntry {
  cacheName: string;
  fileUri: string;
  createdAt: Date;
  ttlSeconds: number;
  tokenCount: number;
}

class ContextCacheManager {
  private caches: Map<string, CacheEntry> = new Map();
  private client: GoogleGenerativeAI;

  constructor() {
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }

  /**
   * Create a context cache for a video file
   * This uploads the video ONCE and caches it for reuse across modules
   */
  async createVideoCache(
    jobId: string,
    fileUri: string,
    ttlSeconds: number = 3600 // 1 hour default
  ): Promise<CacheEntry> {
    
    console.log(`[CacheManager] Creating cache for job ${jobId}`);
    
    // Check if cache already exists
    if (this.caches.has(jobId)) {
      const existing = this.caches.get(jobId)!;
      if (this.isCacheValid(existing)) {
        console.log(`[CacheManager] Reusing existing cache: ${existing.cacheName}`);
        return existing;
      }
    }

    // Create new cache via Gemini API
    const cacheResponse = await this.client.cacheManager.create({
      model: 'models/gemini-1.5-pro-002', // Cache works across models
      displayName: `video-analysis-${jobId}`,
      contents: [
        {
          role: 'user',
          parts: [
            {
              fileData: {
                fileUri: fileUri,
                mimeType: 'video/mp4',
              },
            },
          ],
        },
      ],
      ttlSeconds: ttlSeconds,
    });

    const entry: CacheEntry = {
      cacheName: cacheResponse.name,
      fileUri: fileUri,
      createdAt: new Date(),
      ttlSeconds: ttlSeconds,
      tokenCount: cacheResponse.usageMetadata?.totalTokenCount || 0,
    };

    this.caches.set(jobId, entry);
    
    console.log(`[CacheManager] Cache created: ${entry.cacheName}`);
    console.log(`[CacheManager] Cached tokens: ${entry.tokenCount.toLocaleString()}`);
    
    return entry;
  }

  /**
   * Get cache for a job (returns null if expired/missing)
   */
  getCache(jobId: string): CacheEntry | null {
    const entry = this.caches.get(jobId);
    if (!entry || !this.isCacheValid(entry)) {
      return null;
    }
    return entry;
  }

  /**
   * Generate content using cached context
   */
  async generateWithCache(
    jobId: string,
    prompt: string,
    model: string = 'gemini-2.5-flash'
  ): Promise<string> {
    
    const cache = this.getCache(jobId);
    if (!cache) {
      throw new Error(`No valid cache found for job ${jobId}`);
    }

    const genModel = this.client.getGenerativeModel({
      model: model,
      cachedContent: cache.cacheName,
    });

    const result = await genModel.generateContent(prompt);
    return result.response.text();
  }

  private isCacheValid(entry: CacheEntry): boolean {
    const elapsed = (Date.now() - entry.createdAt.getTime()) / 1000;
    return elapsed < entry.ttlSeconds;
  }

  /**
   * Cleanup expired caches
   */
  async cleanup(): Promise<void> {
    for (const [jobId, entry] of this.caches.entries()) {
      if (!this.isCacheValid(entry)) {
        try {
          await this.client.cacheManager.delete(entry.cacheName);
          this.caches.delete(jobId);
          console.log(`[CacheManager] Deleted expired cache: ${jobId}`);
        } catch (e) {
          console.warn(`[CacheManager] Failed to delete cache: ${e}`);
        }
      }
    }
  }
}

export const cacheManager = new ContextCacheManager();
```

### 3. Sequential Module Processor

```typescript
// src/services/sequentialProcessor.ts

import { cacheManager } from './contextCacheManager';
import { getModelForTask, MODEL_CONFIG } from '../config/modelConfig';

interface ModuleResult {
  module: string;
  status: 'completed' | 'failed' | 'skipped';
  data?: any;
  error?: string;
  duration: number;
}

interface ProcessingOptions {
  jobId: string;
  fileUri: string;
  videoDuration: number; // in seconds
  enabledModules: string[];
  onProgress?: (module: string, progress: number) => void;
}

// Threshold for switching to sequential processing
const LONG_VIDEO_THRESHOLD_SECONDS = 600; // 10 minutes

export async function processVideo(options: ProcessingOptions): Promise<ModuleResult[]> {
  const { jobId, fileUri, videoDuration, enabledModules, onProgress } = options;
  const results: ModuleResult[] = [];
  
  const isLongVideo = videoDuration > LONG_VIDEO_THRESHOLD_SECONDS;
  
  console.log(`[Processor] Starting job ${jobId}`);
  console.log(`[Processor] Video duration: ${videoDuration}s (${isLongVideo ? 'LONG' : 'SHORT'} path)`);
  console.log(`[Processor] Enabled modules: ${enabledModules.join(', ')}`);

  // Step 1: Create context cache (critical for long videos)
  console.log(`[Processor] Creating context cache...`);
  const cache = await cacheManager.createVideoCache(
    jobId,
    fileUri,
    isLongVideo ? 7200 : 1800 // 2 hours for long, 30 min for short
  );
  console.log(`[Processor] Cache ready: ${cache.tokenCount.toLocaleString()} tokens`);

  // Step 2: Process modules
  if (isLongVideo) {
    // Sequential processing with delays
    for (const module of enabledModules) {
      const result = await processModuleSafe(jobId, module, onProgress);
      results.push(result);
      
      // Rate limit buffer between modules
      await delay(2000);
    }
  } else {
    // Parallel processing OK for short videos
    const promises = enabledModules.map(module => 
      processModuleSafe(jobId, module, onProgress)
    );
    results.push(...await Promise.all(promises));
  }

  return results;
}

async function processModuleSafe(
  jobId: string,
  module: string,
  onProgress?: (module: string, progress: number) => void
): Promise<ModuleResult> {
  const startTime = Date.now();
  
  try {
    onProgress?.(module, 0);
    
    const data = await processModule(jobId, module, onProgress);
    
    onProgress?.(module, 100);
    
    return {
      module,
      status: 'completed',
      data,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    console.error(`[Processor] Module ${module} failed:`, error);
    return {
      module,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function processModule(
  jobId: string,
  module: string,
  onProgress?: (module: string, progress: number) => void
): Promise<any> {
  const model = getModelForTask(module);
  
  console.log(`[Processor] Running ${module} with ${model}`);
  
  switch (module) {
    case 'synopsis':
      return processSynopsis(jobId, model);
    
    case 'shotList':
      return processShotList(jobId, model, onProgress);
    
    case 'transcription':
      return processTranscription(jobId, model);
    
    case 'graphics':
      return processGraphics(jobId, model);
    
    case 'fauna':
      return processFauna(jobId, model);
    
    case 'cast':
      return processCast(jobId, model);
    
    default:
      throw new Error(`Unknown module: ${module}`);
  }
}

// Individual module implementations...

async function processSynopsis(jobId: string, model: string): Promise<string> {
  const prompt = `Analyze this video and provide a comprehensive synopsis suitable for 
broadcast documentation. Include:
- Overall narrative arc
- Key scenes and their timestamps
- Main subjects/characters
- Tone and style observations
- Suggested target audience

Format as structured text with clear sections.`;

  return cacheManager.generateWithCache(jobId, prompt, model);
}

async function processTranscription(jobId: string, model: string): Promise<any[]> {
  const prompt = `Transcribe all spoken content in this video with timestamps.

Return as JSON array:
[
  {
    "startTime": "HH:MM:SS",
    "endTime": "HH:MM:SS", 
    "speaker": "SPEAKER_01",
    "transcript": "spoken text here"
  }
]

Include speaker diarization where possible. Return ONLY valid JSON.`;

  const response = await cacheManager.generateWithCache(jobId, prompt, model);
  return safeJsonParse(response);
}

// ... other module implementations

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeJsonParse(text: string): any {
  // Remove markdown code blocks if present
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('[Parser] Initial parse failed, attempting repair...');
    // Aggressive repair logic here
    return [];
  }
}
```

### 4. Batched Shot Enrichment

```typescript
// src/services/shotEnrichment.ts

import { cacheManager } from './contextCacheManager';

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1500;

interface Shot {
  id: number;
  timecode: string;
  thumbnail?: string;
  description?: string;
}

interface EnrichmentResult {
  id: number;
  description: string;
}

export async function enrichShotsInBatches(
  jobId: string,
  shots: Shot[],
  model: string = 'gemini-2.5-flash',
  onProgress?: (progress: number) => void
): Promise<Shot[]> {
  
  console.log(`[ShotEnrich] Enriching ${shots.length} shots in batches of ${BATCH_SIZE}`);
  
  const batches = chunkArray(shots, BATCH_SIZE);
  const allEnrichments: EnrichmentResult[] = [];
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNum = i + 1;
    
    console.log(`[ShotEnrich] Processing batch ${batchNum}/${batches.length}`);
    onProgress?.(Math.round((i / batches.length) * 100));
    
    try {
      const enrichments = await enrichBatch(jobId, batch, model);
      allEnrichments.push(...enrichments);
    } catch (error) {
      console.error(`[ShotEnrich] Batch ${batchNum} failed:`, error);
      // Continue with empty enrichments for this batch
      batch.forEach(shot => {
        allEnrichments.push({ id: shot.id, description: shot.description || '' });
      });
    }
    
    // Rate limit buffer between batches
    if (i < batches.length - 1) {
      await delay(BATCH_DELAY_MS);
    }
  }
  
  // Merge enrichments back to shots by POSITION (not ID)
  const sortedEnrichments = allEnrichments.sort((a, b) => a.id - b.id);
  
  return shots.map((shot, index) => ({
    ...shot,
    description: sortedEnrichments[index]?.description || shot.description || '',
  }));
}

async function enrichBatch(
  jobId: string,
  shots: Shot[],
  model: string
): Promise<EnrichmentResult[]> {
  
  const shotList = shots.map(s => `- Shot ${s.id}: ${s.timecode}`).join('\n');
  
  const prompt = `For each shot listed below, provide a detailed description of what is visible in the video at that timecode.

Shots to describe:
${shotList}

Return as JSON array (one entry per shot, in same order):
[
  {"id": 1, "description": "Description of shot 1..."},
  {"id": 2, "description": "Description of shot 2..."}
]

Be specific about: subjects, actions, camera movement, lighting, composition.
Return ONLY valid JSON array with exactly ${shots.length} entries.`;

  const response = await cacheManager.generateWithCache(jobId, prompt, model);
  const parsed = safeJsonParse(response);
  
  // Validate we got an array
  if (!Array.isArray(parsed)) {
    console.warn(`[ShotEnrich] Expected array, got ${typeof parsed}`);
    return shots.map(s => ({ id: s.id, description: '' }));
  }
  
  return parsed;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeJsonParse(text: string): any {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}
```

### 5. Rate Limit Handler with Exponential Backoff

```typescript
// src/services/rateLimitHandler.ts

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = { ...DEFAULT_CONFIG, ...config };
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a rate limit error
      if (error?.status === 429 || error?.message?.includes('429')) {
        const retryAfter = extractRetryAfter(error);
        const delay = retryAfter || calculateBackoff(attempt, baseDelayMs, maxDelayMs);
        
        console.warn(`[RateLimit] Hit 429, attempt ${attempt + 1}/${maxRetries + 1}`);
        console.warn(`[RateLimit] Waiting ${delay}ms before retry...`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // Non-retryable error, throw immediately
      throw error;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

function extractRetryAfter(error: any): number | null {
  // Try to extract retryDelay from Gemini error response
  // Example: quotaValue: "250000", retryDelay: "42s"
  
  const message = error?.message || '';
  const match = message.match(/retryDelay['":\s]+(\d+)s/i);
  
  if (match) {
    return parseInt(match[1], 10) * 1000; // Convert to ms
  }
  
  // Check for Retry-After header
  const retryHeader = error?.headers?.['retry-after'];
  if (retryHeader) {
    return parseInt(retryHeader, 10) * 1000;
  }
  
  return null;
}

function calculateBackoff(attempt: number, baseMs: number, maxMs: number): number {
  // Exponential backoff with jitter
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponential + jitter, maxMs);
}
```

### 6. Updated Coordinator

```typescript
// src/services/analysisCoordinator.ts

import { processVideo } from './sequentialProcessor';
import { cacheManager } from './contextCacheManager';

interface AnalysisRequest {
  jobId: string;
  fileUri: string;
  videoDuration: number;
  config: {
    synopsis: boolean;
    shotList: boolean;
    transcription: boolean;
    graphics: boolean;
    fauna: boolean;
    cast: boolean;
  };
}

export async function runAnalysis(request: AnalysisRequest) {
  const { jobId, fileUri, videoDuration, config } = request;
  
  console.log(`[Coordinator] Starting analysis job ${jobId}`);
  console.log(`[Coordinator] Video duration: ${formatDuration(videoDuration)}`);
  
  // Build list of enabled modules
  const enabledModules: string[] = [];
  if (config.synopsis) enabledModules.push('synopsis');
  if (config.shotList) enabledModules.push('shotList');
  if (config.transcription) enabledModules.push('transcription');
  if (config.graphics) enabledModules.push('graphics');
  if (config.fauna) enabledModules.push('fauna');
  if (config.cast) enabledModules.push('cast');
  
  // CRITICAL: Check if cast is actually enabled
  console.log(`[Coordinator] Enabled modules from config:`, config);
  console.log(`[Coordinator] Modules to process:`, enabledModules);
  
  if (enabledModules.length === 0) {
    throw new Error('No modules enabled for analysis');
  }
  
  try {
    const results = await processVideo({
      jobId,
      fileUri,
      videoDuration,
      enabledModules,
      onProgress: (module, progress) => {
        updateModuleStatus(jobId, module, 'processing', progress);
      },
    });
    
    // Process results
    const output: Record<string, any> = {};
    
    for (const result of results) {
      if (result.status === 'completed') {
        output[result.module] = result.data;
        await updateModuleStatus(jobId, result.module, 'completed', 100);
      } else {
        await updateModuleStatus(jobId, result.module, 'failed', 0, result.error);
      }
      
      console.log(`[Coordinator] ${result.module}: ${result.status} (${result.duration}ms)`);
    }
    
    return output;
    
  } finally {
    // Cleanup cache after job completes
    // (or let TTL handle it for potential re-runs)
    console.log(`[Coordinator] Job ${jobId} complete, cache will expire by TTL`);
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

async function updateModuleStatus(
  jobId: string,
  module: string,
  status: string,
  progress: number,
  error?: string
) {
  // Your existing status update logic
  console.log(`[Status] ${jobId}/${module}: ${status} (${progress}%)${error ? ` - ${error}` : ''}`);
}
```

---

## Migration Checklist

### Phase 1: Non-Breaking Changes
- [ ] Add `modelConfig.ts` with model routing
- [ ] Add `rateLimitHandler.ts` with retry logic
- [ ] Update `geminiService.ts` to use model routing

### Phase 2: Context Caching
- [ ] Add `contextCacheManager.ts`
- [ ] Update file upload flow to create cache
- [ ] Test cache creation/retrieval
- [ ] Monitor cache costs

### Phase 3: Sequential Processing
- [ ] Add `sequentialProcessor.ts`
- [ ] Add video duration to job metadata
- [ ] Implement long/short path switching
- [ ] Update progress reporting

### Phase 4: Batched Enrichment
- [ ] Add `shotEnrichment.ts`
- [ ] Update shot list module to use batching
- [ ] Test with 500+ shot videos

### Phase 5: Frontend Fixes
- [ ] Debug why `cast: false` is sent when checkbox is enabled
- [ ] Add video duration detection before upload
- [ ] Show estimated processing time for long videos

---

## Expected Improvements

| Metric | Current (V6) | Proposed (V7) |
|--------|--------------|---------------|
| 52-min video success rate | ~10% | ~95% |
| Rate limit errors | Frequent | Rare |
| Token cost per video | 5x (re-upload each module) | 1x (cached) |
| Shot enrichment failures | Common (JSON truncation) | Rare (batched) |
| Processing time (52 min video) | N/A (fails) | ~8-12 minutes |

---

## Cost Comparison

### Current: No Caching
- 52-min video = ~820,000 tokens
- 5 modules × 820K input = **4.1M input tokens per analysis**
- At $1.25/M tokens = **$5.13 per video**

### Proposed: With Context Caching
- Cache creation: 820K tokens (one-time)
- 5 module prompts: ~5K tokens each
- Total: 820K + 25K = **845K tokens per analysis**
- Cache storage: ~$0.10/hour
- At $1.25/M tokens = **$1.06 per video** (80% savings)

---

## Monitoring & Alerts

Add these metrics to your monitoring:

```typescript
// Recommended metrics to track
const METRICS = {
  'video.duration': 'histogram',     // Track video lengths
  'cache.hit_rate': 'gauge',         // Cache effectiveness
  'module.duration': 'histogram',    // Per-module timing
  'module.failures': 'counter',      // Track failures by module
  'rate_limit.hits': 'counter',      // 429 frequency
  'rate_limit.retry_delay': 'histogram', // Backoff times
  'tokens.cached': 'gauge',          // Cached token count
  'tokens.consumed': 'counter',      // Total consumption
};
```

---

## References

- [Gemini Context Caching](https://ai.google.dev/gemini-api/docs/caching)
- [Gemini Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini 1.5 Pro Long Context](https://arxiv.org/pdf/2403.05530)
