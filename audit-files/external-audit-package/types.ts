
// ═══════════════════════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type AnalysisMode = 'synopsis' | 'bio' | 'graphics' | 'fauna' | 'transcribe' | 'shotlist' | 'full_analysis' | 'template_converter' | 'techspecs';

// ... existing code ...

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE CONVERTER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TemplateConverterResult {
  convertedContent: string;
  originalFileName: string;
  targetTemplateName: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP STATE TYPES

export enum AppStatus {
  LANDING = 'landing', // New: Cloud connection required
  LANGUAGE_SELECT = 'language_select', // New: Language selection
  UPLOAD = 'upload',
  UPLOADING = 'uploading',
  PREPARING_VIDEO = 'preparing_video',
  MODE_SELECT = 'mode_select',
  PROCESSING = 'processing',
  RESULTS = 'results',
  HISTORY = 'history', // New status for viewing saved analyses
  PROJECT_SETTINGS = 'project_settings', // New status for project metadata settings
  DEBUG_SCENE = 'debug_scene', // New status for WASM Scene Detector Debugging
  MODEL_ROUTER_SETTINGS = 'model_router_settings',
  SEMANTIC_SEARCH = 'semantic_search',
}


// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface UploadProgress {
  phase: 'initializing' | 'uploading' | 'processing' | 'complete' | 'error';
  message: string;
  percentage: number;
  bytesUploaded: number;
  totalBytes: number;
  currentChunk?: number;
  totalChunks?: number;
}

export interface SavedAnalysis {
  id?: number;
  type: AnalysisMode;
  fileName: string;
  date: string;
  timestamp: number;
  data: any; // The specific result type (Synopsis, ShotListResult, etc.)
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNOPSIS TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnalysisResult {
  summary: string;
  events: {
    timestamp: string;
    description: string;
  }[];
  inferred_dialogue: string;
  transcription: string;
}

export interface PartialAnalysisResult {
  summary: string;
  key_events_and_observations: string[];
}

export interface Synopsis {
  title: string;
  writtenBy: string;
  directedBy: string;
  oneLine: string;
  paragraph: string;
  fullSynopsis: string;
  keyThemes: string;
  targetAudience: string;
}

export interface SynopsisConfig {
  titleMaxChars: number;
  loglineMaxWords: number;
  summaryMaxWords: number;
  keyThemesMaxWords: number;
  targetAudienceMaxWords: number;
  writer?: string;
  director?: string;
  keywords?: string;
  language?: string;
  fileName?: string;
}

export const DEFAULT_SYNOPSIS_CONFIG: SynopsisConfig = {
  titleMaxChars: 80,
  loglineMaxWords: 25,
  summaryMaxWords: 150,
  keyThemesMaxWords: 50,
  targetAudienceMaxWords: 40,
};

// ═══════════════════════════════════════════════════════════════════════════════
// BIO TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface BioConfig {
  maxBios: number;
  includeTitles: boolean;
  talents?: string; // Comma separated names or just 'talents'
  names?: string[]; // Alternative if array is used
  talentDetails?: { name: string; context: string }[];
  language?: string;
  autoDetect?: boolean;
}

export const DEFAULT_BIO_CONFIG: BioConfig = {
  maxBios: 5,
  includeTitles: true,
  talents: '',
  language: 'English',
  autoDetect: true
};

export interface Bio {
  name: string;
  fullName: string;
  title: string;
  biography: string;
  isLoading?: boolean;
  error?: string;
  sources?: string[]; // URLs used for grounding
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPHICS & LOWER THIRDS TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface GraphicsConfig {
  detectLowerThirds: boolean;
  detectFullScreens: boolean;
  ocrEnabled: boolean;
  videoDuration?: number;
  videoFileName?: string;
}

export const DEFAULT_GRAPHICS_CONFIG: GraphicsConfig = {
  detectLowerThirds: true,
  detectFullScreens: true,
  ocrEnabled: true,
};

// TRANSCRIPTION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TranscriptionSegment {
  startTime: string;
  endTime: string;
  speaker: string;
  transcript: string;
  isOnScreen?: boolean; // New field for Script Format
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  speakerMap: Record<string, string>; // Maps "SPEAKER_00" to an editable name
  text?: string; // Full text for analysis context
}

// ═══════════════════════════════════════════════════════════════════════════════


