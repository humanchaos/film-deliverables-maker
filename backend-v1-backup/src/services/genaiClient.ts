/**
 * genaiClient.ts
 * 
 * Centralized SDK adapter for @google/genai
 * Per GEMINI.md: Singleton pattern with lazy initialization
 */

import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

/**
 * Get singleton GoogleGenAI client instance
 * Lazy initialization - only creates client when first called
 */
export function getGenAIClient(): GoogleGenAI {
    if (!_client) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("[Migration] GEMINI_API_KEY environment variable not set");
        }
        console.log("[Migration] Initializing @google/genai client");
        _client = new GoogleGenAI({ apiKey });
    }
    return _client;
}

/**
 * Helper: Create content part from file URI
 * Replicates createPartFromUri helper from SDK
 */
export function createFileDataPart(fileUri: string, mimeType: string) {
    return {
        fileData: {
            fileUri,
            mimeType,
        },
    };
}

/**
 * Helper: Create user content wrapper
 */
export function createUserContent(parts: any[]) {
    return {
        role: "user" as const,
        parts,
    };
}
