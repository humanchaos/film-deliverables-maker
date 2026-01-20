#!/usr/bin/env npx ts-node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MOCK TEST PIPELINE - Test analysis without video uploads
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This script tests the video analysis pipeline locally without requiring
 * actual video uploads, saving time and API credits during development.
 * 
 * Usage:
 *   npm run test:mock        # Mock Gemini responses
 *   npm run test:dry-run     # Test routing only, no API calls
 *   npx ts-node scripts/mock_test_pipeline.ts --full  # Full integration
 * 
 * @author Auto-generated
 * @date 2026-01-11
 */

import fetch from 'node-fetch';
import { config } from 'dotenv';

// Load environment
config({ path: '.env.local' });

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const API_URL = process.env.TEST_API_URL || 'http://localhost:8080';
const MOCK_GCS_URI = 'gs://gemini-video-uploads/test-samples/mock-video.mp4';

interface TestMode {
    name: string;
    skipGemini: boolean;
    skipWorker: boolean;
    description: string;
}

const TEST_MODES: Record<string, TestMode> = {
    'dry-run': {
        name: 'Dry Run',
        skipGemini: true,
        skipWorker: true,
        description: 'Tests endpoint routing and schema validation only',
    },
    'mock-gemini': {
        name: 'Mock Gemini',
        skipGemini: true,
        skipWorker: false,
        description: 'Worker runs but uses mock Gemini responses',
    },
    'full': {
        name: 'Full Integration',
        skipGemini: false,
        skipWorker: false,
        description: 'Full pipeline with real API calls',
    },
};

// ANSI colors
const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_ANALYSIS_RESULT = {
    synopsis: {
        title: 'Test Video Analysis',
        logline: 'A mock video for testing the analysis pipeline.',
        genre: 'Documentary',
        themes: ['Testing', 'Development'],
    },
    transcription: {
        segments: [
            { startTime: '00:00:00:00', endTime: '00:00:05:00', speaker: 'TEST', text: 'This is a test transcription.' },
        ],
    },
    shotList: {
        shots: [
            { shotNumber: 1, timecodeIn: '00:00:00:00', timecodeOut: '00:00:05:00', description: 'Opening shot', shotType: 'Wide' },
        ],
    },
    fauna: { sightings: [] },
    graphics: { elements: [] },
    cast: { appearances: [] },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function testHealthEndpoint(): Promise<boolean> {
    console.log(`\n${COLORS.bold}📋 Testing Health Endpoint${COLORS.reset}`);

    try {
        const res = await fetch(`${API_URL}/health`);
        const text = await res.text();

        if (res.ok && text === 'OK') {
            console.log(`  ${COLORS.green}✅ Health check passed${COLORS.reset}`);
            return true;
        } else {
            console.log(`  ${COLORS.red}❌ Health check failed: ${text}${COLORS.reset}`);
            return false;
        }
    } catch (error: any) {
        console.log(`  ${COLORS.red}❌ Cannot reach server: ${error.message}${COLORS.reset}`);
        console.log(`  ${COLORS.dim}   Is the backend running? Try: npm run dev${COLORS.reset}`);
        return false;
    }
}

async function testJobCreation(mode: TestMode): Promise<string | null> {
    console.log(`\n${COLORS.bold}📝 Testing Job Creation${COLORS.reset}`);

    const payload = {
        gcsUri: MOCK_GCS_URI,
        mimeType: 'video/mp4',
        duration: 300, // 5 minutes
        analysisConfig: {
            synopsis: true,
            transcription: true,
            shotList: true,
            fauna: false,
            graphics: false,
            cast: false,
        },
        userId: 'test-user-mock',
        testMode: mode.skipGemini ? 'mock' : undefined,
    };

    try {
        const res = await fetch(`${API_URL}/api/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.log(`  ${COLORS.red}❌ Job creation failed (${res.status}): ${errorText}${COLORS.reset}`);
            return null;
        }

        const data = await res.json() as any;
        console.log(`  ${COLORS.green}✅ Job created: ${data.id}${COLORS.reset}`);
        console.log(`  ${COLORS.dim}   Status: ${data.status}${COLORS.reset}`);
        return data.id;
    } catch (error: any) {
        console.log(`  ${COLORS.red}❌ Request failed: ${error.message}${COLORS.reset}`);
        return null;
    }
}

async function triggerWorkerManually(jobId: string): Promise<boolean> {
    console.log(`\n${COLORS.bold}⚡ Triggering Worker Manually${COLORS.reset}`);
    console.log(`  ${COLORS.dim}   (Bypassing Cloud Tasks queue for local testing)${COLORS.reset}`);

    try {
        const res = await fetch(`${API_URL}/workers/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId }),
        });

        if (res.ok) {
            console.log(`  ${COLORS.green}✅ Worker triggered successfully${COLORS.reset}`);
            return true;
        } else {
            const errorText = await res.text();
            console.log(`  ${COLORS.yellow}⚠️ Worker returned: ${res.status} - ${errorText.substring(0, 100)}${COLORS.reset}`);
            return true; // Continue polling anyway
        }
    } catch (error: any) {
        console.log(`  ${COLORS.red}❌ Worker trigger failed: ${error.message}${COLORS.reset}`);
        return false;
    }
}

