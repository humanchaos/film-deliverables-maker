/**
 * Shared Types for Gemini Video Analyzer v2
 * Single source of truth for all type definitions
 */
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ModuleStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
export interface ModuleProgress {
    status: ModuleStatus;
    progress: number;
    error?: string;
}
export interface JobProgress {
    overall: number;
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
}
export interface Job {
    id: string;
    userId: string;
    status: JobStatus;
    input: JobInput;
    progress: JobProgress;
    results: AnalysisResults | null;
    error?: {
        code: string;
        message: string;
    };
    geminiFileUri?: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}
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
export declare const DEFAULT_SYNOPSIS_CONFIG: SynopsisConfig;
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
export declare const DEFAULT_FAUNA_CONFIG: FaunaConfig;
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
export interface VideoMetadata {
    duration: number;
    width: number;
    height: number;
    frameRate: number;
    aspectRatio: string;
    hasAudio: boolean;
    fileSize: number;
    fileName: string;
    mimeType: string;
    codec?: string;
}
export interface CreateJobRequest {
    gcsUri: string;
    mimeType: string;
    duration: number;
    fileName: string;
    analysisConfig?: Partial<AnalysisConfig>;
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
export declare const ErrorCodes: {
    readonly FILE_TOO_LARGE: "FILE_TOO_LARGE";
    readonly UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT";
    readonly UPLOAD_FAILED: "UPLOAD_FAILED";
    readonly GEMINI_UPLOAD_FAILED: "GEMINI_UPLOAD_FAILED";
    readonly GEMINI_PROCESSING_FAILED: "GEMINI_PROCESSING_FAILED";
    readonly VIDEO_INTELLIGENCE_FAILED: "VIDEO_INTELLIGENCE_FAILED";
    readonly TRANSCRIPTION_FAILED: "TRANSCRIPTION_FAILED";
    readonly SHOT_DETECTION_FAILED: "SHOT_DETECTION_FAILED";
    readonly SYNOPSIS_FAILED: "SYNOPSIS_FAILED";
    readonly FAUNA_FAILED: "FAUNA_FAILED";
    readonly GRAPHICS_FAILED: "GRAPHICS_FAILED";
    readonly CAST_FAILED: "CAST_FAILED";
    readonly JOB_NOT_FOUND: "JOB_NOT_FOUND";
    readonly TIMEOUT: "TIMEOUT";
    readonly CANCELLED: "CANCELLED";
    readonly UNKNOWN: "UNKNOWN";
};
export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
//# sourceMappingURL=types.d.ts.map