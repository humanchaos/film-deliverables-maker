import React, { useCallback, useEffect, useReducer, useMemo, lazy, Suspense, useState } from 'react';
import { Settings, HelpCircle, Zap, Search } from 'lucide-react';
import {
  AppStatus,
  AnalysisMode,
  Synopsis,
  Bio,
  SynopsisConfig,
  DEFAULT_SYNOPSIS_CONFIG,
  MAX_FILE_SIZE_MB,
  MAX_PRO_FILE_SIZE_MB,
  SUPPORTED_VIDEO_FORMATS,
  ERROR_IDS,
  ERROR_MESSAGES,
  PROGRESS_MESSAGES,
  GraphicsAnalysisResult,
  SpeciesSighting,
  TranscriptionResult,
  ShotListResult,
  FaunaConfig,
  DEFAULT_FAUNA_CONFIG,
  SavedAnalysis,
  VideoMetadata,
  DEFAULT_BIO_CONFIG,
  DEFAULT_GRAPHICS_CONFIG,
  DEFAULT_SHOTLIST_CONFIG,
  ProjectMetadata,
  DEFAULT_PROJECT_METADATA,
  FullAnalysisResult,
  TemplateConverterResult,
  TranscriptionSegment,
  AllJobs,
  Job,
} from './types';
import { performAnalysis } from './services/analysisCoordinator';
import { uploadFileToGCS } from './services/gcsUploadService';
import { authService } from './services/authService';
import { uploadFileToGemini } from './services/uploadService';
import { dbService } from './services/db';
import { exportAllDeliverables } from './services/batchExportService';
import { extractVideoMetadata } from './utils/videoMetadataExtractor';
// Removed getStoredUploadUri - cached uploads caused issues with expired Gemini URIs

// Lazy load components for better initial load performance
const FileUploadView = lazy(() => import('./components/FileUploadView'));
const ModeSelectView = lazy(() => import('./components/ModeSelectView'));
const SynopsisInputView = lazy(() => import('./components/SynopsisInputView'));
const BioInputView = lazy(() => import('./components/BioInputView'));
const GraphicsInputView = lazy(() => import('./components/GraphicsInputView'));
const FaunaInputView = lazy(() => import('./components/FaunaInputView'));
const TranscriptionInputView = lazy(() => import('./components/TranscriptionInputView'));
const ShotListInputView = lazy(() => import('./components/ShotListInputView'));
const ProcessingView = lazy(() => import('./components/ProcessingView'));
const SynopsisResultView = lazy(() => import('./components/SynopsisResultView'));
const BioResultView = lazy(() => import('./components/BioResultView'));
const GraphicsResultView = lazy(() => import('./components/GraphicsResultView'));
const FaunaResultView = lazy(() => import('./components/FaunaResultView'));
const TranscriptionResultView = lazy(() => import('./components/TranscriptionResultView'));
const ShotListResultView = lazy(() => import('./components/ShotListResultView'));
const FullAnalysisResultView = lazy(() => import('./components/FullAnalysisResultView'));
const TemplateConverterInputView = lazy(() => import('./components/TemplateConverterInputView'));
const TemplateConverterResultView = lazy(() => import('./components/TemplateConverterResultView'));
const TechSpecsView = lazy(() => import('./components/TechSpecsView'));
const ErrorPopup = lazy(() => import('./components/ErrorPopup'));
const HistoryView = lazy(() => import('./components/HistoryView'));
const FeedbackModal = lazy(() => import('./components/FeedbackModal'));
const OnboardingGuide = lazy(() => import('./components/OnboardingGuide'));

const ProjectMetadataView = lazy(() => import('./components/ProjectMetadataView'));
const SceneDetectorDebugView = lazy(() => import('./components/SceneDetectorDebugView'));
const ModelRouterSettings = lazy(() => import('./components/ModelRouterSettings').then(module => ({ default: module.ModelRouterSettings })));
const SemanticSearchView = lazy(() => import('./components/SemanticSearchView').then(module => ({ default: module.SemanticSearchView })));

// LandingPage and LanguageSelection removed - now using unified FileUploadView with inline selectors

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════


interface AppState {
  appStatus: AppStatus;
  selectedMode: AnalysisMode | null;
  videoFile: File | null;
  videoPreviewUrl: string | null;
  geminiFileUri: string | null;
  popupErrorMessage: string | null;
  jobs: AllJobs;
  synopsisConfig: SynopsisConfig;
  faunaConfig: FaunaConfig;
  videoMetadata: VideoMetadata | null;
  videoBufferProgress: number;
  uploadProgress: number;
  uploadMessage: string; // New state for dynamic upload messages
  uploadAbortController: AbortController | null; // For cancelling large file uploads
  projectMetadata: ProjectMetadata; // Global project metadata
  gcsAccessToken?: string;
  gcsUserEmail?: string;
  gcsProjectId?: string;
  useProMode: boolean; // Toggle for Zero Hallucination
  semanticIndexing: { status: 'idle' | 'indexing' | 'indexed'; progress: number };
  isConnecting: boolean; // Cloud connection in progress
}

type AppAction =
  | { type: 'SET_STATUS'; payload: AppStatus }
  | { type: 'SELECT_MODE'; payload: AnalysisMode }
  | { type: 'DESELECT_MODE' }
  | { type: 'SET_VIDEO'; payload: { file: File; url: string } }
  | { type: 'SET_GEMINI_FILE_URI'; payload: string }
  | { type: 'SET_VIDEO_METADATA'; payload: VideoMetadata }
  | { type: 'SET_VIDEO_BUFFER_PROGRESS'; payload: number }
  | { type: 'SET_UPLOAD_PROGRESS'; payload: { percentage: number; message?: string } }
  | { type: 'SET_UPLOAD_ABORT_CONTROLLER'; payload: AbortController | null }
  | { type: 'SET_POPUP_ERROR'; payload: string | null }
  | { type: 'UPDATE_JOB'; payload: { mode: AnalysisMode; updates: Partial<Job<any>> } }
  | { type: 'UPDATE_SYNOPSIS_CONFIG'; payload: Partial<SynopsisConfig> }
  | { type: 'UPDATE_FAUNA_CONFIG'; payload: Partial<FaunaConfig> }
  | { type: 'UPDATE_SPEAKER'; payload: { speakerId: string; newName: string } }
  | { type: 'UPDATE_TRANSCRIPTION_SEGMENT'; payload: { index: number; updates: Partial<TranscriptionSegment> } }
  | { type: 'UPDATE_PROJECT_METADATA'; payload: ProjectMetadata }
  | { type: 'SET_GCS_ACCESS_TOKEN'; payload: string }
  | { type: 'SET_GCS_PROJECT_ID'; payload: string }
  | { type: 'SET_GCS_PROJECT_ID'; payload: string }
  | { type: 'SET_USE_PRO_MODE'; payload: boolean }
  | { type: 'SET_GOOGLE_USER'; payload: { email: string; token: string } }
  | { type: 'DISCONNECT_GOOGLE_USER' }
  | { type: 'RESET_ALL' }
  | { type: 'UPDATE_SEMANTIC_INDEXING'; payload: { status: 'idle' | 'indexing' | 'indexed'; progress: number } }
  | { type: 'SET_IS_CONNECTING'; payload: boolean }
  | { type: 'LOAD_SAVED_ANALYSIS'; payload: SavedAnalysis }
  | { type: 'APPEND_JOB_RESULT'; payload: { mode: AnalysisMode; data: any[] } };

// ═══════════════════════════════════════════════════════════════════════════════
// REDUCER & INITIAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

const initialJobState: Job<any> = {
  status: 'idle',
  progressMessage: PROGRESS_MESSAGES.DEFAULT,
  progressPercentage: 0,
  result: null,
  abortController: null,
};

const initialJobs: AllJobs = {
  synopsis: { ...initialJobState },
  bio: { ...initialJobState },
  graphics: { ...initialJobState },
  fauna: { ...initialJobState },
  transcribe: { ...initialJobState },
  shotlist: { ...initialJobState },

  full_analysis: { ...initialJobState },
  template_converter: { ...initialJobState },
  techspecs: { ...initialJobState },
};

// Determine initial app status based on onboarding state
// Every refresh brings user back to start - clear language selection
function getInitialAppStatus(): AppStatus {
  // Clear language selection on every refresh for fresh start experience
  localStorage.removeItem('menuLanguage');

  const hasCloudConnection = localStorage.getItem('cloudConnected') === 'true' ||
    localStorage.getItem('cloudConnected') === 'demo' ||
    !!(authService.getAccessToken() || localStorage.getItem('gcsAccessToken'));

  // If not logged in → show cloud connect button
  if (!hasCloudConnection) {
    return AppStatus.LANDING;
  }
  // If logged in → always show language selector (since we cleared it above)
  return AppStatus.LANGUAGE_SELECT;
}

