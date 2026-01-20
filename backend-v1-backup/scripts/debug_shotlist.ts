#!/usr/bin/env npx ts-node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DEBUG SCRIPT: ShotList Undefined Result Investigation
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This script helps diagnose why the shotList module returns undefined despite
 * showing as "completed". It queries Cloud Run logs for specific debug markers.
 * 
 * USAGE:
 *   1. Get the Job ID from the console (e.g., the one that failed)
 *   2. Run: npx ts-node scripts/debug_shotlist.ts <JOB_ID>
 *   
 *   OR manually check Cloud Run logs with:
 *   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-super-app-backend AND textPayload:VI-FLOW" --limit=50 --format="table(timestamp,textPayload)"
 * 
 * WHAT TO LOOK FOR:
 *   - [VI-FLOW] Step 5: "annotateVideo returned" - Did Video Intelligence respond?
 *   - [VI-FLOW] Step 7: "mapVideoIntelligenceToShots returned" - Any shots found?
 *   - [VI-FLOW] Step 9: "ASSIGNED!" - Was results.shotList set?
 *   - [DEBUG-MODULE] "partialResults.shotList exists" - Was it in the returned object?
 *   - [DEBUG-MODULE] "Extracted data for 'shotList'" - Final verdict
 * 
 * COMMON ISSUES:
 *   1. Video Intelligence API returns empty shotAnnotations for short videos
 *   2. The video is not in GCS (only has Gemini URI) - VI API requires gs://
 *   3. Rate limiting (429) on Video Intelligence API
 *   4. mapVideoIntelligenceToShots parsing error
 * 
 * @date 2026-01-11
 */

const JOB_ID = process.argv[2];

if (!JOB_ID) {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🔍 DEBUG: ShotList Undefined Result                       ║
╚════════════════════════════════════════════════════════════╝

USAGE: npx ts-node scripts/debug_shotlist.ts <JOB_ID>

ALTERNATIVES (check Cloud Run logs directly):

1. View VI-FLOW debug logs:
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-super-app-backend AND textPayload:VI-FLOW" --limit=50 --format="table(timestamp,textPayload)"

2. View module processing logs:
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-super-app-backend AND textPayload:DEBUG-MODULE AND textPayload:shotList" --limit=30 --format="table(timestamp,textPayload)"

3. View errors:
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-super-app-backend AND textPayload:ERROR" --limit=20 --format="table(timestamp,textPayload)"

KEY DEBUG MARKERS TO LOOK FOR:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[VI-FLOW] Step 1: hasValidGcsUri=<true/false>
  → If FALSE: Video is not in GCS, only in Gemini. VI API will be skipped.

[VI-FLOW] Step 5: annotateVideo returned. Result type: object
  → Confirms Video Intelligence API responded

[VI-FLOW] Step 7: mapVideoIntelligenceToShots returned. Length: <N>
  → Number of shots detected. If 0, no scene changes found.

[VI-FLOW] Step 9: ASSIGNED! results.shotList exists: true, length: <N>
  → Confirms assignment to results object

[DEBUG-MODULE] partialResults.shotList exists: <true/false>
  → If FALSE here but Step 9 said TRUE, there's a return bug

[DEBUG-MODULE] Extracted data for 'shotList': exists=<true/false>
  → FINAL TRUTH: Whether data will be saved to Firestore

HYPOTHESIS FOR UNDEFINED:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If shots are detected but the frontend shows undefined, check:

1. Is the Gemini enrichment step failing silently?
   → Look for: "[ShotEnrich] ✗✗✗ ENRICHMENT FAILED ✗✗✗"
   → Run: gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-super-app-backend AND textPayload:ShotEnrich" --limit=30

2. Check enrichment result quality:
   → Look for: "[VI-FLOW] Step 7f: Sample description"
   → If "isPlaceholder: true" - enrichment returned but with empty descriptions

3. Common enrichment failures:
   - 429 RATE_LIMITED: Too many API calls (video too long, too many shots)
   - 504 DEADLINE_EXCEEDED: Enrichment took too long (>60s)
   - 400 INVALID_ARGUMENT: Shot context too large for token limit

4. Is the storage save failing?
   → Look for: "[DEBUG-MODULE] Saving result to storage..."
   → Then: "[DEBUG-MODULE] Result saved"

5. Is Firestore update failing?
   → Any errors after "Result saved"
`);
    process.exit(0);
}

console.log(`
╔════════════════════════════════════════════════════════════╗
║  🔍 Debugging ShotList for Job: ${JOB_ID.substring(0, 20)}...
╚════════════════════════════════════════════════════════════╝

Run this command to see the full log trace:

gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-super-app-backend AND (textPayload:VI-FLOW OR textPayload:DEBUG-MODULE) AND textPayload:${JOB_ID.substring(0, 10)}" --limit=100 --format="table(timestamp,textPayload)"

Or for the last hour of all shotList activity:

gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-super-app-backend AND textPayload:shotList" --freshness=1h --format="table(timestamp,textPayload)" --limit=50
`);
