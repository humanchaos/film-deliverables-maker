/**
 * Gemini Video Analyzer - Backend Server v2.4.0
 * 
 * Clean, minimal Express server with:
 * - REST API for job management
 * - Health check endpoint
 * - CORS for frontend access
 * - Rate limiting & circuit breaker (NEW)
 * - Checkpoint persistence (NEW)
 */

import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config, validateConfig } from './config/env.js';
import { initFirebase } from './services/firebase.js';
import {
    getUploadUrl,
    createJob,
    getJob,
    deleteJob,
    workerProcess,
} from './controllers/jobs.js';
import {
    createTemplate,
    listTemplates,
    getTemplate,
    updateTemplate,
    deleteTemplate,
    downloadWithTemplate
} from './controllers/templates.js';

// ═══════════════════════════════════════════════════════════════════════════
// STARTUP CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clean up stale temp files from previous runs
 * Prevents disk space bloat on long-running instances
 */
function cleanupTempFiles(): void {
    try {
        const tempDir = os.tmpdir();
        const files = fs.readdirSync(tempDir);
        const staleFiles = files.filter(f => f.startsWith('gemini_'));

        if (staleFiles.length > 0) {
            console.log(`[Cleanup] Removing ${staleFiles.length} stale temp files...`);
            staleFiles.forEach(f => {
                try {
                    fs.unlinkSync(path.join(tempDir, f));
                } catch { /* ignore individual file errors */ }
            });
        }
    } catch (error) {
        console.warn('[Cleanup] Could not clean temp files:', error);
    }
}

// Validate configuration on startup
validateConfig();

// Clean up stale temp files
cleanupTempFiles();

// Initialize Firebase
initFirebase();

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased for large job payloads

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Upload URL generation
app.post('/api/upload-url', getUploadUrl as any);

// Job management
app.post('/api/jobs', createJob as any);
app.get('/api/jobs/:id', getJob as any);
app.delete('/api/jobs/:id', deleteJob as any);

// Template management
app.post('/api/templates', createTemplate as any);
app.get('/api/templates', listTemplates as any);
app.get('/api/templates/:id', getTemplate as any);
app.put('/api/templates/:id', updateTemplate as any);
app.delete('/api/templates/:id', deleteTemplate as any);

// Download with custom template
app.get('/api/jobs/:jobId/download/:module', downloadWithTemplate as any);

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
        version: '2.4.0',  // Version with all audit fixes
        apiVersion: 'v2',
        service: 'gemini-super-app-backend',
        features: [
            'geminiFileUri-passthrough',
            'checkpoint-persistence',
            'rate-limiting',
            'circuit-breaker',
            'module-timeouts',
            'atomic-job-locking'
        ]
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
║  Gemini Video Analyzer v2.4.0                              ║
║  Server running on port ${config.port}                             ║
║  Environment: ${config.nodeEnv.padEnd(40)}║
║  Features: Rate Limiting, Checkpoints, Circuit Breaker     ║
╚════════════════════════════════════════════════════════════╝
  `);
});
// Test deploy Mon Jan 26 23:26:53 CET 2026
