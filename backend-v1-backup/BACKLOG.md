# Video Analysis Backend - Post-Launch Backlog

## High Priority

### 🔴 Audit Token Costs and Re-implement Explicit Caching
**Added:** 2026-01-09  
**Trigger:** If Gemini API costs exceed expected thresholds  
**Context:**  
- Explicit caching was disabled at launch due to API format issues with `@google/genai` SDK
- Google's implicit caching may already provide some cost reduction
- Current fallback (direct file upload each module) works but costs more tokens

**Action Items:**
1. Monitor Gemini API costs for 2-4 weeks post-launch
2. If costs are high, investigate `ai.caches.create()` API format with fresh documentation
3. Test with various video formats (mp4, mov, webm)
4. Ensure cache TTL and content format match current `@google/genai` standards
5. Re-enable `USE_CONTEXT_CACHING=true` after successful testing

**Reference Files:**
- `backend/src/services/contextCacheManager.ts` - Current implementation
- `backend/src/services/genaiClient.ts` - SDK adapter

**Expected Savings:** ~75% token cost reduction when caching works correctly

---

## Medium Priority

### 🟡 Remove Verification Script
- Delete `backend/scripts/verify_genai_connection.ts` after migration is stable
- This was a TDD script for SDK migration, not needed in production

---

## Notes
- SDK Migration completed: 2026-01-09
- Old SDK (`@google/generative-ai`) fully removed
- New SDK (`@google/genai`) v0.10.0 in use
