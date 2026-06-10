# HANDOFF — Never v3 Film Deliverables Generator

## 1. Architecture

### Overview
A Next.js app (never-v2 repo, deployed as never-v2.vercel.app) that generates broadcast deliverables (shot lists, dialogue, graphics, synopses, talent bios, fauna log) from an uploaded video file. All AI work happens **client-side in the browser** — no server functions are involved in upload or analysis.

### Key files
| File | Role |
|------|------|
| `src/lib/store.ts` | Central state + analysis engine. Owns `runAnalysis()`, `shiftTc()`, `tcToSec()`, `truncateHallucinationLoop()`, `applyResults()`, `parseJsonResponse()`, cancel flags, progress map. |
| `src/lib/types.ts` | All shared types: `AnalysisType`, `ShotEntry`, `DialogueEntry`, etc. |
| `src/lib/prompts.ts` | Gemini prompt strings for each analysis type. Includes shared `ANTI_REPETITION_INSTRUCTION` and `TC_INSTRUCTIONS`. |
| `src/lib/export.ts` | CSV export functions. |
| `src/lib/export-industry.ts` | PDF / DOCX export (lazy-loaded). |
| `src/components/DeliverablesPanel.tsx` | Main UI: tabs, action bar, progress display, export menus, per-type result tables. |
| `src/components/Sidebar.tsx` | File upload, settings, version number. |
| `src/components/SettingsPanel.tsx` | Frame rate, drop-frame, language, broadcaster settings. |
| `src/components/UploadPanel.tsx` | File upload zone only — settings block removed in v0.3.9. |
| `next.config.ts` | **Source of truth for `NEXT_PUBLIC_APP_VERSION`** — update this, not `.env.local`. |

### Analysis flow
1. User uploads video → `ai.files.upload()` (Gemini Files API, browser-to-Gemini directly, no server).
2. `runAnalysis(type)` called → video duration checked.
3. Videos > 25 min are split into 5-min chunks (`CHUNK_MINUTES = 5`, `CHUNK_THRESHOLD_SEC = 25 * 60`). Each chunk uses `videoMetadata.startOffset / endOffset` to clip server-side. Each chunk **extends 20 seconds past its nominal end** (`OVERLAP_SEC = 20`) so shots crossing a boundary are fully visible in at least one chunk.
4. For each chunk: Gemini 2.5 Flash → JSON response → `truncateHallucinationLoop()` (pre-parse) → `parseJsonResponse()` (3-strategy repair) → `shiftTc()` to convert chunk-relative timecodes to absolute.
5. Results accumulated in `allEntries[]`, exact-key deduped, then boundary-stitched (see below), then type-specific post-processing, then written to store via `applyResults()`.
6. UI subscribes to store via `subscribeAnalysis()`.

### Chunk boundary handling (v0.3.5+)
Two complementary passes run after all chunks complete:

**Exact-key dedup** (`store.ts` ~line 515): drops entries where `tcIn|tcOut` is identical across chunks.

**Boundary stitch** (`store.ts` ~line 533): detects shots split at seam boundaries. For each entry whose `tcIn` is within 3 seconds of a nominal 5-minute mark (`tcInSec % 300 < 3` or `> 297`) **and** whose previous entry already covers that time, the entry is discarded and the previous entry's `tcOut` is extended if needed. This merges the two halves of a shot that straddles a boundary into one entry.

### Cancel mechanism (store-level — COMPLETE)
- `_cancelFlags: Map<string, boolean>` — checked at the top of each chunk iteration.
- `cancelAnalysis(type)` / `cancelAllAnalyses()` — exported from store.
- Cancel flag cleared in `finally` block after the loop.

### Progress tracking (store-level — COMPLETE)
- `_analysisProgress: Map<string, { currentMin, totalMin }>` — set before each chunk starts.
- `getAnalysisState()` returns `{ analyzing, errors, progress }` as a snapshot.
- UI reads this via `analysisState.progress[activeTab]`.

---

## 2. Completed Work

### Infrastructure
- [x] All AI calls moved client-side (Gemini Files API from browser) — no Vercel function timeouts.
- [x] GCS + server-side API routes (`get-upload-url`, `register-file`, `file-status`) deleted.
- [x] Deployed as `never-v2.vercel.app` with Deployment Protection disabled for public access.