export interface ShotListConfig {
  detectScenes: boolean;
  detectSpokenLanguage: boolean;
  format: 'csv' | 'json' | 'pdf';
  includeTimecode: boolean;
  includeDescription: boolean;
  includeCameraAngle: boolean;
  language?: string;
  frameRate?: number;
  videoPreviewUrl?: string;
}

export const DEFAULT_SHOTLIST_CONFIG: ShotListConfig = {
  detectScenes: true,
  detectSpokenLanguage: true,
  format: 'csv',
  includeTimecode: true,
  includeDescription: true,
  includeCameraAngle: true
};

export interface Shot {
  nr: number;
  tcIn: string;
  tcOut: string;
  duration: string;
  description: string;
  action: string;
  audio: string;
  thumbnail?: string; // base64 data URL
}

export interface PhotoAnalysisResult {
  description: string;
  action: string;
  audio: string;
}

export interface ShotListResult {
  shots: Shot[];
  videoUrl: string; // The object URL of the video file for preview
  frameRate: number; // The frame rate used for timecode calculations
}


// ═══════════════════════════════════════════════════════════════════════════════
// JOB TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Job<T> {
  status: 'idle' | 'configuring' | 'processing' | 'results';
  progressMessage: string;
  progressPercentage: number;
  result: T | null;
  abortController: AbortController | null;
}

export type AllJobs = {
  synopsis: Job<Synopsis>;
  bio: Job<Bio[]>;
  graphics: Job<GraphicsAnalysisResult>;
  fauna: Job<SpeciesSighting[]>;
  transcribe: Job<TranscriptionResult>;
  shotlist: Job<ShotListResult>;

  full_analysis: Job<FullAnalysisResult>;
  template_converter: Job<TemplateConverterResult>;
  techspecs: Job<VideoMetadata>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// METADATA & EXPORT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  aspectRatio: string;
  hasAudio: boolean;
  hasVideo: boolean;
  fileSize: number;
  fileName: string;
  mimeType: string;
  codec?: string;
  format?: string;
  audioCodec?: string; // e.g. aac, mp3
  colorSpace?: string; // e.g. bt709
}

export type ExportTemplate = 'PBS' | 'BBC' | 'ARTE' | 'ZDF' | 'FranceTV' | 'ORF' | 'Generic' | 'Custom';
export type ExportFormat = 'docx' | 'pdf' | 'json';

export interface ExportConfig {
  template: ExportTemplate;
  format: ExportFormat;
  includeTimecode: boolean; // default true
  includeThumbnails: boolean; // default true
  useDropFrame: boolean; // default false
  customHeader?: ProjectMetadata;
}

export interface ProjectMetadata {
  productionCompany: string;
  seriesTitle: string;
  episodeTitle: string;
  episodeNumber: string;
  director: string;
  producer: string;
  editor: string;
  date: string; // ISO date string or custom string
  exportTemplate?: ExportTemplate; // New: Selected export style
  timecodeStart: string; // New: Offset (e.g., 01:00:00:00)
  outputLanguage?: string; // Per-project output language (null = auto-detect from video)
}

export const DEFAULT_PROJECT_METADATA: ProjectMetadata = {
  productionCompany: '',
  seriesTitle: '',
  episodeTitle: '',
  episodeNumber: '',
  director: '',
  producer: '',
  editor: '',
  date: new Date().toISOString().split('T')[0],
  timecodeStart: '00:00:00:00',
  outputLanguage: undefined, // Auto-detect by default
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const MAX_FILE_SIZE_MB = 20480; // 20 GB (Updated Gemini API Limit)
export const MAX_PRO_FILE_SIZE_MB = 5 * 1024 * 1024; // 5 TB (Google Cloud Storage Limit)
export const MAX_FILE_SIZE_BYTES = MAX_PRO_FILE_SIZE_MB * 1024 * 1024; // Check logic logic handles the specific limit based on mode
export const SUPPORTED_VIDEO_FORMATS = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/mov',
  'video/webm',
  'video/x-matroska'
];
export const MAX_VIDEO_DURATION_SECONDS = 7200;

export const MAX_FRAMES_SHORT_VIDEO = 100;
export const MAX_FRAMES_LONG_VIDEO = 200;

// ═══════════════════════════════════════════════════════════════════════════════
// UI MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

