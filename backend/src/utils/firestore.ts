/**
 * Firestore Sanitization Utility
 * Remove undefined values before Firestore writes
 */

/**
 * Remove undefined values from object before Firestore write
 * Firestore throws if undefined values are passed (unless ignoreUndefinedProperties is set)
 * This provides defense-in-depth
 */
export function sanitizeForFirestore<T>(obj: T): T {
    if (obj === undefined) return null as any;
    if (obj === null) return null as any;
    if (Array.isArray(obj)) return obj.map(sanitizeForFirestore) as any;
    if (typeof obj === 'object' && obj !== null) {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            const sanitized = sanitizeForFirestore(value);
            // Skip undefined entirely - Firestore can't handle it
            if (sanitized !== undefined) {
                result[key] = sanitized;
            }
        }
        return result;
    }
    return obj;
}

/**
 * Check if object contains any undefined values (deep check)
 * Useful for debugging Firestore write failures
 */
export function findUndefinedPaths(obj: any, path: string = ''): string[] {
    const paths: string[] = [];

    if (obj === undefined) {
        paths.push(path || 'root');
    } else if (Array.isArray(obj)) {
        obj.forEach((item, i) => {
            paths.push(...findUndefinedPaths(item, `${path}[${i}]`));
        });
    } else if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
            paths.push(...findUndefinedPaths(value, path ? `${path}.${key}` : key));
        }
    }

    return paths;
}