### Analysis engine (store.ts)
- [x] Chunked analysis with `videoMetadata` clipping (5-min chunks).
- [x] `shiftTc()` converts chunk-relative timecodes to absolute using frame arithmetic.
- [x] `tcToSec()` helper parses TC string to whole seconds (used for absolute-TC detection).
- [x] `parseJsonResponse()` with 3-strategy JSON repair for MAX_TOKENS truncation.
- [x] Per-chunk error isolation (one failed chunk does not abort the whole run).
- [x] Progressive UI updates — results appear after each chunk completes.
- [x] Cancel flags: `cancelAnalysis(type)` / `cancelAllAnalyses()` implemented and wired into chunk loop.
- [x] Dedup at chunk boundaries using `tcIn|tcOut` composite key.
- [x] New upload purges all previous deliverables.
- [x] **v0.3.1 — Timecode double-shift fix:** `processWindow()` now detects if Gemini returned already-absolute TCs (first entry's `tcIn` ≥ chunk `startMin`) and skips shifting. Diagnostic console logs show which path is taken per chunk. Prompt also updated to tell Gemini timecodes must start at `00:00:00:00` relative to the clip.
- [x] **v0.3.2 — Hallucination loop prevention (3-layer):**
  - `ANTI_REPETITION_INSTRUCTION` injected into all 5 list-type prompts (shot_list, dialogue, graphics, talent_bios, fauna_log) — tells Gemini to stop when real content ends.
  - `truncateHallucinationLoop()` scans raw response text for 60-char window repeated ×4, truncates at first repeat and closes JSON cleanly — fires before `parseJsonResponse()`.
  - `maxOutputTokens` reduced 65535 → 32768 — caps how far a loop can run; MAX_TOKENS split-and-retry handles legitimate long content.
  - `dedupeRepetitions()` retained as final safety net.
- [x] **v0.3.3 — Fauna + talent bios hallucination hardening (3-layer, both files):**
  - `parseConfidence()` helper normalises both `"95%"` strings and `0.95` floats.
  - `isValidTc()` helper rejects impossible timecodes (minutes or seconds ≥ 60).
  - `clipEndTC` computed via `shiftTc("00:00:00:00", durationSec, ...)` and injected into `FAUNA_LOG_PROMPT` and `TALENT_BIOS_PROMPT` so Gemini knows the hard ceiling.
  - **Fauna post-processing:** confidence filter (< 0.85 removed) → density cap (max 4 species per 60-second window, lowest confidence dropped first).
  - **Talent bios post-processing:** `appearances` array clamped to ≤ video duration and validated with `isValidTc()`; `firstAppearance` recovered from earliest valid appearance if out-of-bounds; opportunistic cross-reference against `graphicsList` lower-thirds.
  - **Prompt hardening (prompts.ts):** both prompts now include CLIP BOUNDS section; fauna prompt adds CONFIDENCE STANDARD section; bios prompt adds FIRST APPEARANCE instruction.
- [x] **v0.3.5 — Chunk overlap + boundary stitch:**
  - `OVERLAP_SEC = 20` constant added. Each chunk's `endMin` extended by `OVERLAP_SEC / 60`.
  - Boundary stitch pass added after exact-key dedup. Uses modulo arithmetic to detect entries near nominal 5-min marks; merges split shots by extending the earlier entry's `tcOut`.
  - **Bug fixed in v0.3.7:** stitch pass crashed with `Cannot set properties of undefined (setting 'tcOut')` when the first entry in `allEntries` had `tcIn ≈ 0` (passes `nearBoundary` check via modulo). Fixed by adding `prev &&` guard to the merge condition.
- [x] **v0.3.8 — Shot list post-processing hardening:**
  - Zero-length / inverted shot filter added to shot list post-processing block: drops any entry where `tcToSec(tcOut) <= tcToSec(tcIn)` before the 8-frame duration check runs.
- [x] **v0.4.0 — Validation layer + label normalization (store.ts + prompts.ts):**
  - Prompt: description field now explicitly requires max 20 words / 120 characters, one main action, no secondary details.
  - Label normalization: descriptions > 120 chars are auto-truncated; English stopwords in German-mode output logged as `[validate]` console warnings (no removal — data-safe QA flag only).
  - Test 3 (split-without-cut): consecutive shots where prev duration < 5 s AND descriptions share ≥2 significant words are merged. Controlled by `shotDescriptionsSimilar()` helper in `store.ts` — threshold is tunable.
  - Test 4 (micro-shot spam): > 3 sub-2s shots per 60-s window are reduced to 3, removing shortest first.
  - Tests 1 & 2 (hallucination vocabulary, interview coverage) require a Gold reference CSV not available at runtime — not implemented.

### Shot list prompt (prompts.ts)
- [x] **v0.3.4 — Description quality:** word limit raised to 25 words, field separation rule added, description guidance rewritten to "subject, action, and setting".
- [x] **v0.3.6 — Gold-alignment prompt rewrite:**
  - Opening changed from "log every camera cut" → "assume continuation" bias.
  - `CONTINUITY RULE` block added: explicit list of things that do NOT constitute a new shot (camera movement, reframing, subject motion, dissolves). "When uncertain, extend the current shot."
  - `DESCRIBE ONLY WHAT IS VISIBLE` block added: no invented objects/actions, static scenes stay static.
  - Description format updated: "location + primary subject + action or state", max 20 words, editor-label style.
- [x] **v0.3.8 — Continuity hysteresis:** added one sentence — "Once a shot has been running for more than 5 seconds, require clear and unambiguous visual evidence of a cut before ending it."

### UI
- [x] Elapsed timer, progress bar, tab badges, export menus, cancel buttons — all complete (pre-v0.3.5).
- [x] **v0.3.9 — Project Settings removed from Upload panel.** Settings (frame rate, drop-frame, broadcaster, language) now live exclusively in the Settings panel. `UploadPanel.tsx` no longer imports or renders the settings block.

---

## 3. Deployment notes

- **Live URL:** https://never-v2.vercel.app
- **Version source:** `next.config.ts` → `NEXT_PUBLIC_APP_VERSION`. Do not set this in `.env.local` — `next.config.ts` takes precedence and is what Vercel builds use.
- **Deploy command:** `cd ~/Downloads/Projects/Claude\ Rebuilds\ Never/never-v2 && PATH="/usr/local/bin:$PATH" npx vercel --prod`
- **Localhost issue:** Turbopack can't find `node` in the system PATH (macOS system processes don't see `/usr/local/bin`). Fix: `sudo ln -sf /usr/local/bin/node /usr/bin/node` then restart dev server. Until fixed, use production for testing.

