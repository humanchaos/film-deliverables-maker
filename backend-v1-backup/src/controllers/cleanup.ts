import { Request, Response } from 'express';
import { Storage } from '@google-cloud/storage';
import { logger } from '../utils/logger';

const storage = new Storage();

interface CleanupRequest {
    gcsUri: string;
}

/**
 * DELETE endpoint for cleaning up files from GCS bucket.
 * P0 Fix from Hostile Audit: Implements storage cleanup to prevent cost accumulation.
 */
export const cleanupFile = async (req: Request, res: Response): Promise<void> => {
    try {
        const { gcsUri } = req.body as CleanupRequest;

        if (!gcsUri) {
            res.status(400).json({ error: 'Missing gcsUri in request body' });
            return;
        }

        // Parse GCS URI: gs://bucket-name/path/to/file
        const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
        if (!match) {
            res.status(400).json({ error: 'Invalid GCS URI format. Expected gs://bucket/path' });
            return;
        }

        const [, bucketName, filePath] = match;

        logger.info(`[Cleanup] Deleting file: ${gcsUri}`);

        // Delete the file from GCS
        await storage.bucket(bucketName).file(filePath).delete();

        logger.info(`[Cleanup] Successfully deleted: ${gcsUri}`);
        res.status(200).json({
            success: true,
            message: `File deleted: ${filePath}`,
            deletedUri: gcsUri
        });

    } catch (error: any) {
        // Handle "not found" gracefully (file may have already been deleted)
        if (error.code === 404) {
            logger.warn(`[Cleanup] File not found (already deleted?): ${req.body.gcsUri}`);
            res.status(200).json({
                success: true,
                message: 'File already deleted or does not exist'
            });
            return;
        }

        logger.error('[Cleanup] Error deleting file:', error);
        res.status(500).json({
            error: 'Failed to delete file',
            details: error.message
        });
    }
};

/**
 * Batch cleanup endpoint for deleting multiple files at once.
 */
export const cleanupMultipleFiles = async (req: Request, res: Response): Promise<void> => {
    try {
        const { gcsUris } = req.body as { gcsUris: string[] };

        if (!gcsUris || !Array.isArray(gcsUris) || gcsUris.length === 0) {
            res.status(400).json({ error: 'Missing or empty gcsUris array' });
            return;
        }

        logger.info(`[Cleanup] Batch delete request for ${gcsUris.length} files`);

        const results = await Promise.allSettled(
            gcsUris.map(async (gcsUri) => {
                const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
                if (!match) return { uri: gcsUri, success: false, error: 'Invalid URI' };

                const [, bucketName, filePath] = match;
                try {
                    await storage.bucket(bucketName).file(filePath).delete();
                    return { uri: gcsUri, success: true };
                } catch (err: any) {
                    if (err.code === 404) {
                        return { uri: gcsUri, success: true, note: 'Already deleted' };
                    }
                    return { uri: gcsUri, success: false, error: err.message };
                }
            })
        );

        const successCount = results.filter(
            r => r.status === 'fulfilled' && (r.value as any).success
        ).length;

        logger.info(`[Cleanup] Batch complete: ${successCount}/${gcsUris.length} deleted`);

        res.status(200).json({
            totalRequested: gcsUris.length,
            successfulDeletes: successCount,
            results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: 'Promise rejected' })
        });

    } catch (error: any) {
        logger.error('[Cleanup] Batch error:', error);
        res.status(500).json({ error: 'Batch cleanup failed', details: error.message });
    }
};
