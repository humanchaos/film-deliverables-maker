/**
 * Retry Utilities
 * Exponential backoff for transient failures
 */

export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryIf?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryIf: () => true,
};

/**
 * Execute a function with exponential backoff retry
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
        if (message.includes('429') || message.includes('rate limit') || message.includes('quota')) {
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
    }

    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
