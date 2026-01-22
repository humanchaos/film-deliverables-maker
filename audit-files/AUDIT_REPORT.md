# V2 Backend Issue - Audit Report

## Problem Summary
Video analysis jobs hang at 10% progress when processing large files (~920MB).

## Root Cause
The `uploadToGemini()` function in `gemini.ts` (lines 44-105) performs these operations:
1. Downloads video from GCS to a temp file
2. Reads the **entire file into memory** with `fs.readFileSync()`
3. Creates a Blob and uploads to Gemini Files API

For a 920MB file, this:
- Uses ~1.8GB memory (file + Blob buffer)
- Takes 10+ minutes to upload
- Often times out or causes Cloud Run to restart

## Files in This Folder

| File | Lines | Description |
|------|-------|-------------|
| `gemini.ts` | 44-105 | **ISSUE HERE** - `uploadToGemini()` function |
| `worker.ts` | 50-63 | Calls `uploadToGemini()` when `geminiFileUri` is missing |
| `jobs.ts` | 123-140 | Job creation, triggers worker via HTTP call |
| `api.ts` | full | Frontend API client |
| `analysisCoordinator.ts` | full | Frontend analysis orchestration |
| `types_v2.ts` | full | Shared TypeScript types |

## Suggested Solutions

### Option A: Pass Gemini URI from Frontend
The frontend already uploads to Gemini Files API (see console: `[Upload] Gemini upload complete`).
Modify `CreateJobRequest` type and `createJob` controller to accept and store `geminiFileUri`.

### Option B: Streaming Upload
Replace `fs.readFileSync()` with streaming:
```typescript
const stream = fs.createReadStream(tempPath);
// Use stream-based upload if SDK supports it
```

### Option C: Skip Backend Re-upload
If frontend already uploaded to Gemini, backend should use that URI instead of re-uploading.

## Cloud Run Configuration
- Memory: 2Gi (insufficient for 920MB file + buffers)
- Timeout: 3600s
- Region: europe-west3

## Deployment
```bash
gcloud run deploy gemini-super-app-backend \
  --source ./backend \
  --region europe-west3 \
  --project gen-lang-client-0431510360 \
  --memory 4Gi \  # Increase for large files
  --timeout 3600
```

## Questions for Audit
1. Does the Gemini SDK support streaming uploads?
2. Can we pass the frontend's Gemini URI to the backend?
3. Should we increase Cloud Run memory to 4Gi or 8Gi?