const initialState: AppState = {
  appStatus: getInitialAppStatus(),
  selectedMode: null,
  videoFile: null,
  videoPreviewUrl: null,
  geminiFileUri: null,
  popupErrorMessage: null,
  jobs: initialJobs,
  synopsisConfig: DEFAULT_SYNOPSIS_CONFIG,
  faunaConfig: DEFAULT_FAUNA_CONFIG,
  videoMetadata: null,
  videoBufferProgress: 0,
  uploadProgress: 0,
  uploadMessage: PROGRESS_MESSAGES.UPLOADING,
  uploadAbortController: null,
  projectMetadata: DEFAULT_PROJECT_METADATA,
  // Restore persistence for GCS Token and Pro Mode
  gcsAccessToken: authService.getAccessToken() || localStorage.getItem('gcsAccessToken') || undefined,
  gcsUserEmail: authService.getUserEmail() || undefined,
  // Ignore "gemini-super-app" if it exists in localStorage (legacy default)
  gcsProjectId: (localStorage.getItem('gcsProjectId') && localStorage.getItem('gcsProjectId') !== 'gemini-super-app')
    ? localStorage.getItem('gcsProjectId')!
    : (import.meta.env.VITE_GOOGLE_CLOUD_PROJECT_ID || 'gen-lang-client-0431510360'),
  // Restore Pro Mode preference
  useProMode: localStorage.getItem('useProMode') === 'true',
  semanticIndexing: { status: 'idle', progress: 0 },
  isConnecting: false,
};


