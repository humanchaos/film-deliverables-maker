/**
 * verify_bios_module.ts
 * 
 * TDD Verification Script for the Bios/Cast Module
 * Tests the analyzeTalent function in isolation to verify Gemini API integration
 * 
 * Run with: npx ts-node scripts/verify_bios_module.ts [gemini_file_uri]
 * 
 * Arguments:
 *   gemini_file_uri - Optional. A Gemini Files API URI to test with.
 *                     If not provided, uses a test video from environment.
 * 
 * Exit codes:
 *   0 - Test passed (valid response received)
 *   1 - Test failed (error or invalid response)
 */

import { analyzeTalent } from '../src/services/geminiService';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables from .env.local
dotenvConfig({ path: '.env.local' });

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
    console.log(`${color}[${timestamp}] [BIOS-TEST] [${level}]${colors.reset} ${message}`);
    if (data !== undefined) {
        console.log(`  └── `, JSON.stringify(data, null, 2));
    }
}

interface BioSchemaCheck {
    field: string;
    present: boolean;
    type: string;
    valid: boolean;
}

function validateBioSchema(entry: unknown): BioSchemaCheck[] {
    if (typeof entry !== 'object' || entry === null) {
        return [{ field: 'root', present: false, type: typeof entry, valid: false }];
    }

    const obj = entry as Record<string, unknown>;
    const requiredFields = ['name', 'fullName', 'title', 'biography'];

    return requiredFields.map(field => ({
        field,
        present: field in obj,
        type: typeof obj[field],
        valid: field in obj && typeof obj[field] === 'string' && (obj[field] as string).length > 0
    }));
}

async function main(): Promise<void> {
    log('INFO', '════════════════════════════════════════════════════════════════');
    log('INFO', 'BIOS MODULE VERIFICATION TEST');
    log('INFO', '════════════════════════════════════════════════════════════════');

    // 1. Check environment - support both GEMINI_API_KEY and VITE_GEMINI_API_KEY
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        log('FAIL', 'Neither GEMINI_API_KEY nor VITE_GEMINI_API_KEY environment variable is set');
        process.exit(1);
    }

    // Set it for the geminiService which expects GEMINI_API_KEY
    process.env.GEMINI_API_KEY = apiKey;
    log('PASS', `API Key found (first 8 chars: ${apiKey.substring(0, 8)}...)`);

    // 2. Get Gemini File URI from args or use test fallback
    let geminiFileUri = process.argv[2];

    if (!geminiFileUri) {
        // Try to get from environment
        geminiFileUri = process.env.TEST_GEMINI_FILE_URI || '';

        if (!geminiFileUri) {
            log('FAIL', 'No Gemini File URI provided');
            log('INFO', 'Usage: npx ts-node scripts/verify_bios_module.ts <gemini_file_uri>');
            log('INFO', 'Example: npx ts-node scripts/verify_bios_module.ts "https://generativelanguage.googleapis.com/v1beta/files/abc123"');
            log('INFO', 'Or set TEST_GEMINI_FILE_URI in .env.local');
            process.exit(1);
        }
    }

    log('INFO', `Testing with Gemini File URI: ${geminiFileUri.substring(0, 60)}...`);

    // 3. Call analyzeTalent
    log('INFO', '────────────────────────────────────────────────────────────────');
    log('INFO', 'PHASE 1: Calling analyzeTalent()');
    log('INFO', '────────────────────────────────────────────────────────────────');

    try {
        const startTime = Date.now();
        const talent = await analyzeTalent(
            geminiFileUri,
            'video/mp4',
            undefined // No cache for testing
        );
        const duration = Date.now() - startTime;

        log('INFO', `analyzeTalent() returned in ${duration}ms`);

        // 4. Validate response type
        if (!Array.isArray(talent)) {
            log('FAIL', `Response is not an array, got: ${typeof talent}`);
            process.exit(1);
        }
        log('PASS', `Response is array with ${talent.length} entries`);

        // 5. Handle empty array (valid but noteworthy)
        if (talent.length === 0) {
            log('WARN', 'analyzeTalent returned empty array - no people detected');
            log('WARN', 'This is valid if the video has no visible people');
            log('WARN', 'Test PASSED (function works, but no data to validate)');
            process.exit(0);
        }

        // 6. Validate schema of first entry
        log('INFO', '────────────────────────────────────────────────────────────────');
        log('INFO', 'PHASE 2: Validating Response Schema');
        log('INFO', '────────────────────────────────────────────────────────────────');

        const firstEntry = talent[0];
        const schemaChecks = validateBioSchema(firstEntry);

        let allValid = true;
        for (const check of schemaChecks) {
            if (check.valid) {
                log('PASS', `Field "${check.field}": present and valid (${check.type})`);
            } else if (check.present) {
                log('WARN', `Field "${check.field}": present but empty or wrong type (${check.type})`);
                allValid = false;
            } else {
                log('FAIL', `Field "${check.field}": MISSING`);
                allValid = false;
            }
        }

        // 7. Output sample data
        log('INFO', '────────────────────────────────────────────────────────────────');
        log('INFO', 'SAMPLE RESPONSE DATA');
        log('INFO', '────────────────────────────────────────────────────────────────');
        log('INFO', 'First entry:', firstEntry);

        // 8. Final verdict
        log('INFO', '════════════════════════════════════════════════════════════════');
        if (allValid) {
            log('PASS', '✓ VERIFICATION PASSED - analyzeTalent works correctly');
            process.exit(0);
        } else {
            log('FAIL', '✗ VERIFICATION FAILED - Response schema invalid');
            process.exit(1);
        }

    } catch (error: unknown) {
        log('INFO', '────────────────────────────────────────────────────────────────');
        log('FAIL', 'analyzeTalent() threw an exception');
        log('INFO', '────────────────────────────────────────────────────────────────');

        if (error instanceof Error) {
            log('FAIL', `Error name: ${error.name}`);
            log('FAIL', `Error message: ${error.message}`);

            // Structured error analysis per GEMINI.md
            if (error.message.includes('404')) {
                log('WARN', 'The Gemini file may have expired (48h TTL) or been deleted');
            } else if (error.message.includes('403')) {
                log('WARN', 'API key may not have permission to access this file');
            } else if (error.message.includes('429')) {
                log('WARN', 'Rate limit hit. Wait and try again.');
            } else if (error.message.includes('API key')) {
                log('WARN', 'Authentication issue - check GEMINI_API_KEY');
            }

            if (error.stack) {
                log('INFO', 'Stack trace (first 500 chars):');
                console.log(error.stack.substring(0, 500));
            }
        } else {
            log('FAIL', 'Unknown error type:', error);
        }

        process.exit(1);
    }
}

main();
