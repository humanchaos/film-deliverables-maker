/**
 * BIOS MODULE DEBUG SCRIPT
 * 
 * This script tests the talent/bios analysis pipeline in isolation.
 * Run with: npx ts-node src/scripts/debug_bios.ts <gemini_file_uri>
 * 
 * Example:
 *   npx ts-node src/scripts/debug_bios.ts "https://generativelanguage.googleapis.com/v1beta/files/abc123"
 */

import * as geminiService from '../services/geminiService';
import { config } from '../config/env';

// ANSI colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'SUCCESS', message: string, data?: any) {
    const colorMap = {
        INFO: colors.blue,
        WARN: colors.yellow,
        ERROR: colors.red,
        DEBUG: colors.cyan,
        SUCCESS: colors.green,
    };
    const color = colorMap[level];
    const timestamp = new Date().toISOString();
    console.log(`${color}[${timestamp}] [${level}]${colors.reset} ${message}`);
    if (data !== undefined) {
        console.log(`${colors.cyan}└── Data:${colors.reset}`, JSON.stringify(data, null, 2));
    }
}

async function debugBiosModule() {
    log('INFO', '═══════════════════════════════════════════════════════════════');
    log('INFO', '         BIOS/CAST MODULE DEBUG SCRIPT');
    log('INFO', '═══════════════════════════════════════════════════════════════');

    // 1. Check environment
    log('DEBUG', 'Checking environment configuration...');

    if (!config.geminiApiKey) {
        log('ERROR', 'GEMINI_API_KEY is not set!');
        process.exit(1);
    }
    log('SUCCESS', `GEMINI_API_KEY is set (first 8 chars: ${config.geminiApiKey.substring(0, 8)}...)`);

    // 2. Get test file URI from args or use a test value
    const geminiFileUri = process.argv[2];

    if (!geminiFileUri) {
        log('ERROR', 'No Gemini File URI provided!');
        log('INFO', 'Usage: npx ts-node src/scripts/debug_bios.ts <gemini_file_uri>');
        log('INFO', 'Example: npx ts-node src/scripts/debug_bios.ts "https://generativelanguage.googleapis.com/v1beta/files/abc123"');
        process.exit(1);
    }

    log('INFO', `Testing with Gemini File URI: ${geminiFileUri}`);

    // 3. Call the analyzeTalent function
    log('DEBUG', '════════════════════════════════════════════════════════════');
    log('DEBUG', 'STEP 1: Calling geminiService.analyzeTalent()');
    log('DEBUG', '════════════════════════════════════════════════════════════');

    try {
        const startTime = Date.now();
        log('DEBUG', 'Initiating Gemini API call...');

        const talent = await geminiService.analyzeTalent(
            geminiFileUri,
            'video/mp4',
            undefined // No cache
        );

        const duration = Date.now() - startTime;
        log('SUCCESS', `analyzeTalent() completed in ${duration}ms`);

        // 4. Analyze the result
        log('DEBUG', '════════════════════════════════════════════════════════════');
        log('DEBUG', 'STEP 2: Analyzing Response');
        log('DEBUG', '════════════════════════════════════════════════════════════');

        log('DEBUG', `Response type: ${typeof talent}`);
        log('DEBUG', `Is array: ${Array.isArray(talent)}`);
        log('DEBUG', `Array length: ${Array.isArray(talent) ? talent.length : 'N/A'}`);

        if (!talent || (Array.isArray(talent) && talent.length === 0)) {
            log('WARN', 'No talent detected in video!');
            log('WARN', 'This could mean:');
            log('WARN', '  1. No people appear on screen in the video');
            log('WARN', '  2. The Gemini model failed to detect faces/people');
            log('WARN', '  3. The video content is too short or unclear');
        } else if (Array.isArray(talent)) {
            log('SUCCESS', `Found ${talent.length} people in the video!`);

            talent.forEach((person, index) => {
                log('INFO', `────────────────────────────────────────`);
                log('INFO', `Person ${index + 1}:`);
                log('DEBUG', `  name: "${person.name || 'MISSING'}"`);
                log('DEBUG', `  fullName: "${person.fullName || 'MISSING'}"`);
                log('DEBUG', `  title: "${person.title || 'MISSING'}"`);
                log('DEBUG', `  biography: "${(person.biography || 'MISSING').substring(0, 100)}..."`);
                log('DEBUG', `  firstAppearance: "${(person as any).firstAppearance || 'MISSING'}"`);

                // Check for required Bio fields
                const missingFields: string[] = [];
                if (!person.name) missingFields.push('name');
                if (!person.fullName) missingFields.push('fullName');
                if (!person.title) missingFields.push('title');
                if (!person.biography) missingFields.push('biography');

                if (missingFields.length > 0) {
                    log('WARN', `  ⚠ Missing required Bio fields: ${missingFields.join(', ')}`);
                } else {
                    log('SUCCESS', '  ✓ All required Bio fields present');
                }
            });
        } else {
            log('ERROR', 'Unexpected response format!', talent);
        }

        // 5. Check Bio interface compatibility
        log('DEBUG', '════════════════════════════════════════════════════════════');
        log('DEBUG', 'STEP 3: Checking Frontend Bio Interface Compatibility');
        log('DEBUG', '════════════════════════════════════════════════════════════');

        log('INFO', 'Expected Bio interface:');
        log('INFO', '  - name: string (required)');
        log('INFO', '  - fullName: string (required)');
        log('INFO', '  - title: string (required)');
        log('INFO', '  - biography: string (required)');
        log('INFO', '  - isLoading?: boolean');
        log('INFO', '  - error?: string');
        log('INFO', '  - sources?: string[]');

        if (Array.isArray(talent) && talent.length > 0) {
            const samplePerson = talent[0];
            const bioCompatible =
                typeof samplePerson.name === 'string' &&
                typeof samplePerson.fullName === 'string' &&
                typeof samplePerson.title === 'string' &&
                typeof samplePerson.biography === 'string';

            if (bioCompatible) {
                log('SUCCESS', '✓ Response is compatible with Bio interface');
            } else {
                log('ERROR', '✗ Response is NOT compatible with Bio interface');
                log('ERROR', 'The frontend will fail to render this data!');
            }
        }

        // 6. Full response for debugging
        log('DEBUG', '════════════════════════════════════════════════════════════');
        log('DEBUG', 'STEP 4: Full Response Data');
        log('DEBUG', '════════════════════════════════════════════════════════════');
        console.log(JSON.stringify(talent, null, 2));

    } catch (error: any) {
        log('ERROR', '════════════════════════════════════════════════════════════');
        log('ERROR', 'ANALYSIS FAILED!');
        log('ERROR', '════════════════════════════════════════════════════════════');
        log('ERROR', `Error name: ${error.name}`);
        log('ERROR', `Error message: ${error.message}`);
        log('ERROR', `Error code: ${error.code || 'none'}`);
        log('ERROR', `Error status: ${error.status || 'none'}`);

        if (error.message?.includes('404')) {
            log('WARN', 'The Gemini file may have expired or been deleted.');
            log('WARN', 'Gemini Files have a 48-hour TTL by default.');
        } else if (error.message?.includes('403')) {
            log('WARN', 'API key may not have permission to access this file.');
        } else if (error.message?.includes('429')) {
            log('WARN', 'Rate limit hit. Wait and try again.');
        }

        if (error.stack) {
            log('DEBUG', 'Stack trace:');
            console.log(error.stack);
        }

        process.exit(1);
    }

    log('SUCCESS', '════════════════════════════════════════════════════════════');
    log('SUCCESS', 'DEBUG COMPLETE');
    log('SUCCESS', '════════════════════════════════════════════════════════════');
}

// Run the debug script
debugBiosModule().catch(console.error);
