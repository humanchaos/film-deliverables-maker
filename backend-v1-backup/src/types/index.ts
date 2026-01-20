import { Timestamp } from 'firebase-admin/firestore';

export interface ModuleStatus {
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
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
    transcoderJobName?: string; // Job name from Google Cloud Transcoder API
    geminiFileUri?: string; // Cached Gemini Files API URI for the uploaded video
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

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS HOST TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnalysisResult {
    summary: string;
    events: {
        timestamp: string;
        description: string;
    }[];
    inferred_dialogue: string;
    transcription: string; // The "AI Analysis" inferred transcription
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

export interface Bio {
    name: string;
    fullName: string;
    title: string;
    biography: string;
    isLoading?: boolean;
    error?: string;
    sources?: string[];
}

export interface GraphicsAnalysisResult {
    programTitle: string;
    runtime: string;
    graphics: GraphicLogEntry[];
    lowerThirds: LowerThirdEntry[];
}

export interface GraphicLogEntry {
    description: string;
    timecodeIn: string;
    timecodeOut: string;
    cleanTimecodeIn?: string;
    cleanTimecodeOut?: string;
    thumbnail?: string;
}

export interface LowerThirdEntry {
    text: string;
    timecodeIn: string;
    timecodeOut: string;
    thumbnail?: string;
}

export interface SpeciesSighting {
    id: string; // generated ID
    commonName: string;
    latinName: string;
    germanName?: string;
    timecode: string;
    category?: string;
    confidence?: number;
    thumbnail?: string;
    behavior?: string;
    iucnStatus?: string;
    encounterGroup?: string;
}

export interface TranscriptionSegment {
    startTime: string;
    endTime: string;
    speaker: string;
    transcript: string;
    isOnScreen?: boolean;
}

export interface TranscriptionResult {
    segments: TranscriptionSegment[];
    speakerMap: Record<string, string>;
    text?: string;
}

export interface Shot {
    nr: number;
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
    videoUrl: string;
    frameRate: number;
}

export interface FullAnalysisResult {
    shotList: Omit<Shot, 'nr' | 'thumbnail'>[];
    transcription: TranscriptionResult;
    graphics: GraphicsAnalysisResult;
    synopsis: Synopsis;
    bio: Bio[];
    cast: Bio[];  // Same as bio, but keyed by module name for worker.ts
    fauna: SpeciesSighting[];
}

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

    audioCodec?: string;
    colorSpace?: string;
}

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

