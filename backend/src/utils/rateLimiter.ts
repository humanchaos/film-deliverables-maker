/**
 * Rate Limiter for Gemini API
 * Token bucket implementation to prevent 429 errors
 */

export class TokenBucketRateLimiter {
    private tokens: number;
    private lastRefill: number;

    constructor(
        private maxTokens: number = 15,           // Max requests in bucket
        private refillRatePerSecond: number = 0.25 // 15 per minute = 0.25/sec
    ) {
        this.tokens = maxTokens;
        this.lastRefill = Date.now();
    }

    /**
     * Acquire a token, waiting if necessary
     */
    async acquire(): Promise<void> {
        this.refill();

        if (this.tokens < 1) {
            const waitMs = Math.ceil((1 - this.tokens) / this.refillRatePerSecond * 1000);
            console.log(`[RateLimiter] Waiting ${waitMs}ms for token availability`);
            await this.sleep(waitMs);
            this.refill();
        }

        this.tokens -= 1;
    }

    /**
     * Get current token count (for debugging)
     */
    getAvailableTokens(): number {
        this.refill();
        return Math.floor(this.tokens);
    }

    private refill(): void {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerSecond);
        this.lastRefill = now;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Circuit breaker to prevent cascading failures
 */
export class CircuitBreaker {
    private failures: number = 0;
    private lastFailure: number = 0;
    private state: 'closed' | 'open' | 'half-open' = 'closed';

    constructor(
        private threshold: number = 5,          // Failures before opening
        private resetTimeoutMs: number = 60000  // Time before half-open
    ) { }

    /**
     * Check if circuit allows requests
     */
    canRequest(): boolean {
        if (this.state === 'closed') {
            return true;
        }

        if (this.state === 'open') {
            // Check if timeout has passed
            if (Date.now() - this.lastFailure > this.resetTimeoutMs) {
                this.state = 'half-open';
                console.log('[CircuitBreaker] Transitioning to half-open state');
                return true;
            }
            return false;
        }

        // half-open: allow one request
        return true;
    }

    /**
     * Record a successful request
     */
    recordSuccess(): void {
        this.failures = 0;
        if (this.state === 'half-open') {
            this.state = 'closed';
            console.log('[CircuitBreaker] Circuit closed after successful request');
        }
    }

    /**
     * Record a failed request
     */
    recordFailure(): void {
        this.failures++;
        this.lastFailure = Date.now();

        if (this.failures >= this.threshold) {
            this.state = 'open';
            console.log(`[CircuitBreaker] Circuit OPEN after ${this.failures} failures`);
        }
    }

    /**
     * Get current state
     */
    getState(): string {
        return this.state;
    }
}

// Global instances for the application
export const geminiRateLimiter = new TokenBucketRateLimiter(15, 0.25);
export const geminiCircuitBreaker = new CircuitBreaker(5, 60000);
