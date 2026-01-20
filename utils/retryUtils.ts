/**
 * Retries an async operation with exponential backoff.
 * 
 * @param fn The async function to retry.
 * @param retries Maximum number of retries (default: 3).
 * @param initialDelayMs Initial delay in milliseconds (default: 1000).
 * @param backoffFactor Factor to multiply delay by after each failure (default: 2).
 * @param retryOn Error condition to retry on (default: always retry unless aborted).
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number = 3,
    initialDelayMs: number = 1000,
    backoffFactor: number = 2,
    retryOn: (error: any) => boolean = () => true
): Promise<T> {
    let attempt = 0;
    let delay = initialDelayMs;

    while (true) {
        try {
            return await fn();
        } catch (error: any) {
            // Never retry on AbortSignal
            if (error.name === 'AbortError' || error.message === 'Operation Cancelled' || error?.message?.includes('cancelled')) {
                throw error;
            }

            if (attempt >= retries || !retryOn(error)) {
                console.error(`Retry failed after ${attempt} attempts. Last error:`, error);
                throw error;
            }

            attempt++;
            console.warn(`Attempt ${attempt}/${retries} failed. Retrying in ${delay}ms...`, error.message);

            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= backoffFactor;
        }
    }
}
