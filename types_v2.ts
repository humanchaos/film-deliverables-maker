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
  startTime: string;  // "00:00:05"
  endTime: string;    // "00:00:12"
  speaker: string;    // "SPEAKER_01"
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
  tcIn: string;       // "00:00:05:00"
  tcOut: string;      // "00:00:12:15"
  duration: string;   // "00:00:07:15"
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
  logline: string;        // One sentence
  summary: string;        // One paragraph
  fullSynopsis: string;   // Full description
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
  localName?: string;     // German name for Terra Mater
  timecode: string;
  category: string;       // "Mammal", "Bird", etc.
  confidence: number;     // 0.0 - 1.0
  behavior?: string;
  iucnStatus?: string;
  thumbnail?: string;
}

export interface FaunaResult {
  sightings: SpeciesSighting[];
  totalSpecies: number;
  categories: Record<string, number>; // { "Mammal": 3, "Bird": 5 }
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
  position?: string;      // "bottom_left", "center", etc.
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
  title: string;          // "Marine Biologist", "Narrator"
  biography: string;
  firstAppearance: string; // Timecode
  isIdentified: boolean;  // True if real name, false if "Man in Blue Shirt"
  sources?: string[];     // URLs for grounded bios
}

export interface CastResult {
  people: Person[];
  totalPeople: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO METADATA
// ═══════════════════════════════════════════════════════════════════════════

export interface VideoMetadata {
  duration: number;       // Seconds
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

// ═══════════════════════════════════════════════════════════════════════════
// API TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateJobRequest {
  gcsUri: string;
  mimeType: string;
  duration: number;
  fileName: string;
  geminiFileUri?: string; // Optional: If provided, backend skips re-upload
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
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
