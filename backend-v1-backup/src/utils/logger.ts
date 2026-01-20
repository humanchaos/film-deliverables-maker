export const logger = {
    info: (message: string, meta?: any) => {
        console.log(JSON.stringify({ severity: 'INFO', message, ...meta }));
    },
    warn: (message: string, meta?: any) => {
        console.warn(JSON.stringify({ severity: 'WARNING', message, ...meta }));
    },
    error: (message: string, error?: any) => {
        console.error(JSON.stringify({
            severity: 'ERROR',
            message,
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
        }));
    }
};