async function pollJobStatus(jobId: string, maxAttempts: number = 30): Promise<any> {
    console.log(`\n${COLORS.bold}⏳ Polling Job Status${COLORS.reset}`);

    let attempts = 0;
    let lastProgress = -1;

    while (attempts < maxAttempts) {
        attempts++;
        await sleep(2000);

        try {
            const res = await fetch(`${API_URL}/api/jobs/${jobId}`);
            const job = await res.json() as any;

            const progress = job.progress?.overall || 0;
            const status = job.status;

            // Only log if progress changed
            if (progress !== lastProgress) {
                console.log(`  ${COLORS.cyan}[${attempts}/${maxAttempts}]${COLORS.reset} Status: ${status}, Progress: ${progress}%`);
                lastProgress = progress;
            }

            if (status === 'completed') {
                console.log(`  ${COLORS.green}✅ Job completed!${COLORS.reset}`);
                return job;
            }

            if (status === 'failed') {
                console.log(`  ${COLORS.red}❌ Job failed: ${job.error?.message || 'Unknown error'}${COLORS.reset}`);
                return job;
            }
        } catch (error: any) {
            console.log(`  ${COLORS.yellow}⚠️ Poll error: ${error.message}${COLORS.reset}`);
        }
    }

    console.log(`  ${COLORS.yellow}⚠️ Polling timeout - job still in progress${COLORS.reset}`);
    return null;
}

async function validateResults(job: any): Promise<void> {
    console.log(`\n${COLORS.bold}📊 Validating Results${COLORS.reset}`);

    const modules = ['synopsis', 'transcription', 'shotList', 'fauna', 'graphics', 'cast'];
    const results = job.results || {};
    const moduleProgress = job.progress?.modules || {};

    for (const mod of modules) {
        const progress = moduleProgress[mod] || 0;
        const hasResult = !!results[mod];

        if (progress === 100 && hasResult) {
            console.log(`  ${COLORS.green}✅ ${mod}: Complete${COLORS.reset}`);
        } else if (progress > 0) {
            console.log(`  ${COLORS.yellow}⏳ ${mod}: ${progress}% (${hasResult ? 'has data' : 'no data'})${COLORS.reset}`);
        } else {
            console.log(`  ${COLORS.dim}⏭️  ${mod}: Skipped${COLORS.reset}`);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
    // Parse command line args
    const arg = process.argv[2]?.replace('--', '') || 'mock-gemini';
    const mode = TEST_MODES[arg] || TEST_MODES['mock-gemini'];

    console.log(`\n${COLORS.cyan}╔════════════════════════════════════════════════════════════╗${COLORS.reset}`);
    console.log(`${COLORS.cyan}║${COLORS.reset}  ${COLORS.bold}🧪 MOCK TEST PIPELINE${COLORS.reset}                                   ${COLORS.cyan}║${COLORS.reset}`);
    console.log(`${COLORS.cyan}║${COLORS.reset}  ${COLORS.dim}Mode: ${mode.name}${COLORS.reset}                                         ${COLORS.cyan}║${COLORS.reset}`);
    console.log(`${COLORS.cyan}╚════════════════════════════════════════════════════════════╝${COLORS.reset}`);
    console.log(`\n${COLORS.dim}${mode.description}${COLORS.reset}`);
    console.log(`${COLORS.dim}Target: ${API_URL}${COLORS.reset}`);

    // Step 1: Health check
    const healthy = await testHealthEndpoint();
    if (!healthy) {
        console.log(`\n${COLORS.red}${COLORS.bold}🚫 ABORTED: Backend not reachable${COLORS.reset}\n`);
        process.exit(1);
    }

    // Step 2: Create job
    const jobId = await testJobCreation(mode);
    if (!jobId) {
        console.log(`\n${COLORS.red}${COLORS.bold}🚫 ABORTED: Job creation failed${COLORS.reset}\n`);
        process.exit(1);
    }

    // Step 3: Trigger worker (for local testing without Cloud Tasks)
    if (!mode.skipWorker) {
        await triggerWorkerManually(jobId);

        // Step 4: Poll for completion
        const job = await pollJobStatus(jobId);

        if (job) {
            // Step 5: Validate results
            await validateResults(job);
        }
    }

    // Summary
    console.log(`\n${COLORS.cyan}────────────────────────────────────────────────────────────${COLORS.reset}`);
    console.log(`${COLORS.bold}SUMMARY${COLORS.reset}`);
    console.log(`  Mode: ${mode.name}`);
    console.log(`  Job ID: ${jobId}`);
    console.log(`  API Target: ${API_URL}`);
    console.log(`${COLORS.cyan}────────────────────────────────────────────────────────────${COLORS.reset}`);

    if (mode.skipWorker) {
        console.log(`\n${COLORS.green}${COLORS.bold}✅ DRY RUN PASSED${COLORS.reset}`);
        console.log(`${COLORS.dim}   Job creation and routing verified.${COLORS.reset}\n`);
    } else {
        console.log(`\n${COLORS.green}${COLORS.bold}✅ TEST COMPLETE${COLORS.reset}`);
        console.log(`${COLORS.dim}   Check results above for module status.${COLORS.reset}\n`);
    }
}

main().catch(error => {
    console.error(`${COLORS.red}Test crashed: ${error.message}${COLORS.reset}`);
    process.exit(1);
});
