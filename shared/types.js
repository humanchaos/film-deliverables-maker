/**
 * Shared Types for Gemini Video Analyzer v2
 * Single source of truth for all type definitions
 */
export const DEFAULT_SYNOPSIS_CONFIG = {
    titleMaxChars: 60,
    loglineMaxWords: 30,
    summaryMaxWords: 100,
    language: 'English'
};
export const DEFAULT_FAUNA_CONFIG = {
    primaryLanguage: 'English',
    secondaryLanguage: 'German'
};
// ═══════════════════════════════════════════════════════════════════════════
// ERROR CODES
// ═══════════════════════════════════════════════════════════════════════════
export const ErrorCodes = {
    // Upload errors
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
    UPLOAD_FAILED: 'UPLOAD_FAILED',
    // Processing errors
    GEMINI_UPLOAD_FAILED: 'GEMINI_UPLOAD_FAILED',
    GEMINI_PROCESSING_FAILED: 'GEMINI_PROCESSING_FAILED',
    VIDEO_INTELLIGENCE_FAILED: 'VIDEO_INTELLIGENCE_FAILED',
    // Module errors
    TRANSCRIPTION_FAILED: 'TRANSCRIPTION_FAILED',
    SHOT_DETECTION_FAILED: 'SHOT_DETECTION_FAILED',
    SYNOPSIS_FAILED: 'SYNOPSIS_FAILED',
    FAUNA_FAILED: 'FAUNA_FAILED',
    GRAPHICS_FAILED: 'GRAPHICS_FAILED',
    CAST_FAILED: 'CAST_FAILED',
    // General errors
    JOB_NOT_FOUND: 'JOB_NOT_FOUND',
    TIMEOUT: 'TIMEOUT',
    CANCELLED: 'CANCELLED',
    UNKNOWN: 'UNKNOWN'
};
//# sourceMappingURL=types.js.map