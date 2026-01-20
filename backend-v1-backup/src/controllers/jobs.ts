import { Request, Response } from 'express';
import { db } from '../config/firebase';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { JobDocument, ModuleStatus } from '../types';
import { Timestamp } from 'firebase-admin/firestore';


// ═══════════════════════════════════════════════════════════════════════════════
// FIX 0: DEFAULT ANALYSIS CONFIG (Prevents "no modules selected" bug)
// ═══════════════════════════════════════════════════════════════════════════════
const DEFAULT_ANALYSIS_CONFIG = {
    transcription: true,
    shotList: true,
    videoIntelligence: true,
    fauna: true,
    synopsis: true,
    graphics: true,
    cast: true  // Cast/bio enabled by default
};

/**
 * Safely merge incoming config with defaults.
 * 
 * CRITICAL: An empty object {} must be treated as "use defaults", NOT "disable all".
 * This fixes the bug where frontend sends {} and jobs hang forever.
 */
function mergeAnalysisConfig(incoming: any): typeof DEFAULT_ANALYSIS_CONFIG {
    // If incoming is null, undefined, or empty object -> use defaults
    if (!incoming || (typeof incoming === 'object' && Object.keys(incoming).length === 0)) {
        logger.info('[Config] Using default analysis config (incoming was empty/missing)');
        return { ...DEFAULT_ANALYSIS_CONFIG };
    }

    // Merge: defaults + incoming (incoming overrides defaults)
    const merged = { ...DEFAULT_ANALYSIS_CONFIG, ...incoming };

    // DEFENSIVE: Log if incoming has ANY false values (potential frontend bug)
    const disabledByIncoming = Object.entries(incoming)
        .filter(([_, enabled]) => enabled === false)
        .map(([name]) => name);

    if (disabledByIncoming.length > 0) {
        logger.warn('[Config] ⚠️ Frontend sent disabled modules:', { disabledByIncoming });
    }

    // Log the final config for debugging
    const enabledModules = Object.entries(merged)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name);
    logger.info('[Config] Merged analysis config', { enabledModules });

    return merged;
}