export const PROGRESS_MESSAGES = {
  UPLOADING: 'Uploading file to AI Workspace...',
  PREPARING_VIDEO: 'Preparing video preview...',
  EXTRACTING: 'Preparing analysis context...',
  ANALYZING: 'Analyzing video content with AI...',
  IDENTIFYING_TALENT: 'Identifying talent in video...',
  GENERATING_SYNOPSIS: 'Generating creative synopsis...',
  GENERATING_BIOS: 'Generating biographies...',
  TRANSCRIBING: 'Transcribing audio... This may take a while.',
  GENERATING_SHOTLIST: 'Generating shot list... Analyzing scenes.',
  DEFAULT: 'Processing your video... This may take a few moments.',
};

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

export const ERROR_IDS = {
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TOO_LARGE_FOR_TRANSCRIPTION: 'FILE_TOO_LARGE_FOR_TRANSCRIPTION',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  NO_FRAMES: 'NO_FRAMES',
  EXTRACTION_TIMEOUT: 'EXTRACTION_TIMEOUT',
  VIDEO_LOAD_FAIL: 'VIDEO_LOAD_FAIL',
  VIDEO_TOO_LONG: 'VIDEO_TOO_LONG',
  AUDIO_EXTRACTION_FAIL: 'AUDIO_EXTRACTION_FAIL',
  ANALYSIS_FAIL: 'ANALYSIS_FAIL',
  INVALID_API_RESPONSE: 'INVALID_API_RESPONSE',
  SYNOPSIS_FAIL: 'SYNOPSIS_FAIL',
  BIO_FAIL: 'BIO_FAIL',
  NO_TALENT_FOUND: 'NO_TALENT_FOUND',
  TRANSCRIPTION_FAIL: 'TRANSCRIPTION_FAIL',
  SHOTLIST_FAIL: 'SHOTLIST_FAIL',
  SCENE_DETECTION_FAIL: 'SCENE_DETECTION_FAIL',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',
  UPLOAD_FAIL: 'UPLOAD_FAIL',
  UNKNOWN: 'UNKNOWN',
};

export const ERROR_MESSAGES: Record<string, string> = {
  [ERROR_IDS.FILE_TOO_LARGE]: `File is too large. Please select a file smaller than ${MAX_FILE_SIZE_MB / 1024}GB.`,
  [ERROR_IDS.FILE_TOO_LARGE_FOR_TRANSCRIPTION]: 'File is too large for in-browser transcription. Please use a file smaller than 200MB.',
  [ERROR_IDS.UNSUPPORTED_FORMAT]: 'Unsupported file format. Please use MP4, MOV, AVI, WebM, or MKV.',
  [ERROR_IDS.NO_FRAMES]: 'Could not extract any frames. The file might be corrupted or in an unsupported format.',
  [ERROR_IDS.EXTRACTION_TIMEOUT]: 'Frame extraction timed out. The video may be too long or complex for in-browser processing.',
  [ERROR_IDS.VIDEO_LOAD_FAIL]: 'Failed to load video file. It might be corrupt or in an unsupported format.',
  [ERROR_IDS.AUDIO_EXTRACTION_FAIL]: 'Could not extract audio from the file. The file may be silent, corrupt, or use an unsupported audio codec.',
  [ERROR_IDS.ANALYSIS_FAIL]: 'Failed to analyze video content with the AI model.',
  [ERROR_IDS.INVALID_API_RESPONSE]: 'The AI model returned an invalid or empty response. This could be due to content safety filters or a temporary issue. Please try again.',
  [ERROR_IDS.SYNOPSIS_FAIL]: 'Failed to generate a synopsis with the AI model.',
  [ERROR_IDS.BIO_FAIL]: 'Failed to generate biographies with the AI model.',
  [ERROR_IDS.NO_TALENT_FOUND]: 'No on-screen talent with lower thirds was detected in the video. Please enter names manually or check if your video contains visible name captions.',
  [ERROR_IDS.VIDEO_TOO_LONG]: `Video is too long.`,
  [ERROR_IDS.TRANSCRIPTION_FAIL]: 'Failed to transcribe the media file with the AI model.',
  [ERROR_IDS.SHOTLIST_FAIL]: 'Failed to generate a shot list with the AI model.',
  [ERROR_IDS.SCENE_DETECTION_FAIL]: 'Failed to detect scenes in the video. The file might be too short or complex.',
  [ERROR_IDS.OPERATION_CANCELLED]: 'The operation was cancelled.',
  [ERROR_IDS.UPLOAD_FAIL]: 'Failed to upload file to AI Workspace. Please check your internet connection and API Key.',
  [ERROR_IDS.UNKNOWN]: 'An unknown error occurred. Please try again.',
};

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPHICS & LOWER THIRDS TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface GraphicLogEntry {
  description: string;
  timecodeIn: string;
  timecodeOut: string;
  cleanTimecodeIn?: string;
  cleanTimecodeOut?: string;
  thumbnail?: string; // base64 data URL
}

