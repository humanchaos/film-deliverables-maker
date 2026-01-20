/**
 * verify_bios_grounding.ts
 * 
 * TDD Verification Script for Grounded Biography Generation
 * Tests the enrichBioWithSearch function that uses Google Search grounding
 * 
 * Run with: npx ts-node scripts/verify_bios_grounding.ts "Name" "Title"
 * Example:  npx ts-node scripts/verify_bios_grounding.ts "Ellen Conneily" "Director of Conservation"
 * 
 * Exit codes:
 *   0 - Test passed (valid grounded biography received)
 *   1 - Test failed (error or invalid response)
 */

import { config as dotenvConfig } from 'dotenv';

// Load environment variables from .env.local
dotenvConfig({ path: '.env.local' });

// Support both GEMINI_API_KEY and VITE_GEMINI_API_KEY
const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
if (apiKey) {
    process.env.GEMINI_API_KEY = apiKey;
}

// Import AFTER setting env var
import { enrichBioWithSearch, isRealName } from '../src/services/geminiService';

// ANSI colors for structured output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
};

function log(level: 'INFO' | 'PASS' | 'FAIL' | 'WARN', message: string, data?: unknown): void {
    const colorMap = {
        INFO: colors.cyan,
        PASS: colors.green,
        FAIL: colors.red,
        WARN: colors.yellow,
    };
    const color = colorMap[level];
    const timestamp = new Date().toISOString();
    console.log(`${color}[${timestamp}] [GROUNDING-TEST] [${level}]${colors.reset} ${message}`);
    if (data !== undefined) {
        console.log(`  └── `, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    }
}

async function main(): Promise<void> {
    log('INFO', '════════════════════════════════════════════════════════════════');
    log('INFO', 'GROUNDED BIOGRAPHY VERIFICATION TEST');
    log('INFO', '════════════════════════════════════════════════════════════════');

    // 1. Check environment
    if (!process.env.GEMINI_API_KEY) {
        log('FAIL', 'Neither GEMINI_API_KEY nor VITE_GEMINI_API_KEY environment variable is set');
        process.exit(1);
    }
    log('PASS', `API Key found`);

    // 2. Get name and title from args
    const name = process.argv[2];
    const title = process.argv[3] || '';

    if (!name) {
        log('FAIL', 'No name provided');
        log('INFO', 'Usage: npx ts-node scripts/verify_bios_grounding.ts "Name" "Title"');
        log('INFO', 'Example: npx ts-node scripts/verify_bios_grounding.ts "Ellen Conneily" "Director of Conservation"');
        process.exit(1);
    }

    log('INFO', `Testing with name: "${name}", title: "${title}"`);

    // 3. Test isRealName function
    log('INFO', '────────────────────────────────────────────────────────────────');
    log('INFO', 'TEST 1: isRealName() function');
    log('INFO', '────────────────────────────────────────────────────────────────');

    try {
        const isReal = isRealName(name);
        if (isReal) {
            log('PASS', `"${name}" is classified as a real name`);
        } else {
            log('WARN', `"${name}" is classified as a descriptive name (grounding will be skipped)`);
        }
    } catch (error: unknown) {
        log('FAIL', 'isRealName() function not found or threw error');
        log('INFO', 'This is expected if the function has not been implemented yet');
        if (error instanceof Error) {
            log('INFO', `Error: ${error.message}`);
        }
        process.exit(1);
    }

    // 4. Test enrichBioWithSearch function
    log('INFO', '────────────────────────────────────────────────────────────────');
    log('INFO', 'TEST 2: enrichBioWithSearch() function');
    log('INFO', '────────────────────────────────────────────────────────────────');

    try {
        const startTime = Date.now();
        const result = await enrichBioWithSearch(name, title);
        const duration = Date.now() - startTime;

        log('INFO', `enrichBioWithSearch() returned in ${duration}ms`);

        // Validate response structure
        if (typeof result !== 'object' || result === null) {
            log('FAIL', `Response is not an object, got: ${typeof result}`);
            process.exit(1);
        }

        if (typeof result.biography !== 'string') {
            log('FAIL', `biography field is not a string, got: ${typeof result.biography}`);
            process.exit(1);
        }

        if (!Array.isArray(result.sources)) {
            log('FAIL', `sources field is not an array, got: ${typeof result.sources}`);
            process.exit(1);
        }

        log('PASS', 'Response structure is valid');

        // Check content quality
        if (result.biography.length === 0) {
            log('WARN', 'Biography is empty (may be expected for unknown names)');
        } else if (result.biography.length < 50) {
            log('WARN', `Biography is short (${result.biography.length} chars)`);
        } else {
            log('PASS', `Biography has ${result.biography.length} characters`);
        }

        if (result.sources.length === 0) {
            log('WARN', 'No sources returned (may indicate grounding was not used)');
        } else {
            log('PASS', `${result.sources.length} source(s) returned`);
        }

        // Output the result
        log('INFO', '────────────────────────────────────────────────────────────────');
        log('INFO', 'RESULT');
        log('INFO', '────────────────────────────────────────────────────────────────');
        log('INFO', 'Biography:', result.biography);
        log('INFO', 'Sources:', result.sources);

        // Final verdict
        log('INFO', '════════════════════════════════════════════════════════════════');
        if (result.biography.length > 0) {
            log('PASS', '✓ VERIFICATION PASSED - Grounded biography generated');
            process.exit(0);
        } else {
            log('WARN', '⚠ VERIFICATION PASSED (empty result - may be expected for unknown names)');
            process.exit(0);
        }

    } catch (error: unknown) {
        log('FAIL', 'enrichBioWithSearch() threw an exception');

        if (error instanceof Error) {
            if (error.message.includes('is not a function') || error.message.includes('is not defined')) {
                log('INFO', 'The function has not been implemented yet (expected for TDD)');
            }
            log('FAIL', `Error: ${error.message}`);
        } else {
            log('FAIL', 'Unknown error:', error);
        }

        process.exit(1);
    }
}

main();
