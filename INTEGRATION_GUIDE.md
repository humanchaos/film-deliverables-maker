# Integration Guide

This document explains the integration of the Audio/Video Transcriber and Shot Lister modules into the TMS Clip Analyzer application.

## ✅ What Has Been Done

### 1. Enhanced Type System
- Added new analysis modes: `'transcribe'` and `'shotlist'`
- Created `TranscriptionSegment` and `TranscriptionResult` types
- Created `Shot`, `PhotoAnalysisResult`, and `ShotListResult` types
- Updated error handling for new modes

### 2. New UI Components Created

**Input Views:**
- `TranscriptionInputView.tsx` - Configuration interface for transcription
- `ShotListInputView.tsx` - Configuration interface with language and frame rate selection

**Result Views:**
- `TranscriptionResultView.tsx` - Display transcription with inline speaker editing, copy, and CSV download
- `ShotListResultView.tsx` - Display shot list table with thumbnails and video preview

### 3. Updated ModeSelectView
- Added two new mode cards for Transcription and Shot List
- Styled with matching gradient themes (pink/rose for transcription, cyan/sky for shot list)

### 4. Directory Structure
All files have been set up in `/home/claude/integrated-clip-analyzer/`

## 🔨 What Still Needs to Be Done

### 1. Update Main App.tsx

You need to add handlers in `App.tsx` for the two new modes:

```typescript
// Add state for new features
const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);
const [shotListResult, setShotListResult] = useState<ShotListResult | null>(null);

// Add handler for transcription
const handleTranscription = useCallback(async () => {
  // Implementation needed:
  // 1. Upload file to Gemini API
  // 2. Process transcription with speaker identification
  // 3. Parse results into TranscriptionSegment[]
  // 4. Update state with results
}, [videoFile]);

// Add handler for shot list generation
const handleShotListGeneration = useCallback(async (language: string, frameRate: number) => {
  // Implementation needed:
  // 1. Extract frames using scene detection
  // 2. Analyze frames with Gemini for shot descriptions
  // 3. Generate thumbnails
  // 4. Create Shot[] array with timecodes
  // 5. Update state with results
}, [videoFile]);
```

### 2. Create/Update Service Functions

**In `services/geminiService.ts`, add:**

```typescript
// Transcription function
export async function transcribeMedia(
  file: File,
  signal: AbortSignal,
  progressCallback: (message: string, percentage: number) => void
): Promise<TranscriptionResult> {
  // Use Gemini's native audio/video processing
  // Return structured transcription with timecodes and speakers
}

// Shot list generation function
export async function generateShotList(
  frames: ExtractedFrame[],
  language: string,
  signal: AbortSignal,
  progressCallback: (message: string, percentage: number) => void
): Promise<Shot[]> {
  // Analyze frames in batches
  // Generate descriptions, action, and audio notes
  // Return structured shot data
}
```

### 3. Update App.tsx Rendering Logic

Add cases to render new components:

```typescript
// In render method, add conditions:
{selectedMode === 'transcribe' && appStatus !== AppStatus.PROCESSING && appStatus !== AppStatus.RESULTS && (
  <TranscriptionInputView
    onStartTranscription={handleTranscription}
    onBack={handleBackToModeSelect}
  />
)}

{selectedMode === 'shotlist' && appStatus !== AppStatus.PROCESSING && appStatus !== AppStatus.RESULTS && (
  <ShotListInputView
    onStartAnalysis={handleShotListGeneration}
    onBack={handleBackToModeSelect}
  />
)}

// In results section:
{selectedMode === 'transcribe' && transcriptionResult && (
  <TranscriptionResultView
    result={transcriptionResult}
    videoPreviewUrl={videoPreviewUrl}
    onReset={handleReset}
    onUpdateSpeaker={handleUpdateSpeaker}
  />
)}

{selectedMode === 'shotlist' && shotListResult && (
  <ShotListResultView
    result={shotListResult}
    onReset={handleReset}
  />
)}
```

### 4. Add Helper Functions from Original Apps

**From Transcriber:**
- Timecode conversion utilities
- Speaker identification logic
- CSV generation functions

**From Shotlister:**
- Scene detection algorithm
- Frame extraction with worker
- Timecode formatting functions
- Shot duration calculations

### 5. Update Package Dependencies

Make sure `package.json` includes all necessary dependencies:
```json
{
  "dependencies": {
    "react": "^19.0.0",
    "@google/generative-ai": "latest",
    // Add any other dependencies from transcriber and shotlister
  }
}
```

## 📋 Integration Checklist

- [x] Create enhanced type system
- [x] Create TranscriptionInputView component
- [x] Create ShotListInputView component
- [x] Create TranscriptionResultView component
- [x] Create ShotListResultView component
- [x] Update ModeSelectView with new modes
- [x] Create comprehensive README
- [ ] Update App.tsx with new handlers
- [ ] Implement transcription service function
- [ ] Implement shot list service function
- [ ] Add utility functions from original apps
- [ ] Test all modes together
- [ ] Update package.json if needed
- [ ] Test build process

## 🎯 Key Integration Points

1. **File Upload**: Both new modes should work with the existing FileUploadView
2. **Processing View**: Use the existing ProcessingView with updated progress messages
3. **Error Handling**: Use existing error system with new error types
4. **State Management**: Follow existing pattern for mode-specific state
5. **API Integration**: Use Gemini API consistently across all modes

## 📚 Reference Files

**Original Transcriber:**
- `/home/claude/transcriber/index.tsx` - Main implementation reference
- Look for `MediaTranscriber` component and Gemini integration

**Original Shotlister:**
- `/home/claude/shotlister/App.tsx` - Shot list logic
- `/home/claude/shotlister/services/videoService.ts` - Frame extraction
- `/home/claude/shotlister/services/geminiService.ts` - AI analysis

## 🚀 Next Steps

1. Review the original transcriber and shotlister code
2. Extract and adapt the core processing logic
3. Integrate into the unified App.tsx
4. Test each mode thoroughly
5. Deploy and enjoy your comprehensive video analysis tool!

## 💡 Tips

- Start with transcription first (simpler implementation)
- Reuse as much of the original code as possible
- Keep the API key management consistent
- Test with small files first
- Use the same error handling patterns throughout

Good luck with the final integration! The foundation is solid and ready for the implementation details.