function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, appStatus: action.payload };

    case 'SELECT_MODE':
      return {
        ...state,
        selectedMode: action.payload,
        jobs: {
          ...state.jobs,
          [action.payload]: {
            ...state.jobs[action.payload],
            status: state.jobs[action.payload].status === 'idle' ? 'configuring' : state.jobs[action.payload].status,
          },
        },
      };

    case 'DESELECT_MODE':
      return {
        ...state,
        selectedMode: null,
        jobs: state.selectedMode
          ? {
            ...state.jobs,
            [state.selectedMode]: {
              ...state.jobs[state.selectedMode],
              status: state.jobs[state.selectedMode].status === 'configuring' ? 'idle' : state.jobs[state.selectedMode].status,
            },
          }
          : state.jobs,
      };

    case 'SET_VIDEO':
      return {
        ...state,
        videoFile: action.payload.file,
        videoPreviewUrl: action.payload.url,
        videoMetadata: null,
        appStatus: AppStatus.UPLOADING,
        popupErrorMessage: null,
        videoBufferProgress: 0,
        uploadProgress: 0,
        uploadMessage: PROGRESS_MESSAGES.UPLOADING,
      };

    case 'SET_GEMINI_FILE_URI':
      return { ...state, geminiFileUri: action.payload };

    case 'SET_VIDEO_METADATA':
      return { ...state, videoMetadata: action.payload };

    case 'SET_VIDEO_BUFFER_PROGRESS':
      return { ...state, videoBufferProgress: action.payload };

    case 'SET_UPLOAD_PROGRESS':
      return {
        ...state,
        uploadProgress: action.payload.percentage,
        uploadMessage: action.payload.message || state.uploadMessage
      };

    case 'SET_UPLOAD_ABORT_CONTROLLER':
      return { ...state, uploadAbortController: action.payload };

    case 'SET_POPUP_ERROR':
      return { ...state, popupErrorMessage: action.payload };

    case 'UPDATE_JOB':
      return {
        ...state,
        jobs: {
          ...state.jobs,
          [action.payload.mode]: {
            ...state.jobs[action.payload.mode],
            ...action.payload.updates,
          },
        },
      };

    case 'APPEND_JOB_RESULT':
      const { mode, data } = action.payload;

      if (mode === 'fauna') {
        const currentResult = state.jobs.fauna.result || [];
        const newResult = Array.isArray(currentResult) ? [...currentResult, ...data] : [...data];
        return {
          ...state,
          jobs: {
            ...state.jobs,
            fauna: { ...state.jobs.fauna, result: newResult, status: 'processing' }
          }
        };
      }

      if (mode === 'bio') {
        const currentResult = state.jobs.bio.result || [];
        const newResult = Array.isArray(currentResult) ? [...currentResult, ...data] : [...data];
        return {
          ...state,
          jobs: {
            ...state.jobs,
            bio: { ...state.jobs.bio, result: newResult, status: 'processing' }
          }
        };
      }

      if (mode === 'shotlist') {
        // Shotlist result is an object { shots: [], ... }
        const currentResult = state.jobs.shotlist.result;
        const currentShots = currentResult?.shots || [];
        // Append new shots. 
        // Note: Consumer ensures 'nr' is handled or we rely on index later? 
        // The 'data' payload here is 'Omit<Shot, nr>'. 
        // We might need to assign 'nr' here if the UI relies on it.
        // Let's assign NR based on total length.
        const startNr = currentShots.length + 1;
        const newShotsWithNr = data.map((s: any, i: number) => ({ ...s, nr: startNr + i }));

        const newResult = {
          ...(currentResult || { videoUrl: state.videoPreviewUrl || '', frameRate: 25 }), // Default structure if null
          shots: [...currentShots, ...newShotsWithNr]
        };

        return {
          ...state,
          jobs: {
            ...state.jobs,
            shotlist: { ...state.jobs.shotlist, result: newResult as any, status: 'processing' } // Cast as any to avoid strict checking on partials
          }
        };
      }

      return state;

    case 'SET_GOOGLE_USER':
      return {
        ...state,
        gcsUserEmail: action.payload.email,
        gcsAccessToken: action.payload.token,
        useProMode: true // Auto-enable Pro Mode on successful login
      };

    case 'DISCONNECT_GOOGLE_USER':
      return {
        ...state,
        gcsUserEmail: undefined,
        gcsAccessToken: undefined,
        useProMode: false
      };

    case 'UPDATE_PROJECT_METADATA':
      return { ...state, projectMetadata: action.payload };

    case 'SET_GCS_ACCESS_TOKEN':
      if (action.payload) {
        localStorage.setItem('gcsAccessToken', action.payload);
      } else {
        localStorage.removeItem('gcsAccessToken');
      }
      return { ...state, gcsAccessToken: action.payload };

    case 'SET_GCS_PROJECT_ID':
      if (action.payload) {
        localStorage.setItem('gcsProjectId', action.payload);
      } else {
        localStorage.removeItem('gcsProjectId');
      }
      return { ...state, gcsProjectId: action.payload };

    case 'SET_USE_PRO_MODE':
      localStorage.setItem('useProMode', String(action.payload));
      return { ...state, useProMode: action.payload };

    case 'UPDATE_SYNOPSIS_CONFIG':
      return { ...state, synopsisConfig: { ...state.synopsisConfig, ...action.payload } };

    case 'UPDATE_FAUNA_CONFIG':
      return { ...state, faunaConfig: { ...state.faunaConfig, ...action.payload } };

    case 'SET_IS_CONNECTING':
      return { ...state, isConnecting: action.payload };

    case 'UPDATE_SPEAKER':
      if (!state.jobs.transcribe.result) return state;
      return {
        ...state,
        jobs: {
          ...state.jobs,
          transcribe: {
            ...state.jobs.transcribe,
            result: {
              ...state.jobs.transcribe.result,
              speakerMap: {
                ...state.jobs.transcribe.result.speakerMap,
                [action.payload.speakerId]: action.payload.newName,
              },
            },
          },
        },
      };

    case 'RESET_ALL':
      Object.values(state.jobs).forEach(job => job.abortController?.abort());
      state.uploadAbortController?.abort(); // Cancel any in-progress upload
      if (state.videoPreviewUrl) URL.revokeObjectURL(state.videoPreviewUrl);
      return { ...initialState };

    case 'LOAD_SAVED_ANALYSIS':
      return {
        ...state,
        appStatus: AppStatus.RESULTS,
        selectedMode: action.payload.type,
        videoFile: state.videoFile || new File([], action.payload.fileName),
        jobs: {
          ...state.jobs,
          [action.payload.type]: {
            ...state.jobs[action.payload.type],
            status: 'results',
            result: action.payload.data,
            progressPercentage: 100
          }
        }
      };

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const App: React.FC = () => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [showFeedback, setShowFeedback] = useState(false);
  const [forceShowOnboarding, setForceShowOnboarding] = useState(false);

  // Listen for custom feedback event (hack for ModeSelectView button)
  useEffect(() => {
    const handleOpenFeedback = () => setShowFeedback(true);
    window.addEventListener('openFeedback', handleOpenFeedback);
    return () => window.removeEventListener('openFeedback', handleOpenFeedback);
  }, []);

  // Restore Google Auth Session (if email/token are available from authService)
  useEffect(() => {
    const email = authService.getUserEmail();
    const token = authService.getAccessToken();
    if (email && token) {
      dispatch({
        type: 'SET_GOOGLE_USER',
        payload: { email, token }
      });
    }
  }, []);

  // Video Metadata Loading
  useEffect(() => {
    let cancelled = false;

    if (state.appStatus !== AppStatus.PREPARING_VIDEO || !state.videoFile) {
      return;
    }

    const loadMetadata = async () => {
      // Cloud File Bypass (Manual gs:// URI)
      if (state.videoFile!.size === 0 && state.geminiFileUri) {
        dispatch({
          type: 'SET_VIDEO_METADATA',
          payload: {
            duration: 0,
            width: 0,
            height: 0,
            format: 'cloud',
            frameRate: 24,
            aspectRatio: '16:9',
            hasAudio: true,
            hasVideo: true,
            fileSize: 0,
            fileName: state.videoFile?.name || 'cloud-file.mp4',
            mimeType: 'video/mp4'
          }
        });
        dispatch({ type: 'SET_VIDEO_BUFFER_PROGRESS', payload: 100 });
        await new Promise(res => setTimeout(res, 300));

        if (!cancelled) {
          // Go to Project Settings first!
          dispatch({ type: 'SET_STATUS', payload: AppStatus.PROJECT_SETTINGS });
        }
        return;
      }

      if (!state.videoPreviewUrl) return;

      try {
        // Use the new robust metadata extractor
        const metadata = await extractVideoMetadata(state.videoFile!);

        if (cancelled) return;

        dispatch({
          type: 'SET_VIDEO_METADATA',
          payload: metadata
        });

        dispatch({ type: 'SET_VIDEO_BUFFER_PROGRESS', payload: 100 });
        await new Promise(res => setTimeout(res, 300));
        if (!cancelled) {
          // Go to Project Settings first!
          dispatch({ type: 'SET_STATUS', payload: AppStatus.PROJECT_SETTINGS });
        }
      } catch (error) {
        console.error("Metadata extraction failed:", error);
        if (!cancelled) {
          // Instead of failing completely, provide default metadata
          // so the user can still proceed with the analysis
          console.warn("Using default metadata fallback for:", state.videoFile?.name);
          const fallbackMetadata = {
            duration: 0, // Unknown - backend will detect
            width: 1920,
            height: 1080,
            format: state.videoFile?.name.split('.').pop()?.toUpperCase() || 'MOV',
            frameRate: 25, // Default PAL
            aspectRatio: '16:9',
            hasAudio: true,
            hasVideo: true,
            fileSize: state.videoFile?.size || 0,
            fileName: state.videoFile?.name || 'video',
            mimeType: state.videoFile?.type || 'video/quicktime'
          };

          dispatch({ type: 'SET_VIDEO_METADATA', payload: fallbackMetadata });
          dispatch({ type: 'SET_VIDEO_BUFFER_PROGRESS', payload: 100 });

          // Show a warning but allow proceeding
          dispatch({
            type: 'SET_POPUP_ERROR',
            payload: 'Video metadata could not be fully extracted. Using default values - analysis will still work.'
          });

          await new Promise(res => setTimeout(res, 300));
          dispatch({ type: 'SET_STATUS', payload: AppStatus.PROJECT_SETTINGS });
        }
      }
    };

    // Auto-detect Pro Mode capability
    // Auto-detect Pro Mode capability
    const bucketName = import.meta.env.VITE_GOOGLE_CLOUD_STORAGE_BUCKET;
    // We only auto-enable if we have a token (from state, which might be populated via settings later)
    if (bucketName && state.gcsAccessToken) {
      console.log('Pro Mode (Zero Hallucination) Enabled via Config');
      dispatch({ type: 'SET_USE_PRO_MODE', payload: true });
    } else if (bucketName) {
      // If bucket exists but no token, we don't automatically disable it if it was previously true (from localStorage)
      // This allows the "Auth Required" UI to show up instead of silently hiding Pro Mode.
      console.log('Pro Mode potential detected (Bucket configured), but no token. Leaving useProMode as-is (likely true from localStorage).');
    }

    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [state.appStatus, state.videoFile, state.videoPreviewUrl]);

  // File Upload Handler - Decoupled from AppStatus to allow background processing
  useEffect(() => {
    // Only start upload if we have a file, no URI yet, and no active upload controller
    if (state.videoFile && !state.geminiFileUri && !state.uploadAbortController) {
      const abortController = new AbortController();
      dispatch({ type: 'SET_UPLOAD_ABORT_CONTROLLER', payload: abortController });

      const uploadFile = async () => {
        try {
          let uri: string = '';
          const bucketName = import.meta.env.VITE_GOOGLE_CLOUD_STORAGE_BUCKET || 'gemini-deliverables-app';
          console.log(`[Upload Debug]Bucket: ${bucketName}, Token Present: ${!!state.gcsAccessToken}, Pro Mode: ${state.useProMode} `);

          // STRATEGY: Try Zero Hallucination (GCS) First, Fallback to Standard (Gemini)
          // NOTE: Cached upload feature removed - Gemini URIs expire and cause issues with multiple analyses

          if (bucketName && state.gcsAccessToken) {
            try {
              console.log(`Attempting Zero Hallucination Upload to: ${bucketName} `);
              // First upload to GCS for backend storage
              const gcsUri = await uploadFileToGCS({
                file: state.videoFile!,
                bucketName: bucketName,
                apiKey: import.meta.env.VITE_GEMINI_API_KEY,
                accessToken: state.gcsAccessToken,
                onProgress: (p) => {
                  // GCS upload is first 50%
                  dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: { percentage: p.percentage * 0.5, message: p.message } });
                },
                signal: abortController.signal
              });
              console.log(`[Upload] GCS upload complete: ${gcsUri}`);

              // Now also upload to Gemini Files API for analysis (second 50%)
              console.log(`[Upload] Also uploading to Gemini Files API...`);
              uri = await uploadFileToGemini(
                state.videoFile!,
                (msg, pct) => {
                  dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: { percentage: 50 + pct * 0.5, message: `Gemini: ${msg}` } });
                },
                abortController.signal
              );
              console.log(`[Upload] Gemini upload complete: ${uri}`);
            } catch (gcsError: any) {
              const errorMessage = gcsError?.message || String(gcsError);
              const isLargeFile = state.videoFile!.size > (MAX_FILE_SIZE_MB * 1024 * 1024);

              if (errorMessage.includes('401')) {
                console.log("Pro Mode Session Expired (401). clearing invalid token.");
                dispatch({ type: 'SET_GCS_ACCESS_TOKEN', payload: '' });
                dispatch({ type: 'SET_USE_PRO_MODE', payload: false });

                if (isLargeFile) {
                  dispatch({
                    type: 'SET_POPUP_ERROR',
                    payload: "Session Expired: Files larger than 2GB require an active Google Cloud connection. Please go to Settings and update your Access Token."
                  });
                  dispatch({ type: 'SET_STATUS', payload: AppStatus.PROJECT_SETTINGS }); // Send them to settings
                  dispatch({ type: 'SET_UPLOAD_ABORT_CONTROLLER', payload: null });
                  return; // Stop execution, do not fallback
                }

              } else {
                console.error("Pro Mode Upload Error:", errorMessage);
                // BLOCKED: Do not fallback. User wants Pro results.
                dispatch({
                  type: 'SET_POPUP_ERROR',
                  payload: `Pro Mode Verification Failed: ${errorMessage}. Please check your connection or permissions.`
                });
                dispatch({ type: 'SET_UPLOAD_ABORT_CONTROLLER', payload: null });
                return; // Stop execution
              }
            }
          }

          // Fallback: If no URI yet (either no bucket or GCS failed), use Gemini
          if (!uri) {
            console.log('Using Standard AI Upload (Gemini File API)...');
            uri = await uploadFileToGemini(
              state.videoFile!,
              (msg, pct) => {
                dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: { percentage: pct, message: msg } });
              },
              abortController.signal
            );
          }

          dispatch({ type: 'SET_UPLOAD_ABORT_CONTROLLER', payload: null });
          dispatch({ type: 'SET_GEMINI_FILE_URI', payload: uri });
          // If we are still in UPLOADING status, move to PREPARING
          // If we are in background (MODE_SELECT), we stay there but enable buttons (handled by geminiFileUri presence)
          if (state.appStatus === AppStatus.UPLOADING) {
            dispatch({ type: 'SET_STATUS', payload: AppStatus.PREPARING_VIDEO });
          }
        } catch (error) {
          console.error(error);
          dispatch({ type: 'SET_UPLOAD_ABORT_CONTROLLER', payload: null });

          if (error instanceof Error && (error.message === ERROR_IDS.OPERATION_CANCELLED || error.name === 'AbortError')) {
            return;
          }

          dispatch({ type: 'SET_POPUP_ERROR', payload: error instanceof Error ? error.message : ERROR_MESSAGES[ERROR_IDS.UPLOAD_FAIL] });
          // If error occurs in background, we might need a way to show it.
          // For now, if in background, popup error will show on dashboard.
          // If in foreground, reset to UPLOAD screen logic handled by popup.
          if (state.appStatus === AppStatus.UPLOADING) {
            dispatch({ type: 'SET_STATUS', payload: AppStatus.UPLOAD });
          }
        }
      };
      uploadFile();

      return () => {
        // cleanup only if component unmounts
        // Note: We don't want this to run when uploadAbortController updates, hence excluding it from deps
        abortController.abort();
      };
    }
  }, [state.videoFile, state.geminiFileUri]);

  const validateFile = useCallback((file: File): string | null => {
    // P0 Fix: Reject empty files immediately
    if (file.size === 0) {
      return "Cannot upload empty file. Please select a valid video file.";
    }

    // Pro Mode allows up to 5TB (via GCS), Standard is 2GB (via Gemini File API)
    const limit = state.useProMode ? MAX_PRO_FILE_SIZE_MB * 1024 * 1024 : MAX_FILE_SIZE_MB * 1024 * 1024;

    if (file.size > limit) {
      return state.useProMode
        ? ERROR_MESSAGES[ERROR_IDS.FILE_TOO_LARGE]
        : "File too large (Max 2GB). Please enable Pro Mode in Settings for unlimited uploads.";
    }

    if (!SUPPORTED_VIDEO_FORMATS.includes(file.type)) return ERROR_MESSAGES[ERROR_IDS.UNSUPPORTED_FORMAT];
    return null;
  }, [state.useProMode]);

  const handleFileSelect = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      dispatch({ type: 'SET_POPUP_ERROR', payload: error });
      return;
    }
    if (state.videoPreviewUrl) URL.revokeObjectURL(state.videoPreviewUrl);

    const previewUrl = URL.createObjectURL(file);
    dispatch({
      type: 'SET_VIDEO',
      payload: { file, url: previewUrl }
    });

  }, [validateFile, state.videoPreviewUrl]);

  const handleUriSelect = useCallback((uri: string) => {
    // Extract filename from URI
    const fileName = uri.split('/').pop() || 'cloud-video.mp4';
    // Create a dummy file to satisfy type checks
    const dummyFile = new File([""], fileName, { type: 'video/mp4' });

    dispatch({ type: 'SET_GEMINI_FILE_URI', payload: uri });
    dispatch({
      type: 'SET_VIDEO',
      payload: { file: dummyFile, url: '' } // No local preview available
    });
    dispatch({ type: 'SET_STATUS', payload: AppStatus.PREPARING_VIDEO });

  }, []);

  const handleModeSelect = useCallback((mode: AnalysisMode) => {
    if (!state.videoMetadata) {
      console.warn("Attempted to select mode before video metadata was ready.");
      return;
    }
    dispatch({ type: 'SELECT_MODE', payload: mode });
  }, [state.videoMetadata]);

  const handleBackToDashboard = useCallback(() => {
    dispatch({ type: 'DESELECT_MODE' });
    if (!state.videoFile) {
      // If viewing history item without a live file, go back to history list
      dispatch({ type: 'SET_STATUS', payload: AppStatus.HISTORY });
    } else {
      // If we have a file, ensure we go back to the mode selection screen
      dispatch({ type: 'SET_STATUS', payload: AppStatus.MODE_SELECT });
    }
  }, [state.videoFile]);

  const handleBackgroundUpload = useCallback(() => {
    // Switch to Dashboard view but keep upload running (decoupled effect)
    dispatch({ type: 'SET_STATUS', payload: AppStatus.MODE_SELECT });
  }, []);

  const handleSaveAnalysis = useCallback(async (data: any) => {
    if (!state.selectedMode) return;
    try {
      await dbService.saveAnalysis(state.selectedMode, state.videoFile?.name || 'Unknown File', data);
      // Optional: Add toast notification logic here
      // alert('Saved to database!'); // Too intrusive, but confirms functionality for now.
    } catch (e) {
      console.error("Save failed", e);
      dispatch({ type: 'SET_POPUP_ERROR', payload: "Failed to save analysis to local database." });
    }
  }, [state.selectedMode, state.videoFile]);

  const handleLoadAnalysis = useCallback((analysis: SavedAnalysis) => {
    dispatch({ type: 'LOAD_SAVED_ANALYSIS', payload: analysis });
  }, []);

  const handleProjectSettings = useCallback(() => {
    dispatch({ type: 'SET_STATUS', payload: AppStatus.PROJECT_SETTINGS });
  }, []);

  const handleModelRouterSettings = useCallback(() => {
    dispatch({ type: 'SET_STATUS', payload: AppStatus.MODEL_ROUTER_SETTINGS });
  }, []);

  const handleSemanticSearch = useCallback(() => {
    dispatch({ type: 'DESELECT_MODE' }); // Clear any active mode to ensure view switch
    dispatch({ type: 'SET_STATUS', payload: AppStatus.SEMANTIC_SEARCH });
  }, []);

  const handleSaveProjectMetadata = useCallback((metadata: ProjectMetadata, gcsToken?: string, gcsProjectId?: string, useProMode?: boolean) => {
    dispatch({ type: 'UPDATE_PROJECT_METADATA', payload: metadata });
    if (gcsToken !== undefined) {
      dispatch({ type: 'SET_GCS_ACCESS_TOKEN', payload: gcsToken });
    }
    if (gcsProjectId !== undefined) {
      dispatch({ type: 'SET_GCS_PROJECT_ID', payload: gcsProjectId });
    }
    if (useProMode !== undefined) {
      dispatch({ type: 'SET_USE_PRO_MODE', payload: useProMode });
    }
    dispatch({ type: 'SET_STATUS', payload: state.videoFile ? AppStatus.MODE_SELECT : AppStatus.UPLOAD });
  }, [state.videoFile]);

  const createJobRunner = useCallback(<T,>(
    mode: AnalysisMode,
    jobFunction: (
      controller: AbortController,
      updateProgress: (message: string, percentage: number) => void
    ) => Promise<T>
  ) => {
    return async () => {
      const controller = new AbortController();
      dispatch({
        type: 'UPDATE_JOB',
        payload: {
          mode,
          updates: { status: 'processing', progressPercentage: 0, abortController: controller },
        },
      });
      dispatch({ type: 'DESELECT_MODE' });

      const updateProgress = (message: string, percentage: number) => {
        if (message.startsWith('PARTIAL_RESULT:')) {
          try {
            const payload = JSON.parse(message.replace('PARTIAL_RESULT:', ''));
            if (payload.data && Array.isArray(payload.data)) {
              dispatch({
                type: 'APPEND_JOB_RESULT',
                payload: { mode, data: payload.data }
              });
              // Optional: Update message only (keep percentage)
              if (payload.data.length > 0) {
                dispatch({
                  type: 'UPDATE_JOB',
                  payload: { mode, updates: { progressMessage: `Found ${payload.data.length} new items...` } }
                });
              }
            }
          } catch (e) {
            console.warn("Error parsing partial result:", e);
          }
        } else {
          dispatch({
            type: 'UPDATE_JOB',
            payload: { mode, updates: { progressMessage: message, progressPercentage: percentage } },
          });
        }
      };

      try {
        const result = await jobFunction(controller, updateProgress);
        dispatch({
          type: 'UPDATE_JOB',
          payload: { mode, updates: { status: 'results', result, progressPercentage: 100 } },
        });
      } catch (error) {
        let errorMessage = ERROR_MESSAGES.UNKNOWN;
        if (error instanceof Error) {
          errorMessage = ERROR_MESSAGES[error.message] || error.message;
        }

        if (error instanceof Error && error.message !== ERROR_IDS.OPERATION_CANCELLED) {
          dispatch({ type: 'SET_POPUP_ERROR', payload: errorMessage });

          dispatch({
            type: 'UPDATE_JOB',
            payload: { mode, updates: { status: 'configuring', progressPercentage: 0, progressMessage: PROGRESS_MESSAGES.DEFAULT, abortController: null } },
          });

          dispatch({ type: 'SELECT_MODE', payload: mode });

        } else { // Operation was cancelled
          dispatch({
            type: 'UPDATE_JOB',
            payload: { mode, updates: { ...initialJobState } },
          });
        }
      }
    };
  }, []);

  const handleSynopsisGeneration = useCallback(
    async (writer: string, director: string, keywords: string, language: string) => {
      if (!state.videoFile || !state.geminiFileUri) return;

      const runner = createJobRunner<Synopsis>('synopsis', async (controller, updateProgress) => {
        const result = await performAnalysis({
          file: state.videoFile!,
          fileUri: state.geminiFileUri!,
          mode: 'synopsis',
          apiKey: import.meta.env.VITE_GEMINI_API_KEY,
          bucketName: import.meta.env.VITE_GOOGLE_CLOUD_STORAGE_BUCKET || 'gemini-deliverables-app',
          onProgress: updateProgress,
          signal: controller.signal,
          synopsisConfig: { ...state.synopsisConfig, writer, director, keywords, language, fileName: state.videoFile!.name },
        });
        return result;
      });

      await runner();
    },
    [state.videoFile, state.geminiFileUri, state.synopsisConfig, createJobRunner]
  );

  const handleBioGeneration = useCallback(
    async (talents: { name: string; context: string }[], language: string, autoDetect: boolean) => {
      if (!state.videoFile || !state.geminiFileUri) return;

      const runner = createJobRunner<Bio[]>('bio', async (controller, updateProgress) => {
        const result = await performAnalysis({
          file: state.videoFile!,
          fileUri: state.geminiFileUri!,
          mode: 'bio',
          apiKey: import.meta.env.VITE_GEMINI_API_KEY,
          bucketName: import.meta.env.VITE_GOOGLE_CLOUD_STORAGE_BUCKET || 'gemini-deliverables-app',
          onProgress: updateProgress,
          signal: controller.signal,
          bioConfig: { ...DEFAULT_BIO_CONFIG, talentDetails: talents, language, autoDetect },
        });
        return result;
      });

      await runner();
    },
    [state.videoFile, state.geminiFileUri, createJobRunner]
  );

  const handleGraphicsAnalysis = useCallback(async () => {
    if (!state.videoFile || !state.geminiFileUri || !state.videoMetadata) return;

    const runner = createJobRunner<GraphicsAnalysisResult>('graphics', async (controller, updateProgress) => {
      const result = await performAnalysis({
        file: state.videoFile!,
        fileUri: state.geminiFileUri!,
        mode: 'graphics',
        apiKey: import.meta.env.VITE_GEMINI_API_KEY,
        bucketName: import.meta.env.VITE_GOOGLE_CLOUD_STORAGE_BUCKET || 'gemini-deliverables-app',
        onProgress: updateProgress,
        signal: controller.signal,
        graphicsConfig: {
          ...DEFAULT_GRAPHICS_CONFIG,
          videoDuration: state.videoMetadata!.duration,
          videoFileName: state.videoFile!.name.replace(/\.[^/.]+$/, ''),
        },
      });
      return result;
    });

    await runner();
  }, [state.videoFile, state.geminiFileUri, state.videoMetadata, createJobRunner]);

  const handleFaunaAnalysis = useCallback(async () => {
    if (!state.videoFile || !state.geminiFileUri || !state.videoMetadata) return;

    const runner = createJobRunner<SpeciesSighting[]>('fauna', async (controller, updateProgress) => {
      const result = await performAnalysis({
        file: state.videoFile!,
        fileUri: state.geminiFileUri!,
        mode: 'fauna',
        apiKey: import.meta.env.VITE_GEMINI_API_KEY,
        bucketName: import.meta.env.VITE_GOOGLE_CLOUD_STORAGE_BUCKET || 'gemini-deliverables-app',
        onProgress: updateProgress,
        signal: controller.signal,
        faunaConfig: state.faunaConfig,
      });
      return result;
    });

    await runner();
  }, [state.videoFile, state.geminiFileUri, state.videoMetadata, state.faunaConfig, createJobRunner]);

  const handleTranscription = useCallback(async () => {
    if (!state.videoFile || !state.geminiFileUri) return;

    const runner = createJobRunner<TranscriptionResult>('transcribe', async (controller, updateProgress) => {

      // Use the new Coordinator for Transcriptions (Zero Hallucination)
      const result = await performAnalysis({
        file: state.videoFile!,
        fileUri: state.geminiFileUri!,
        mode: 'transcribe',
        apiKey: import.meta.env.VITE_GEMINI_API_KEY,
        bucketName: import.meta.env.VITE_GOOGLE_CLOUD_STORAGE_BUCKET || 'gemini-deliverables-app',
        onProgress: updateProgress,
        signal: controller.signal,
        videoMetadata: state.videoMetadata, // Pass metadata for frame rate accuracy
        accessToken: state.gcsAccessToken, // Pass OAuth token for Zero Hallucination
        projectId: state.gcsProjectId, // Pass Project ID for Quota
        useProMode: state.useProMode // Toggle for Zero Hallucination
      });

      return result; // Result is already formatted by performAnalysis
    });

    await runner();
  }, [state.videoFile, state.geminiFileUri, state.videoMetadata, createJobRunner]);

  const handleUpdateSpeaker = useCallback((speakerId: string, newName: string) => {
    dispatch({ type: 'UPDATE_SPEAKER', payload: { speakerId, newName } });
  }, []);

  const handleShotListGeneration = useCallback(
    async (language: string, frameRate: number, minShotDuration: number = 0) => {
      if (!state.videoFile || !state.geminiFileUri || !state.videoMetadata) return;

      const runner = createJobRunner<ShotListResult>('shotlist', async (controller, updateProgress) => {
        // Use the new Coordinator for Shot Lists (Zero Hallucination)
        const shotsData = await performAnalysis({
          file: state.videoFile!,
          fileUri: state.geminiFileUri!,
          mode: 'shotlist',
          apiKey: import.meta.env.VITE_GEMINI_API_KEY,
          bucketName: import.meta.env.VITE_GOOGLE_CLOUD_STORAGE_BUCKET || 'gemini-deliverables-app',
          onProgress: updateProgress,
          signal: controller.signal,
          shotListConfig: { ...DEFAULT_SHOTLIST_CONFIG, language, frameRate, videoPreviewUrl: state.videoPreviewUrl! },
          videoMetadata: state.videoMetadata, // Pass metadata for frame rate accuracy
          accessToken: state.gcsAccessToken, // Pass OAuth token for Zero Hallucination
          projectId: state.gcsProjectId, // Pass Project ID for Quota
          useProMode: state.useProMode // Toggle for Zero Hallucination
        });

        // Apply minimum shot duration filter if set
        let filteredShots = shotsData;
        if (minShotDuration > 0) {
          const originalCount = shotsData.length;
          filteredShots = shotsData.filter((shot: any) => {
            // Parse duration string like "00:00:02:15" to seconds
            const durationParts = (shot.duration || '00:00:00:00').split(':').map(Number);
            let durationSeconds = 0;
            if (durationParts.length === 4) {
              // HH:MM:SS:FF format
              durationSeconds = durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2] + durationParts[3] / frameRate;
            } else if (durationParts.length === 3) {
              // HH:MM:SS format
              durationSeconds = durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2];
            }
            return durationSeconds >= minShotDuration;
          });
          console.log(`[ShotList] Filtered: ${originalCount} → ${filteredShots.length} shots (min ${minShotDuration}s)`);
        }

        const shotsWithThumbnails = filteredShots.map((shot: any, index: number) => {
          return {
            ...shot,
            nr: index + 1,
            thumbnail: undefined
          };
        });

        return { shots: shotsWithThumbnails, videoUrl: state.videoPreviewUrl!, frameRate: shotsData.frameRate };
      });

      await runner();
    }, [state.videoFile, state.geminiFileUri, state.videoMetadata, state.videoPreviewUrl, createJobRunner]
  );

  const handleTemplateConversion = useCallback(async (_sourceFile: File, _targetFile: File) => {
    // Template converter temporarily disabled during Phase 1 consolidation
    // This feature requires the frontend Gemini service which has been removed
    dispatch({
      type: 'SET_POPUP_ERROR',
      payload: 'Template Converter is temporarily unavailable. This feature is being migrated to the backend.'
    });
  }, []);

  const handleStartSemanticIndexing = useCallback(async () => {
    if (!state.videoFile) return;

    // Use a separate decoupled runner ? Or just async logic since it's "background safe" by design?
    // We'll update state directly.
    dispatch({ type: 'UPDATE_SEMANTIC_INDEXING', payload: { status: 'indexing', progress: 0 } });

    // Clear previous index
    // embeddingService.clear();

    try {
      // await indexingService.indexVideo(state.videoFile, (msg, progress) => {
      //   dispatch({ type: 'UPDATE_SEMANTIC_INDEXING', payload: { status: 'indexing', progress } });
      // });
      dispatch({ type: 'UPDATE_SEMANTIC_INDEXING', payload: { status: 'idle', progress: 0 } }); // Disabled for now
      dispatch({ type: 'SET_POPUP_ERROR', payload: "Semantic Indexing is temporarily disabled." });
    } catch (e) {
      console.error("Indexing failed", e);
      dispatch({ type: 'SET_POPUP_ERROR', payload: "Semantic Indexing Failed. Check console." });
      dispatch({ type: 'UPDATE_SEMANTIC_INDEXING', payload: { status: 'idle', progress: 0 } });
    }
  }, [state.videoFile]);

  const handleFullAnalysis = useCallback(async () => {
    if (!state.videoFile || !state.geminiFileUri || !state.videoMetadata) return;

    // Use the unified job runner for full analysis
    const runner = createJobRunner<FullAnalysisResult>('full_analysis', async (controller, updateProgress) => {

      // Initialize all sub-jobs to 'processing' so they appear active in the UI
      ['synopsis', 'bio', 'graphics', 'fauna', 'transcribe', 'shotlist'].forEach(m => {
        dispatch({
          type: 'UPDATE_JOB',
          payload: {
            mode: m as AnalysisMode,
            updates: { status: 'processing', progressPercentage: 0, progressMessage: 'Waiting for coordinator...' }
          }
        });
      });

      const result = await performAnalysis({
        file: state.videoFile!,
        fileUri: state.geminiFileUri!,
        mode: 'full_analysis',
        apiKey: import.meta.env.VITE_GEMINI_API_KEY,
        bucketName: import.meta.env.VITE_GOOGLE_CLOUD_STORAGE_BUCKET || 'gemini-deliverables-app',
        onProgress: updateProgress,
        onMultiProgress: (mode: AnalysisMode, message: string, percentage: number) => {
          // Check for Partial Results (Checkpointing)
          if (message.startsWith('PARTIAL_RESULT:')) {
            try {
              const payload = JSON.parse(message.replace('PARTIAL_RESULT:', ''));
              if (mode === 'fauna' && payload.sightings) {
                // Dispatch Incremental Update
                // Note: We need a special action type or logic to APPEND rather than SET.
                // However, standard UPDATE_JOB sets 'result'.
                // To avoid complexity, we rely on the reducer merging deep objects OR we accept that
                // for now we might be overwriting IF we don't access current state.
                // WAIT: state.jobs[mode].result is not accessible inside this callback easily without ref.
                // BETTER STRATEGY: Dispatch a functional update or a specific INCREMENTAL action.
                // For simplicity in this architecture: We will read the payload and Append to a local ref if needed, 
                // BUT Redux dispatch with a functional payload is cleaner.
                // As 'UPDATE_JOB' usually takes a value, let's modify the reducer OR 
                // use a custom logic here to dispatch 'UPDATE_JOB' with the accumulated array?
                // No, we can't see the previous array here.

                // ACTION: Dispatch a special signal that the Reducer handles, OR just assume the Reducer handles arrays.
                // Let's implement a specific logic in the reducer for 'APPEND_SIGHTINGS'? 
                // Too complex to change Reducer now.

                // WORKAROUND: We will dispatch a custom action type that we can execute via the existing dispatch?
                // No, 'UPDATE_JOB' is typed.

                // OPTIMAL: Use a Ref to accumulate local results in this scope, then dispatch the full list.
                // state.jobs is outside.

                // Let's assume the reducer REPLACES the result.
                // So we need to accumulate here.
                // Since `performAnalysis` is wrapped in `useCallback` with `createJobRunner`, we can't easily hold state *across* re-renders without a ref.
                // BUT `handleFullAnalysis` is created once per file change.
                // Let's use a closure variable `faunaAccumulator`.

                // Actually, `performAnalysis` runs in one go. We can define the accumulator HERE.
                // (See `faunaAccumulator` defined below/above in the scope if we move it).

                // Let's dispatch a message that says "Found X sightings..." for UI feedback,
                // AND we rely on the FINAL result for the full data?
                // NO, the requirement is CHECKPOINTING.

                // Solution: We need to update the Redux Store incrementally.
                // Let's use a React `useRef` at the component level to hold 'wipSightings'? 
                // Or simply dispatch with a flag `isPartial: true`.

                // Let's modify the Dispatch Payload to support `appendResult: true`.
                dispatch({
                  type: 'UPDATE_JOB',
                  payload: {
                    mode,
                    updates: {
                      status: 'processing',
                      progressPercentage: percentage,
                      progressMessage: `Found ${payload.sightings.length} new sightings...`,
                      // We abuse the 'result' field to pass partial data IF we change the reducer.
                      // But let's look at the reducer in App.tsx... it likely just spreads updates.
                      // If we assume standard spread:
                      // updates: { result: [...old, ...new] } -> Impossible without access to old.

                      // CRITICAL: We need to change the Reducer to support appending.
                      // For now, let's just log it and show progress message.
                      // User asked for "Commit results to state/database".

                      // REAL FIX: 
                      // 1. Dispatch a new action type `APPEND_JOB_RESULT` (requires reducer change).
                      // 2. OR Dispatch `UPDATE_JOB` with a special property that the reducer functionality handles?
                      // The reducer is likely `appReducer`. I can't see it fully here.

                      // Let's stick to updating the Message for now and use the Ref strategy in the Runner?
                      // No, prompt requires "Commit to state".

                      // I will implement `APPEND_JOB_RESULT` action in the Reducer later if needed.
                      // For now, I will modify THIS logic to assume I can dispatch an append command.
                      // Since I cannot change the reducer type definition easily without viewing it,
                      // I will use a clever hack: 
                      // I will define a helper in the hook `accumulatedSightings` for this session.

                    }
                  }
                });

                // Dispatch specific APPEND action (Assuming I will add it to Reducer next)
                dispatch({
                  type: 'APPEND_JOB_RESULT',
                  payload: {
                    mode: 'fauna',
                    data: payload.sightings
                  }
                } as any);
              }
            } catch (e) {
              console.warn("Failed to parse partial result", e);
            }
          } else {
            // Standard Update
            dispatch({
              type: 'UPDATE_JOB',
              payload: {
                mode,
                updates: { status: 'processing', progressPercentage: percentage, progressMessage: message }
              }
            });
          }
        },
        signal: controller.signal,

        // Pass all configs
        synopsisConfig: { ...state.synopsisConfig, fileName: state.videoFile!.name },
        bioConfig: DEFAULT_BIO_CONFIG,
        faunaConfig: state.faunaConfig,
        shotListConfig: { ...DEFAULT_SHOTLIST_CONFIG, videoPreviewUrl: state.videoPreviewUrl! },
        graphicsConfig: DEFAULT_GRAPHICS_CONFIG,

        videoMetadata: state.videoMetadata,
        accessToken: state.gcsAccessToken,
        projectId: state.gcsProjectId,
        useProMode: state.useProMode,
        tokenIsValid: state.useProMode // Gated by App state which disables Pro Mode on auth failure
      });

      // Distribute the results to the individual job states so they appear as "Done" in the dashboard
      if (result) {
        if (result.synopsis) dispatch({ type: 'UPDATE_JOB', payload: { mode: 'synopsis', updates: { status: 'results', result: result.synopsis, progressPercentage: 100 } } });
        if (result.bio) dispatch({ type: 'UPDATE_JOB', payload: { mode: 'bio', updates: { status: 'results', result: result.bio, progressPercentage: 100 } } });
        if (result.graphics) dispatch({ type: 'UPDATE_JOB', payload: { mode: 'graphics', updates: { status: 'results', result: result.graphics, progressPercentage: 100 } } });
        if (result.fauna) dispatch({ type: 'UPDATE_JOB', payload: { mode: 'fauna', updates: { status: 'results', result: result.fauna, progressPercentage: 100 } } });
        if (result.transcription) dispatch({ type: 'UPDATE_JOB', payload: { mode: 'transcribe', updates: { status: 'results', result: result.transcription, progressPercentage: 100 } } });
        if (result.shotList) dispatch({ type: 'UPDATE_JOB', payload: { mode: 'shotlist', updates: { status: 'results', result: { shots: result.shotList, videoUrl: state.videoPreviewUrl, frameRate: state.videoMetadata?.frameRate || 24 }, progressPercentage: 100 } } });
      }

      return result;
    });

    await runner();
  }, [state.videoFile, state.geminiFileUri, state.videoMetadata, state.videoPreviewUrl, state.synopsisConfig, state.faunaConfig, state.gcsAccessToken, state.gcsProjectId, state.useProMode, createJobRunner]);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET_ALL' });
  }, []);

  const handleCancel = useCallback(
    (mode: AnalysisMode) => {
      state.jobs[mode].abortController?.abort();
      dispatch({ type: 'UPDATE_JOB', payload: { mode, updates: { ...initialJobState } } });
      dispatch({ type: 'DESELECT_MODE' });
    },
    [state.jobs]
  );

  useEffect(() => {
    return () => {
      if (state.videoPreviewUrl) URL.revokeObjectURL(state.videoPreviewUrl);
    };
  }, [state.videoPreviewUrl]);

  const renderContent = () => {
    switch (state.appStatus) {
      // Unified landing page - button changes based on connection/language state
      case AppStatus.LANDING:
      case AppStatus.LANGUAGE_SELECT:
      case AppStatus.UPLOAD: {
        const isConnected = localStorage.getItem('cloudConnected') !== null;
        const hasLanguage = localStorage.getItem('menuLanguage') !== null;

        return (
          <FileUploadView
            onFileSelect={handleFileSelect}
            onUriSelect={handleUriSelect}
            onOpenSettings={handleProjectSettings}
            isConnected={isConnected}
            hasLanguage={hasLanguage}
            isConnecting={state.isConnecting}
            onConnect={async () => {
              dispatch({ type: 'SET_IS_CONNECTING', payload: true });
              try {
                const user = await authService.signIn();
                localStorage.setItem('cloudConnected', 'true');
                dispatch({
                  type: 'SET_GOOGLE_USER',
                  payload: { email: user.email, token: user.accessToken }
                });
                // Force re-render to show language selector
                dispatch({ type: 'SET_STATUS', payload: AppStatus.LANGUAGE_SELECT });
              } catch (error) {
                console.warn('[Onboarding] OAuth failed, using demo mode:', error);
                localStorage.setItem('cloudConnected', 'demo');
                dispatch({ type: 'SET_STATUS', payload: AppStatus.LANGUAGE_SELECT });
              } finally {
                dispatch({ type: 'SET_IS_CONNECTING', payload: false });
              }
            }}
            onSelectLanguage={(langCode) => {
              localStorage.setItem('menuLanguage', langCode);
              // Force re-render to show upload button
              dispatch({ type: 'SET_STATUS', payload: AppStatus.UPLOAD });
            }}
          />
        );
      }


      case AppStatus.UPLOADING:
        return (
          <ProcessingView
            message={state.uploadMessage}
            percentage={state.uploadProgress}
            onCancel={handleReset}
            onBack={handleBackgroundUpload}
          />
        );

      case AppStatus.PREPARING_VIDEO:
        return (
          <ProcessingView
            message={PROGRESS_MESSAGES.PREPARING_VIDEO}
            percentage={state.videoBufferProgress}
            onCancel={handleReset}
            onBack={handleReset}
          />
        );

      case AppStatus.MODE_SELECT:
        if (state.videoFile) {
          return (
            <ModeSelectView
              videoFile={state.videoFile}
              videoPreviewUrl={state.videoPreviewUrl}
              onModeSelect={handleModeSelect}
              onBack={handleReset}
              onViewHistory={() => dispatch({ type: 'SET_STATUS', payload: AppStatus.HISTORY })}
              onViewSettings={handleProjectSettings}
              jobs={state.jobs}
              onDownloadAll={() => exportAllDeliverables(state.jobs, state.projectMetadata, state.videoFile?.name || 'video')}
              isUploading={!state.geminiFileUri}
            />
          );
        }
        return <FileUploadView onFileSelect={handleFileSelect} onUriSelect={handleUriSelect} />;

      case AppStatus.HISTORY:
        return <HistoryView onBack={() => dispatch({ type: 'SET_STATUS', payload: state.videoFile ? AppStatus.MODE_SELECT : AppStatus.UPLOAD })} onLoadAnalysis={handleLoadAnalysis} />;

      case AppStatus.PROJECT_SETTINGS:
        return (
          <ProjectMetadataView
            initialMetadata={state.projectMetadata}
            currentGcsToken={state.gcsAccessToken}
            currentGcsProjectId={state.gcsProjectId}
            currentUseProMode={state.useProMode}
            googleUserEmail={state.gcsUserEmail}
            onGoogleSignIn={(email, token) => dispatch({ type: 'SET_GOOGLE_USER', payload: { email, token } })}
            onGoogleSignOut={() => dispatch({ type: 'DISCONNECT_GOOGLE_USER' })}
            onCheckAuth={() => {
            }}
            onSave={handleSaveProjectMetadata}
            onCancel={() => dispatch({ type: 'SET_STATUS', payload: state.videoFile ? AppStatus.MODE_SELECT : AppStatus.UPLOAD })}
          />
        );

      case AppStatus.DEBUG_SCENE:
        return (
          <div className="container mx-auto px-4 py-8 h-[calc(100vh-100px)]">
            <button
              onClick={handleBackToDashboard}
              className="mb-4 text-gray-400 hover:text-white flex items-center gap-2 transition-colors"
            >
              ← Back
            </button>
            <Suspense fallback={<div className="flex justify-center items-center h-64 text-gray-400">Loading Debugger...</div>}>
              <SceneDetectorDebugView />
            </Suspense>
          </div>
        );

      case AppStatus.MODEL_ROUTER_SETTINGS:
        return (
          <div className="container mx-auto px-4 py-8">
            <button
              onClick={handleBackToDashboard}
              className="mb-6 text-gray-400 hover:text-white flex items-center gap-2 transition-colors"
            >
              ← Back
            </button>
            <Suspense fallback={<div className="flex justify-center items-center h-64 text-gray-400">Loading Settings...</div>}>
              <ModelRouterSettings />
            </Suspense>
          </div>
        );

      case AppStatus.SEMANTIC_SEARCH:
        return (
          <div className="container mx-auto px-4 py-8 h-[calc(100vh-100px)]">
            <button
              onClick={handleBackToDashboard}
              className="mb-4 text-gray-400 hover:text-white flex items-center gap-2 transition-colors"
            >
              ← Back
            </button>
            <Suspense fallback={<div className="flex justify-center items-center h-64 text-gray-400">Loading Search Engine...</div>}>
              <SemanticSearchView
                videoFile={state.videoFile}
                onSeek={(time) => {
                  console.log("Seek to:", time);
                }}
                isIndexing={state.semanticIndexing.status === 'indexing'}
                isIndexed={state.semanticIndexing.status === 'indexed'}
                indexProgress={state.semanticIndexing.progress}
                progressMsg={state.semanticIndexing.status === 'indexing' ? 'Indexing...' : 'Ready'}
                onStartIndexing={handleStartSemanticIndexing}
              />
            </Suspense>
          </div>
        );

      default:
        return null;
    }
  };

  const renderJobDetailView = useMemo(() => {
    if (!state.selectedMode) return null;
    const job = state.jobs[state.selectedMode];

    switch (job.status) {
      case 'configuring':
        switch (state.selectedMode) {
          case 'synopsis': return <SynopsisInputView onGenerate={handleSynopsisGeneration} synopsisConfig={state.synopsisConfig} onConfigChange={(config) => dispatch({ type: 'UPDATE_SYNOPSIS_CONFIG', payload: config })} onBack={handleBackToDashboard} />;
          case 'bio': return <BioInputView onGenerate={handleBioGeneration} onBack={handleBackToDashboard} />;
          case 'graphics': return <GraphicsInputView onGenerate={handleGraphicsAnalysis} onBack={handleBackToDashboard} />;
          case 'fauna': return <FaunaInputView onGenerate={handleFaunaAnalysis} config={state.faunaConfig} onConfigChange={(config) => dispatch({ type: 'UPDATE_FAUNA_CONFIG', payload: config })} onBack={handleBackToDashboard} />;
          case 'transcribe': return <TranscriptionInputView onStartTranscription={handleTranscription} onBack={handleBackToDashboard} />;
          case 'shotlist': return <ShotListInputView onStartAnalysis={handleShotListGeneration} onBack={handleBackToDashboard} />;
          case 'template_converter': return <TemplateConverterInputView onConvert={handleTemplateConversion} onBack={handleBackToDashboard} />;
          case 'techspecs': return <TechSpecsView
            videoMetadata={state.videoMetadata!}
            projectMetadata={state.projectMetadata}
            videoFileName={state.videoFile?.name || ''}
            onBack={handleBackToDashboard}
          />;

          case 'full_analysis':
            // Auto-start for now, or show a simple "Start" button view
            // Using useEffect hack or just rendering a "Starting..." placeholder that triggers it
            // Better: Just call handleFullAnalysis immediately in a useEffect here?
            // Actually, best to just render a simple "Confirm Start" view or auto-trigger.
            // Let's use a simple auto-trigger effect in a wrapper or just a button.
            return (
              <div className="text-center p-12">
                <h3 className="text-2xl font-bold mb-4">Ready for Full Analysis</h3>
                <p className="mb-6 text-gray-400">This will run Shot Detection, Transcription, and Label Analysis in parallel.</p>
                <button onClick={handleFullAnalysis} className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold">Start Unified Analysis</button>
                <button onClick={handleBackToDashboard} className="block mt-4 mx-auto text-gray-500 hover:text-gray-300">Cancel</button>
              </div>
            );
        }
        break;
      case 'processing': return <ProcessingView message={job.progressMessage} percentage={job.progressPercentage} onCancel={() => handleCancel(state.selectedMode!)} onBack={handleBackToDashboard} />;
      case 'results':
        switch (state.selectedMode) {
          case 'synopsis': return <SynopsisResultView synopsis={job.result as Synopsis} videoFileName={state.videoFile?.name || ''} videoMetadata={state.videoMetadata} projectMetadata={state.projectMetadata} onReset={handleReset} onBack={handleBackToDashboard} onSave={handleSaveAnalysis} />;
          case 'bio': return <BioResultView bios={job.result as Bio[]} videoFileName={state.videoFile?.name || ''} projectMetadata={state.projectMetadata} onReset={handleReset} onBack={handleBackToDashboard} onSave={handleSaveAnalysis} />;
          case 'graphics': return <GraphicsResultView result={job.result as GraphicsAnalysisResult} videoFileName={state.videoFile?.name || ''} videoPreviewUrl={state.videoPreviewUrl} videoMetadata={state.videoMetadata} projectMetadata={state.projectMetadata} onReset={handleReset} onBack={handleBackToDashboard} onSave={handleSaveAnalysis} />;
          case 'fauna': return <FaunaResultView sightings={job.result as SpeciesSighting[]} videoFileName={state.videoFile?.name || ''} videoPreviewUrl={state.videoPreviewUrl} config={state.faunaConfig} videoMetadata={state.videoMetadata} projectMetadata={state.projectMetadata} onReset={handleReset} onBack={handleBackToDashboard} onSave={handleSaveAnalysis} />;
          case 'transcribe': return <TranscriptionResultView
            result={state.jobs.transcribe.result!}
            videoPreviewUrl={state.videoPreviewUrl}
            videoFileName={state.videoFile?.name || 'video'}
            videoMetadata={state.videoMetadata}
            projectMetadata={state.projectMetadata}
            graphicsResult={state.jobs.graphics.result}
            bioResult={state.jobs.bio.result as Bio[] | null} // Bio data for speaker matching
            onReset={handleReset}
            onBack={handleBackToDashboard}
            onSave={() => handleSaveAnalysis(state.jobs.transcribe.result)}
          />;
          case 'shotlist': return <ShotListResultView result={job.result as ShotListResult} videoPreviewUrl={state.videoPreviewUrl} videoFileName={state.videoFile?.name || ''} videoMetadata={state.videoMetadata} projectMetadata={state.projectMetadata} onReset={handleReset} onBack={handleBackToDashboard} onSave={handleSaveAnalysis} />;
          case 'template_converter': return <TemplateConverterResultView result={job.result as TemplateConverterResult} onReset={handleReset} onBack={handleBackToDashboard} />;

          case 'full_analysis': return <FullAnalysisResultView result={job.result as FullAnalysisResult} videoPreviewUrl={state.videoPreviewUrl} videoFileName={state.videoFile?.name || ''} videoMetadata={state.videoMetadata} projectMetadata={state.projectMetadata} onReset={handleReset} onBack={handleBackToDashboard} onSave={handleSaveAnalysis} onUpdateSpeaker={handleUpdateSpeaker} />;
        }
        break;
    }
    return null;
  }, [state.selectedMode, state.jobs, state.synopsisConfig, state.faunaConfig, state.videoFile, state.videoPreviewUrl, handleSynopsisGeneration, handleBioGeneration, handleGraphicsAnalysis, handleFaunaAnalysis, handleTranscription, handleShotListGeneration, handleBackToDashboard, handleCancel, handleReset, handleUpdateSpeaker, handleSaveAnalysis]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-slate-900 text-white p-4 sm:p-6 lg:p-8">
      <Suspense>
        {state.popupErrorMessage && (
          <ErrorPopup
            errorMessage={state.popupErrorMessage}
            onClose={() => dispatch({ type: 'SET_POPUP_ERROR', payload: null })}
          />
        )}
      </Suspense>

      {/* DEBUG VIEW */}
      {state.appStatus === AppStatus.DEBUG_SCENE && (
        <Suspense fallback={<div className="text-white p-10">Loading WASM Module...</div>}>
          <div className="h-full relative z-10 bg-black rounded-lg overflow-hidden border border-gray-800">
            <button
              onClick={() => dispatch({ type: 'SET_STATUS', payload: AppStatus.UPLOAD })}
              className="absolute top-4 right-4 z-50 text-gray-400 hover:text-white bg-gray-800 px-3 py-1 rounded"
            >
              Close Debugger
            </button>
            <SceneDetectorDebugView />
          </div>
        </Suspense>
      )}

      {/* Main Content Area - Hide when debugging */}
      {state.appStatus !== AppStatus.DEBUG_SCENE && (
        <div className="flex-1 overflow-hidden relative z-10 flex flex-col">
          {/* Header - Hide on Upload/Landing Page */}
          {state.appStatus !== AppStatus.UPLOAD && (
            <header className="h-16 border-b border-gray-800 bg-black/40 backdrop-blur-md flex items-center justify-between px-6 shrink-0 rounded-t-lg">
              <div className="flex items-center gap-4">
                <div
                  className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => dispatch({ type: 'RESET_ALL' })}
                >
                  <div className="w-4 h-4 rounded-full bg-white/20" />
                </div>
                <h1 className="text-2xl font-serif font-bold text-white tracking-tight hidden sm:block">
                  NEVER<span className="text-[#ccff00]">.</span>
                </h1>
                <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-full hidden sm:inline-block">V2</span>
              </div>

              <div className="flex items-center gap-3">
                {/* Debug Button */}
                <button
                  onClick={() => dispatch({ type: 'SET_STATUS', payload: AppStatus.DEBUG_SCENE })}
                  className="p-2 text-gray-400 hover:text-yellow-400 transition-colors"
                  title="WASM Scene Detector Debugger"
                >
                  <Zap size={20} />
                </button>

                <button
                  onClick={handleProjectSettings}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  title="Project Settings & Cloud Connection"
                >
                  <Settings size={20} />
                </button>
                <button
                  onClick={() => setShowFeedback(true)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  title="Send Feedback"
                >
                  <HelpCircle size={20} />
                </button>
                <button onClick={handleSemanticSearch} className="p-2 hover:bg-gray-800 rounded-full transition-colors relative group ml-2">
                  <div className="bg-pink-600/20 text-pink-400 rounded-full p-1">
                    <Search size={18} />
                  </div>
                  <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-gray-700 pointer-events-none z-50">
                    Semantic Search
                  </span>
                </button>
              </div>
            </header>
          )}

          <main className="max-w-5xl mx-auto w-full">
            <div className="bg-gray-800/80 backdrop-blur-sm p-6 sm:p-8 rounded-b-2xl shadow-2xl border border-gray-700/50 border-t-0">
              <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
                {(state.selectedMode || state.appStatus === AppStatus.RESULTS) ? renderJobDetailView : renderContent()}
              </Suspense>
            </div>
          </main>
        </div>
      )}

      {/* Floating Back to Dashboard Button - shows on all non-dashboard pages */}
      {state.appStatus !== AppStatus.LANDING &&
        state.appStatus !== AppStatus.LANGUAGE_SELECT &&
        state.appStatus !== AppStatus.UPLOAD &&
        state.appStatus !== AppStatus.MODE_SELECT &&
        state.appStatus !== AppStatus.UPLOADING &&
        state.appStatus !== AppStatus.PREPARING_VIDEO && (
          <button
            onClick={() => {
              dispatch({ type: 'DESELECT_MODE' });
              dispatch({ type: 'SET_STATUS', payload: AppStatus.MODE_SELECT });
            }}
            className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 py-3 bg-gray-900/90 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white rounded-lg shadow-xl backdrop-blur-sm transition-all duration-200"
            title="Back to Dashboard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="font-medium text-sm">Dashboard</span>
          </button>
        )}

      {/* Global Bottom Progress Bar */}
      {!state.geminiFileUri && state.uploadProgress > 0 && state.uploadProgress < 100 && state.appStatus !== AppStatus.UPLOADING && (
        <div className="fixed bottom-0 left-0 w-full bg-gray-900/90 border-t border-gray-700 p-4 backdrop-blur-md z-50 animate-slide-up">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{state.uploadMessage}</span>
                <span>{Math.round(state.uploadProgress)}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full transition-all duration-300"
                  style={{ width: `${state.uploadProgress}% ` }}
                />
              </div>
            </div>
            <button
              onClick={handleReset}
              className="text-gray-400 hover:text-white font-medium text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showFeedback && (
        <Suspense>
          <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />
        </Suspense>
      )}

      {/* Onboarding Guide - Shows on first visit per browser */}
      <Suspense>
        <OnboardingGuide
          onComplete={() => setForceShowOnboarding(false)}
          forceShow={forceShowOnboarding}
        />
      </Suspense>
    </div>
  );
};

export default App;
