/**
 * Shared Types for Gemini Video Analyzer v2
 * Single source of truth for all type definitions
 */

// ═══════════════════════════════════════════════════════════════════════════
// JOB MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type ModuleStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

export interface ModuleProgress {
    status: ModuleStatus;
    progress: number; // 0-100
    error?: string;
}

export interface JobProgress {
    overall: number; // 0-100
    currentModule: string;
    modules: {
        transcription: ModuleProgress;
        shotList: ModuleProgress;
        synopsis: ModuleProgress;
        fauna: ModuleProgress;
        graphics: ModuleProgress;
        cast: ModuleProgress;
    };
}

export interface AnalysisConfig {
    transcription: boolean;
    shotList: boolean;
    synopsis: boolean;
    fauna: boolean;
    graphics: boolean;
    cast: boolean;
}

export interface JobInput {
    gcsUri: string;
    mimeType: string;
    duration: number;
    fileName: string;
    analysisConfig: AnalysisConfig;
    preferredLanguage?: string;
}

export interface Job {
    id: string;
    userId: string;
    status: JobStatus;
    input: JobInput;
    progress: JobProgress;
    results: AnalysisResults | null;
    error?: { code: string; message: string };
    geminiFileUri?: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYSIS RESULTS
// ═══════════════════════════════════════════════════════════════════════════

export interface AnalysisResults {
    transcription?: TranscriptionResult | ModuleError;
    shotList?: ShotListResult | ModuleError;
    synopsis?: SynopsisResult | ModuleError;
    fauna?: FaunaResult | ModuleError;
    graphics?: GraphicsResult | ModuleError;
    cast?: CastResult | ModuleError;
}

export interface ModuleError {
    error: string;
}

// --- Transcription ---

export interface TranscriptionSegment {
    startTime: string;
    endTime: string;
    speaker: string;
    text: string;
}

export interface TranscriptionResult {
    segments: TranscriptionSegment[];
    fullText: string;
    detectedLanguage?: string;
}

// --- Shot List ---

export interface Shot {
    index: number;
    tcIn: string;
    tcOut: string;
    duration: string;
    description: string;
    action: string;
    audio: string;
    thumbnail?: string;
}

export interface ShotListResult {
    shots: Shot[];
    totalShots: number;
}

// --- Synopsis ---

export interface SynopsisResult {
    title: string;
    logline: string;
    summary: string;
    fullSynopsis: string;
    themes: string;
    targetAudience: string;
}

export interface SynopsisConfig {
    titleMaxChars: number;
    loglineMaxWords: number;
    summaryMaxWords: number;
    language: string;
}

export const DEFAULT_SYNOPSIS_CONFIG: SynopsisConfig = {
    titleMaxChars: 60,
    loglineMaxWords: 30,
    summaryMaxWords: 100,
    language: 'English'
};

// --- Fauna ---

export interface SpeciesSighting {
    id: string;
    commonName: string;
    latinName: string;
    localName?: string;
    timecode: string;
    category: string;
    confidence: number;
    behavior?: string;
    iucnStatus?: string;
    thumbnail?: string;
}

export interface FaunaResult {
    sightings: SpeciesSighting[];
    totalSpecies: number;
    categories: Record<string, number>;
}

export interface FaunaConfig {
    primaryLanguage: string;
    secondaryLanguage: string;
}

export const DEFAULT_FAUNA_CONFIG: FaunaConfig = {
    primaryLanguage: 'English',
    secondaryLanguage: 'German'
};

// --- Graphics ---

export interface GraphicEntry {
    type: 'title' | 'lower_third' | 'graphic' | 'text';
    content: string;
    timecodeIn: string;
    timecodeOut: string;
    position?: string;
}

export interface GraphicsResult {
    entries: GraphicEntry[];
    programTitle?: string;
    runtime: string;
}

// --- Cast/Bio ---

export interface Person {
    id: string;
    name: string;
    fullName?: string;
    title: string;
    biography: string;
    firstAppearance: string;
    isIdentified: boolean;
    sources?: string[];
}

export interface CastResult {
    people: Person[];
    totalPeople: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// API TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateJobRequest {
    gcsUri: string;
    mimeType: string;
    duration: number;
    fileName: string;
    analysisConfig?: Partial<AnalysisConfig>;
    geminiFileUri?: string; // If provided, worker skips re-upload to Gemini
    preferredLanguage?: string; // User-selected output language (e.g., "Mandarin Chinese")
}

export interface CreateJobResponse {
    id: string;
    status: JobStatus;
}

export interface UploadUrlRequest {
    fileName: string;
    mimeType: string;
    fileSize: number;
}

export interface UploadUrlResponse {
    uploadUrl: string;
    gcsUri: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CODES
// ═══════════════════════════════════════════════════════════════════════════

export const ErrorCodes = {
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
    UPLOAD_FAILED: 'UPLOAD_FAILED',
    GEMINI_UPLOAD_FAILED: 'GEMINI_UPLOAD_FAILED',
    GEMINI_PROCESSING_FAILED: 'GEMINI_PROCESSING_FAILED',
    VIDEO_INTELLIGENCE_FAILED: 'VIDEO_INTELLIGENCE_FAILED',
    TRANSCRIPTION_FAILED: 'TRANSCRIPTION_FAILED',
    SHOT_DETECTION_FAILED: 'SHOT_DETECTION_FAILED',
    SYNOPSIS_FAILED: 'SYNOPSIS_FAILED',
    FAUNA_FAILED: 'FAUNA_FAILED',
    GRAPHICS_FAILED: 'GRAPHICS_FAILED',
    CAST_FAILED: 'CAST_FAILED',
    JOB_NOT_FOUND: 'JOB_NOT_FOUND',
    TIMEOUT: 'TIMEOUT',
    CANCELLED: 'CANCELLED',
    UNKNOWN: 'UNKNOWN'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
