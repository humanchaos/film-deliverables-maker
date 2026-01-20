/**
 * Gemini Services - Barrel Export
 * Protocol 800 Compliant Module Structure
 */

// Core utilities
export {
    genAI,
    Type,
    repairJson,
    safeJsonParse,
    formatDuration,
    formatTimeSegment,
    createTimeSegments,
    saveCheckpoint,
    loadCheckpoint,
    clearCheckpoint,
    generateJobId,
    createContextCache
} from './geminiCore';

// Types
export type { TimeSegment, CheckpointData } from './geminiCore';

// Analysis modules
export { transcribeVideo } from './transcription';
export { generateSynopsis } from './synopsis';
