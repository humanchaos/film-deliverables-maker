/**
 * Gemini API Migration Verification Script
 * 
 * Per GEMINI.md TDD Rule: This script verifies:
 * 1. The @google/genai SDK is correctly installed
 * 2. The API key is valid
 * 3. A simple call to Gemini works
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { GoogleGenAI } from '@google/genai';

async function verify() {
    console.log('[Migration] Starting Gemini API verification...\n');

    // Check API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY environment variable not set');
        console.error('\nSet it with: export GEMINI_API_KEY="your-api-key"');
        process.exit(1);
    }

    console.log('✓ GEMINI_API_KEY is set');

    // Initialize client
    let genai: GoogleGenAI;
    try {
        genai = new GoogleGenAI({ apiKey });
        console.log('✓ GoogleGenAI client initialized');
    } catch (error) {
        console.error('❌ Failed to initialize GoogleGenAI client:', error);
        process.exit(1);
    }

    // Test simple call
    try {
        console.log('\n[Migration] Testing API call...');

        const response = await genai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ text: 'Say "Hello, verification successful!" and nothing else.' }],
        });

        const text = response.text;
        console.log(`✓ API Response: ${text}`);

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  ✅ Gemini API verification SUCCESSFUL                      ║');
        console.log('║  The @google/genai SDK is correctly configured.             ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

    } catch (error) {
        console.error('\n❌ API call failed:', error);

        if (error instanceof Error) {
            if (error.message.includes('API key')) {
                console.error('\n[Migration] The API key appears to be invalid.');
            } else if (error.message.includes('quota')) {
                console.error('\n[Migration] You may have exceeded your API quota.');
            } else if (error.message.includes('model')) {
                console.error('\n[Migration] The model "gemini-2.0-flash" may not be available.');
            }
        }

        process.exit(1);
    }
}

verify().catch((err) => {
    console.error('[Migration] Verification script failed:', err);
    process.exit(1);
});