---

## 4. Exact Next Step

### Test v0.4.0 against the pangolin clip

Run the 52-minute pangolin clip through **shot list** on never-v2.vercel.app (v0.3.9). Open DevTools console before starting. Watch for:

```
[analyze] Stitched boundary split at 00:05:xx:00 into previous shot (...)
[analyze] Boundary stitch merged N split shots
[analyze] Shot list: removed N invalid/micro shots (X → Y)
```

Compare against Gold standard:
- Shot count should be lower than v0.3.4 (continuity bias + hysteresis)
- Descriptions should read as editor labels ("Reef, diver descending") not narrations
- No shots split at 5:00, 10:00, 15:00 ... seams
- No zero-length or inverted entries in CSV export

Also run **fauna_log** and **talent_bios** to confirm v0.3.3 filters still hold:
- No fauna entries with confidence < 85%
- No bios appearances beyond clip duration

---

## 5. Roadmap (prioritised)

| Priority | Item | Location | Notes |
|----------|------|----------|-------|
| **Next** | Context-carry across chunks | `store.ts` + `prompts.ts` | Pass last 2–3 shot labels from chunk N into chunk N+1 prompt. Complements overlap by preserving editorial intent, not just pixels. |
| **Next** | Semantic condition on boundary stitch | `store.ts` | Current stitch merges on temporal proximity only. Upgrade: only merge if subject + location + scene type also match (fuzzy keyword overlap, not exact string). |
| **Later** | Confidence field for shots | `prompts.ts` + `store.ts` | Add optional `confidence` field to shot schema. Filter micro-shots created only to escape repetition. Requires prompt + schema + post-processing changes — not a drop-in. |

---

## 6. Known Bugs

| Bug | Symptoms | Suspected Cause |
|-----|----------|-----------------|
| **Shot count higher than Gold** | V3 produces more shots than human Gold standard | Partially addressed by v0.3.6 continuity bias + v0.3.8 hysteresis. Retest after v0.3.9 run. If still high, consider raising 8-frame minimum threshold. |
| **Count mismatch (dashboard vs CSV)** | Dashboard shows fewer shots than CSV row count | May be resolved by v0.3.4/v0.3.6 prompt fixes. Retest. |
| **Talent names "Unidentified"** | Talent bios don't always identify speakers by name | Graphics cross-reference (v0.3.3) partially addresses this. For persistent cases, run graphics_list first, then talent_bios. |

---

## 7. Pre-existing Tech Debt

| Item | Location | Notes |
|------|----------|-------|
| ~~**TS strict null error**~~ | ~~`store.ts:373`~~ | **Fixed in v0.3.3** |
