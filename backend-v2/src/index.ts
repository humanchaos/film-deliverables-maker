/**
 * Gemini Video Analyzer - Backend Server v2
 * 
 * Clean, minimal Express server with:
 * - REST API for job management
 * - Health check endpoint
 * - CORS for frontend access
 */

import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config/env.js';
import { initFirebase } from './services/firebase.js';
import {
    getUploadUrl,
    createJob,
    getJob,
    deleteJob,
    workerProcess,
} from './controllers/jobs.js';

// Validate configuration on startup
validateConfig();

// Initialize Firebase
initFirebase();

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Upload URL generation
app.post('/api/upload-url', getUploadUrl as any);

// Job management
app.post('/api/jobs', createJob as any);
app.get('/api/jobs/:id', getJob as any);
app.delete('/api/jobs/:id', deleteJob as any);

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL ROUTES (for Cloud Tasks / direct worker invocation)
// ═══════════════════════════════════════════════════════════════════════════

app.post('/workers/process', workerProcess as any);

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

app.listen(config.port, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  Gemini Video Analyzer v2.0                                ║
║  Server running on port ${config.port}                             ║
║  Environment: ${config.nodeEnv.padEnd(40)}║
╚════════════════════════════════════════════════════════════╝
  `);
});
