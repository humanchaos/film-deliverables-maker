/**
 * Retry Utilities
 * Exponential backoff for transient failures with rate-limit awareness
 */

export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryIf?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxAttempts: 5,  // Increased from 3 for better resilience
    initialDelayMs: 2000,  // Increased from 1000
    maxDelayMs: 120000,  // Increased from 30000 to 2 minutes
    backoffMultiplier: 2,
    retryIf: () => true,
};

// Rate limit specific delay (Gemini recommends 60+ seconds)
const RATE_LIMIT_DELAY_MS = 60000;

/**
 * Execute a function with exponential backoff retry
 * Handles rate limits with extended delays
 */
export async function retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: unknown;
    let delay = opts.initialDelayMs;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt === opts.maxAttempts || !opts.retryIf(error)) {
                throw error;
            }

            // Special handling for rate limits - use longer delay
            if (isRateLimitError(error)) {
                const rateLimitDelay = parseRetryAfter(error) || RATE_LIMIT_DELAY_MS;
                console.log(`[Retry] Rate limited, waiting ${rateLimitDelay / 1000}s as recommended...`);
                await sleep(rateLimitDelay);
                continue;
            }

            console.log(`[Retry] Attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${delay}ms...`);
            await sleep(delay);
            delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
        }
    }

    throw lastError;
}

/**
 * Check if an error is retryable (rate limits, network issues)
 */
export function isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();

        // Rate limit errors
        if (isRateLimitError(error)) {
            return true;
        }

        // Network errors
        if (message.includes('econnreset') || message.includes('etimedout') || message.includes('network')) {
            return true;
        }

        // Server errors (5xx)
        if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
            return true;
        }

        // Gemini-specific transient errors
        if (message.includes('resource_exhausted') || message.includes('unavailable')) {
            return true;
        }
    }

    return false;
}

/**
 * Check if error is specifically a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return message.includes('429') ||
            message.includes('rate limit') ||
            message.includes('quota') ||
            message.includes('resource_exhausted') ||
            message.includes('too many requests');
    }
    return false;
}

/**
 * Parse Retry-After header from error response
 * Returns delay in milliseconds, or null if not found
 */
export function parseRetryAfter(error: unknown): number | null {
    if (error instanceof Error) {
        // Try to extract retry-after value from error message
        // Format: "Retry-After: 60" or "retry after 60 seconds"
        const match = error.message.match(/retry[- ]after[:\s]+(\d+)/i);
        if (match) {
            const seconds = parseInt(match[1], 10);
            return seconds * 1000;
        }
    }
    return null;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
