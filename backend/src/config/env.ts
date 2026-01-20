/**
 * Environment Configuration
 * Single source of truth for all configuration
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

interface Config {
    port: number;
    nodeEnv: string;
    gcpProject: string;
    storageBucket: string;
    geminiApiKey: string;
}

export const config: Config = {
    port: parseInt(process.env.PORT || '8080', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    gcpProject: process.env.GOOGLE_CLOUD_PROJECT || '',
    storageBucket: process.env.GCS_BUCKET || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
};

/**
 * Validate required configuration on startup
 */
export function validateConfig(): void {
    const required: (keyof Config)[] = ['gcpProject', 'storageBucket', 'geminiApiKey'];
    const missing = required.filter(key => !config[key]);

    if (missing.length > 0) {
        console.error(`[Config] Missing required environment variables: ${missing.join(', ')}`);
        console.error(`
Required environment variables:
  GOOGLE_CLOUD_PROJECT - Your GCP project ID
  GCS_BUCKET          - Cloud Storage bucket name
  GEMINI_API_KEY      - Gemini API key
    `);
        process.exit(1);
    }

    console.log(`[Config] Loaded: project=${config.gcpProject}, bucket=${config.storageBucket}`);
}
