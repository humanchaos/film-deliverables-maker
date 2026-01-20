import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import { logger } from './utils/logger';
import { createJob, getJob, debugLatestJobs } from './controllers/jobs';
import { getUploadUrl } from './controllers/upload';
import { processJob } from './controllers/worker';
import { cleanupFile, cleanupMultipleFiles } from './controllers/cleanup';

const app = express();

app.use(cors());
app.use(express.json());

// API Routes
app.post('/api/upload-url', getUploadUrl as any);
app.post('/api/jobs', createJob as any);
app.get('/api/jobs/:id', getJob as any);
app.get('/api/debug', debugLatestJobs as any);

// P0 Fix: GCS Cleanup Endpoints (Hostile Audit)
app.post('/api/cleanup', cleanupFile as any);
app.post('/api/cleanup/batch', cleanupMultipleFiles as any);

// Worker Route (Internal)
// In production, verify Google auth token here
app.post('/workers/process', processJob as any);

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
});
