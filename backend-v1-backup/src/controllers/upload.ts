import { Request, Response } from 'express';
import { storageService } from '../services/storageService';
import { logger } from '../utils/logger';

export const getUploadUrl = async (req: Request, res: Response) => {
    try {
        const { fileName, contentType, resumable } = req.body;

        if (!fileName || !contentType) {
            logger.warn('[Upload] Missing file info for upload URL request');
            return res.status(400).json({ error: 'Missing fileName or contentType' });
        }

        // Use standard signed URL for simple PUT uploads
        const data = await storageService.generateUploadUrl(fileName, contentType);

        logger.info(`[Upload] Generated Signed URL for ${fileName}`);
        res.json(data);
    } catch (error: any) {
        logger.error('[Upload] Failed to generate upload URL', error);
        res.status(500).json({ error: error.message || 'Failed to generate upload URL' });
    }
};
