/**
 * verify_genai_connection.ts
 * 
 * TDD Verification Script for @google/genai SDK Migration
 * Per GEMINI.md: Must pass before any refactoring begins
 * 
 * Run with: npx ts-node scripts/verify_genai_connection.ts
 */

import { GoogleGenAI } from "@google/genai";
import { config } from "dotenv";

// Load environment variables
config({ path: ".env.local" });

async function main() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("[Migration] FAILED: GEMINI_API_KEY environment variable not set");
        process.exit(1);
    }

    console.log("[Migration] API Key found (first 10 chars):", apiKey.substring(0, 10) + "...");
    console.log("[Migration] Initializing @google/genai client...");

    try {
        const ai = new GoogleGenAI({ apiKey });

        console.log("[Migration] Sending test prompt to gemini-2.0-flash...");

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: "Reply with exactly one word: PONG",
        });

        const text = response.text;
        console.log("[Migration] Response received:", text);

        if (text && text.toLowerCase().includes("pong")) {
            console.log("[Migration] SUCCESS: Basic API call works with @google/genai SDK");
            process.exit(0);
        } else {
            console.error("[Migration] FAILED: Unexpected response format");
            process.exit(1);
        }
    } catch (error: any) {
        console.error("[Migration] FAILED:", error.message);

        // Per GEMINI.md: Log structured errors
        if (error.message?.includes("API key")) {
            console.error("[Migration] Error Type: Authentication issue");
        } else if (error.message?.includes("model")) {
            console.error("[Migration] Error Type: Model/API shape issue");
        } else {
            console.error("[Migration] Error Type: Unknown - full error:", error);
        }

        process.exit(1);
    }
}

main();
