/**
 * Retries a promise-returning function with exponential backoff.
 * 
 * @param fn The function to retry.
 * @param retries Maximum number of retries (default: 3).
 * @param delay Initial delay in milliseconds (default: 1000).
 * @param factor Multiplier for the delay (default: 2).
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000,
    factor: number = 2
): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (retries <= 0) {
            throw error;
        }

        // Check if error is retryable (e.g., rate limits 429, or 503)
        // For simplicity, we retry most errors except explicit cancellations if we had abort signals
        // But here we just catch generic errors.

        await new Promise(resolve => setTimeout(resolve, delay));
        return retryWithBackoff(fn, retries - 1, delay * factor, factor);
    }
}