export interface LowerThirdEntry {
  text: string;
  timecodeIn: string;
  timecodeOut: string;
  thumbnail?: string; // base64 data URL
}

export interface GraphicsAnalysisResult {
  programTitle: string;
  runtime: string;
  graphics: GraphicLogEntry[];
  lowerThirds: LowerThirdEntry[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// FAUNA FINDER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SpeciesSighting {
  id: string;
  commonName: string;
  latinName: string;
  germanName?: string;
  timecode: string;
  category?: string;
  confidence?: number;
  thumbnail?: string; // base64 data URL
  behavior?: string; // e.g. Feeding, Resting
  iucnStatus?: string; // e.g. LC, VU, EN
  encounterGroup?: string; // Grouping ID
}

export interface ExtractedFrame {
  frameData: string;
  timestamp: number;
  timecode: string;
}

export interface FaunaConfig {
  primaryLanguage: string;
  secondaryLanguage: string;
  detectBehavior: boolean;
}

export const DEFAULT_FAUNA_CONFIG: FaunaConfig = {
  primaryLanguage: 'English',
  secondaryLanguage: 'German',
  detectBehavior: true,
};


// FULL ANALYSIS TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface FullAnalysisResult {
  shotList: Omit<Shot, 'nr' | 'thumbnail'>[];
  transcription: TranscriptionResult;
  graphics: GraphicsAnalysisResult;
  synopsis: Synopsis;
  bio: Bio[];
  fauna: SpeciesSighting[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP STATE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface AppState {
  appStatus: AppStatus;
  videoFile: File | null;
  videoMetadata: VideoMetadata | null;
  uploadProgress: UploadProgress | null;
  geminiFileUri: string | null;
  videoPreviewUrl: string | null;
  analysisMode: AnalysisMode;
  analysisResults: Record<AnalysisMode, any>;
  savedAnalyses: SavedAnalysis[];
  isProcessing: boolean;
  popupError: string | null;
  uploadAbortController: AbortController | null;
  analysisAbortController: AbortController | null;
  semanticIndexing: { status: 'idle' | 'indexing' | 'indexed'; progress: number };
  projectMetadata: ProjectMetadata; // Global project metadata
  gcsAccessToken?: string; // OAuth token for "Zero Hallucination" uploads
  gcsUserEmail?: string; // Email of the connected Google user
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACKEND API TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Timestamp {
  seconds: number;
  nanoseconds: number;
}

export interface ModuleStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

export interface JobDocument {
  id: string; // Document ID
  userId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  startedAt?: Timestamp; // Optional, set when processing starts
  hasSubcollections?: boolean; // Flag to indicate if results are stored in subcollections
  status: 'queued' | 'processing' | 'completed' | 'failed';
  input: {
    gcsUri: string;
    mimeType: string;
    duration: number;
    analysisConfig: Record<string, boolean>;
  };
  progress: {
    overall: number;
    currentStage: string;
    modules: {
      fauna: ModuleStatus;
      transcription: ModuleStatus;
      shotList: ModuleStatus;
      synopsis: ModuleStatus;
      graphics: ModuleStatus;
      cast: ModuleStatus;
    };
  };
  results: Record<string, unknown>; // Flexible structure for varied results
  error?: { code: string; message: string };

  // Detailed Analysis Results (Mapped from Frontend)
  analysisResults?: {
    synopsis?: Synopsis;
    bio?: Bio[];
    graphics?: GraphicsAnalysisResult;
    fauna?: SpeciesSighting[];
    transcription?: TranscriptionResult;
    shotList?: ShotListResult;
    full_analysis?: FullAnalysisResult;
  };
}