export const createJob = async (req: Request, res: Response) => {
    // ═══════════════════════════════════════════════════════════════
    // DEEP DEBUG: Log IMMEDIATELY when endpoint is hit
    // ═══════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('[DEBUG-JOBS] ★★★ createJob ENDPOINT HIT ★★★');
    console.log('[DEBUG-JOBS] Request body keys:', Object.keys(req.body || {}));
    console.log('[DEBUG-JOBS] Config check - workerUrl:', config.workerUrl || 'NOT SET');
    console.log('[DEBUG-JOBS] Config check - projectId:', config.projectId || 'NOT SET');
    console.log('═══════════════════════════════════════════════════════════');

    try {
        const { gcsUri, mimeType, duration, analysisConfig, userId, geminiFileUri } = req.body;

        console.log('[DEBUG-JOBS] Parsed params - gcsUri:', gcsUri?.substring(0, 50));
        console.log('[DEBUG-JOBS] Parsed params - geminiFileUri:', geminiFileUri?.substring(0, 50));

        if (!gcsUri) {
            console.log('[DEBUG-JOBS] ERROR: No gcsUri provided!');
            return res.status(400).json({ error: 'gcsUri is required' });
        }

        // FIX 0: Properly merge config with defaults
        const finalAnalysisConfig = mergeAnalysisConfig(analysisConfig);
        console.log('[DEBUG-JOBS] Final analysis config:', JSON.stringify(finalAnalysisConfig));

        // 1. Create Job Document
        const initialModuleStatus: ModuleStatus = { status: 'pending', progress: 0 };

        // Convert duration to number if not already
        const durationNum = typeof duration === 'string' ? parseFloat(duration) : (duration || 0);

        const jobData: Omit<JobDocument, 'id'> = {
            userId: userId || 'anonymous',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            status: 'queued',
            input: {
                gcsUri,
                mimeType: mimeType || 'video/mp4',
                duration: durationNum,
                analysisConfig: finalAnalysisConfig
            },
            progress: {
                overall: 0,
                currentStage: 'Initialized',
                modules: {
                    fauna: { ...initialModuleStatus },
                    transcription: { ...initialModuleStatus },
                    shotList: { ...initialModuleStatus },
                    synopsis: { ...initialModuleStatus },
                    graphics: { ...initialModuleStatus },
                    cast: { ...initialModuleStatus }
                }
            },
            results: {},
            ...(geminiFileUri && { geminiFileUri })
        };

        console.log('[DEBUG-JOBS] About to write to Firestore...');
        const docRef = await db.collection('jobs').add(jobData);
        const jobId = docRef.id;
        console.log('[DEBUG-JOBS] ✓ Firestore write SUCCESS. JobId:', jobId);

        logger.info('Job created', {
            jobId,
            geminiFileUriReceived: !!geminiFileUri,
            geminiFileUri: geminiFileUri ? geminiFileUri.substring(0, 50) + '...' : 'none',
            enabledModules: Object.keys(finalAnalysisConfig).filter(k => finalAnalysisConfig[k as keyof typeof finalAnalysisConfig])
        });

        // ═══════════════════════════════════════════════════════════════
        // WORKER DISPATCH - This is the critical section
        // ═══════════════════════════════════════════════════════════════
        const workerUrl = config.workerUrl || 'https://gemini-super-app-backend-193471035724.europe-west3.run.app';
        const targetUrl = workerUrl.endsWith('/workers/process')
            ? workerUrl
            : `${workerUrl}/workers/process`;

        console.log('═══════════════════════════════════════════════════════════');
        console.log('[DEBUG-JOBS] ★★★ WORKER DISPATCH STARTING ★★★');
        console.log('[DEBUG-JOBS] Target URL:', targetUrl);
        console.log('[DEBUG-JOBS] Job ID to dispatch:', jobId);
        console.log('═══════════════════════════════════════════════════════════');

        logger.info('[Worker Dispatch] Calling worker directly', { targetUrl, jobId });

        // Fire-and-forget with VERY explicit logging
        const dispatchPromise = fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId })
        });

        console.log('[DEBUG-JOBS] fetch() called - waiting for response...');

        dispatchPromise.then(response => {
            console.log('[DEBUG-JOBS] ★ Worker response received! Status:', response.status);
            if (response.ok) {
                console.log('[DEBUG-JOBS] ✓✓✓ WORKER ACCEPTED JOB ✓✓✓');
                logger.info('[Worker Dispatch] Worker accepted job', { jobId, status: response.status });
            } else {
                console.log('[DEBUG-JOBS] ✗✗✗ WORKER REJECTED JOB ✗✗✗');
                logger.error('[Worker Dispatch] Worker rejected job', { jobId, status: response.status });
            }
        }).catch(err => {
            console.log('[DEBUG-JOBS] ✗✗✗ FETCH FAILED ✗✗✗');
            console.log('[DEBUG-JOBS] Error name:', err.name);
            console.log('[DEBUG-JOBS] Error message:', err.message);
            console.log('[DEBUG-JOBS] Error stack:', err.stack);
            logger.error('[Worker Dispatch] Failed to reach worker', { jobId, error: err.message });
        });

        console.log('[DEBUG-JOBS] Returning 201 to client...');
        res.status(201).json({ id: jobId, status: 'queued' });

    } catch (error: any) {
        console.log('[DEBUG-JOBS] ✗✗✗ EXCEPTION IN createJob ✗✗✗');
        console.log('[DEBUG-JOBS] Error:', error.message);
        console.log('[DEBUG-JOBS] Stack:', error.stack);
        logger.error('Error creating job', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getJob = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const jobRef = db.collection('jobs').doc(id);
        const doc = await jobRef.get();

        if (!doc.exists) {
            logger.warn(`Job document not found for ID: "${id}"`);
            return res.status(404).json({ error: 'Job not found' });
        }

        const data = doc.data() as Omit<JobDocument, 'id'> & { hasSubcollections?: boolean; results?: Record<string, any> };

        // S5: Result Hydration (GCS Pointers)
        if (data.results) {
            const hydrationPromises: Promise<void>[] = [];

            Object.keys(data.results).forEach(key => {
                const moduleData = data.results![key];
                if (moduleData && moduleData.isOffloaded && moduleData.url) {
                    hydrationPromises.push((async () => {
                        try {
                            const response = await fetch(moduleData.url);
                            if (!response.ok) throw new Error(`Failed to fetch ${key}: ${response.statusText}`);
                            const json = await response.json();
                            data.results![key] = json;
                        } catch (e) {
                            logger.error(`Failed to hydrate result for ${key}`, e);
                            data.results![key] = { error: 'Failed to load result' };
                        }
                    })());
                }
            });

            if (hydrationPromises.length > 0) {
                await Promise.all(hydrationPromises);
            }
        }

        // Legacy Subcollection Support
        if (data.hasSubcollections) {
            const resultsRef = jobRef.collection('results');
            const modules = ['transcription', 'shotList', 'fauna', 'synopsis'];
            const subDocs = await Promise.all(modules.map(m => resultsRef.doc(m).get()));

            if (!data.results) data.results = {};
            subDocs.forEach((subDoc, index) => {
                if (subDoc.exists) {
                    const content = subDoc.data();
                    if (content && content.data) {
                        data.results![modules[index]] = content.data;
                    }
                }
            });
        }

        res.json({ ...data, id: doc.id } as JobDocument);

    } catch (error) {
        logger.error('Error fetching job', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const debugLatestJobs = async (req: Request, res: Response) => {
    try {
        const snapshot = await db.collection('jobs')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

        const jobs = snapshot.docs.map(doc => ({
            id: doc.id,
            status: doc.data().status,
            analysisConfig: doc.data().input?.analysisConfig,
            createdAt: doc.data().createdAt
        }));

        res.json({
            count: snapshot.size,
            projectId: process.env.GOOGLE_CLOUD_PROJECT || 'unknown',
            jobs
        });
    } catch (error) {
        logger.error('Debug list failed', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Error' });
    }
};