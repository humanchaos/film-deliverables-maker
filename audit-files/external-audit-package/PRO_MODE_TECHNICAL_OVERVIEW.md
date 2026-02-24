# Technical Overview: Large Video File Processing Architecture

## 1. File Upload Flow
- **Mechanism:** The application creates a "Resumable Upload Session" with the Gemini Files API. This is critical for large files as it allows recovering from network interruptions.
- **Protocol:** It uses `X-Goog-Upload-Protocol: resumable`.
- **Chunking:** Files are split into 8MB chunks (`CHUNK_SIZE` in `services/uploadService.ts:22`).
- **Storage:** 
    - **Standard Mode:** Files are stored in Gemini's internal temporary storage (`https://generativelanguage.googleapis.com/...`).
    - **Pro Mode:** Files are uploaded to your Google Cloud Storage (GCS) bucket (`gs://...`) using `services/gcsUploadService.ts`.
- **Limits:** Hardcoded 20GB limit (`MAX_FILE_SIZE_MB` in `types.ts:313`).
- **Progress:** `services/uploadService.ts` calculates precise byte-level progress and triggers `onProgress` callbacks, which feed into the `App.tsx` state and the UI ring.

## 2. Processing Pipeline
- **Trigger:** Manual user initiation via "Start Analysis" (State: `MODE_SELECT` -> `PROCESSING`).
- **Execution:** 
    - **Full Analysis:** Runs in PARALLEL. `services/analysisCoordinator.ts` uses `Promise.all` to run Transcription, Shot List, Fauna, etc., simultaneously. This maximizes speed but increases browser load.
    - **Individual Modes:** Run sequentially.
- **Failures:** The system is "fail-safe". Each module in `performAnalysis` is wrapped in its own `try/catch` block. If `Bio` fails, `Fauna` continues. The UI will show partial results.

## 3. API Integration
- **Gemini:** Called via `GoogleGenerativeAI` SDK (REST wrapper).
- **Video Intelligence:** Called via direct `fetch` (REST API) with Long-Running Operations (LRO).
- **Retry Logic:** All Gemini calls are wrapped in `retryWithBackoff` (`services/geminiService.ts`), which attempts 3 retries with exponential delays (1s, 2s, 4s).
- **Timeout:** 
    - **Gemini:** Default SDK timeouts (generally >180s).
    - **Video Intelligence:** **Infinite Polling** (`while(true)` in `services/googleVideoIntelligenceService.ts`). This is a potential risk if the server hangs.

## 4. State Management
- **Progress:** Managed via a "Smooth Progress" ticker in `services/analysisCoordinator.ts` to prevent UI jitter.
- **Persistence:** 
    - **Active Jobs:** IN-MEMORY only. If the browser tab closes or refreshes, the analysis progress is LOST.
    - **Uploads:** The *upload session URI* is cached in `localStorage`, so re-uploads are instantaneous (if within 48h).
    - **Results:** Completed results are saved to IndexedDB (`services/db.ts`).

## 5. Error Handling
- **API Timeouts:** Caught by `try/catch` blocks; usually result in a logged warning and an empty result for that specific module.
- **Popups:** Critical global errors (like "Upload Failed") trigger `SET_POPUP_ERROR` in `App.tsx`. Module-level errors often result in "Analysis Failed" text within the specific result view.

## 6. Stability Risks (Top 5 for 60-Minute Files)
1.  **Metadata Dependency (Critical):** The analysis relies on client-side metadata extraction (`videoMetadata.duration`). If the browser cannot decode the file (e.g., specific ProRes codec on Windows), duration defaults to 0, which breaks the segmented analysis logic, forcing a single-pass attempt that will fail.
2.  **Browser Tab Suspension:** For 60-minute files, processing takes >15 minutes. Modern browsers put background tabs to sleep, which will pause the JavaScript execution loop, potentially causing API timeouts or hangs. **User must keep the tab active.**
3.  **Video Intelligence Infinite Loop:** The polling logic for the "Pro Mode" API has no maximum timeout. If the Google server stalls, the app will spin forever.
4.  **UI Rendering Lag:** The `FaunaResultView` renders thousands of sightings without "virtualization" (windowing). A 60-minute file could produce 5000+ items, which might freeze the browser UI when the results tab is opened.
5.  **Memory Volatility:** Since state is strictly in-memory during analysis, any browser crash or accidental refresh (common with long waits) causes total data loss.

## Recent Improvement (Fauna Finder)
To mitigate the "Output Token Limit" risk causing invalid JSON errors, we have implemented a **Segmented Analysis Strategy** in `geminiService.ts`. Videos longer than 5 minutes are now processed in 5-minute chunks, ensuring high accuracy and preventing truncation errors.
