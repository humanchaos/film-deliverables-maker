# EDL-Driven Shot List Pipeline — Design

**Date:** 2026-06-03
**Status:** Approved (design), pending implementation plan
**App:** Film Deliverables Maker (`never-v2`, deployed `film-deliverables-maker.vercel.app`)

## Problem

The shot list is currently produced by client-side frame-difference cut detection
(`src/lib/sceneDetect.ts`) plus per-shot Gemini description. Measured against a
718-shot human gold shotlist ("Secrets in the Scat", T0189), the video-only path
plateaus at:

- Cut placement: ~0.90 recall / ~0.91 precision at ±1.0s; ~0.58 at ±0.5s; a
  consistent ~+0.4s bias (partially corrected).
- ~10% of editorial cuts are undetectable from pixels (dissolves, match-cuts,
  cuts between visually similar shots).
- Four of the nine gold columns — **Source, Location, Originator/Licensor,
  Rights** — cannot be derived from pixels at all.

The human shotlist was not produced by watching the rendered video; it was
derived from the **edit project** (timeline + source-clip metadata). An EDL
export of the locked sequence therefore contains the data pixels threw away.

### Proof (measured 2026-06-03)

Parsing `T0189_Secrets in the Scat_EDL INTs.edl` and diffing record-in cut points
against the manual `.xls`:

| Tolerance | Recall | Precision |
|---|---|---|
| Exact frame | 0.999 (716/717) | 0.996 |
| ±2 frames | **1.000 (717/717)** | 0.997 |

720 events, all hard cuts (`C`), `FCM: NON-DROP FRAME`, 25fps, record TC based at
`10:00:00:00`. `* FROM CLIP NAME:` comments present and rich (e.g.
`T0045_WILD SRI LANKA_EP3_COAST OF GIANTS_EN INT` → gold Source "Wild Sri Lanka -
EP3"). Source In/Out timecodes present per event. 116 `M2` speed-ramp lines, 0
dissolves in this file.

## Goals

1. Make EDL the primary source of cuts when present — frame-exact, instant.
2. Derive a best-effort Source column now from clip names; be ready to finish
   Source/Location/Originator/Rights from a footage/rights database later.
3. Improve description quality using the exact in/out the EDL provides.
4. Keep the existing video-only path as a clearly-signposted fallback.
5. Build the EDL parser as a reusable foundation for later modules (Graphics,
   Talent) — not shots-only.

## Non-Goals

- Footage/rights DB integration logic (the **input slot** is built now; the join
  is a later milestone — the DB will be delivered later).
- AAF parsing (binary; out of scope — EDL and FCPXML only).
- Changing the other deliverable modules (Dialogue, Graphics, etc.) in this work.

## Key Decisions (from brainstorming)

1. **Granularity:** one shot-list row per EDL event (1:1), no merge heuristics.
   **Dissolves** (CMX represents a dissolve as a pair: an outgoing `C` event that
   anchors the transition, followed by an incoming `D` event carrying the
   dissolve duration and the new clip): both events become rows. The outgoing
   `C` row ends at the dissolve start; the incoming `D` row begins there — i.e.
   **the `D` event's record-in is the cut boundary** (new shot start), and the
   row is flagged `transition: "dissolve"` with its duration. Wipes/keys
   (`W###`, `K`/`KB`) are treated the same as a cut for boundary purposes and
   flagged with their transition type. No event is dropped or duplicated.
2. **Descriptions:** three frames per shot — **in + middle + out** — sent in a
   single Gemini call, so motion/action is captured.
3. **Source now:** clip-name heuristic with a **"⚠ pending DB" flag** on
   uncertain (raw camera-roll) entries; raw clip name + source TC always retained
   for the later exact join.
4. **Input model:** A + C — EDL and footage-DB are **optional project inputs**;
   the shot list prefers EDL cuts when present and falls back to frame-diff when
   not. An EDL works even before/without the video (clearance list); the video
   adds descriptions. A banner makes clear EDL is strongly recommended and states
   the downside of omitting it.
5. **Output timecode base:** preserve the EDL's **own** record TC base (whatever
   it is — `10:00:00:00` for T0189, but EDLs also use `01:00:00:00`,
   `00:59:30:00`, etc.) so output matches the house gold list. This base is read
   from the EDL, never hard-coded. Video-only mode keeps `00:00:00:00`.

## Architecture: Three Independent Layers

Each shot is assembled from three layers that recompute independently:

| Layer | Source | Fields | Recompute trigger |
|---|---|---|---|
| **Structure** | EDL (or frame-diff fallback) | shotNumber, tcIn, tcOut, duration, sourceClip, sourceInTC, sourceOutTC, motion/speed | new EDL |
| **Description** | MP4 + Gemini | description, sceneType, cameraMovement, notes | re-run descriptions |
| **Enrichment** | footage/rights DB (later) | source (resolved), location, originator, rights, sourceConfidence | new DB / new EDL |

Adding the DB later re-runs only Enrichment; descriptions and structure are
untouched. Re-running descriptions leaves structure and enrichment intact.

## Components

### `src/lib/edl.ts` (new, reusable)
Pure parser, no DOM/AI. Parses CMX 3600:
- Event lines → `{ num, reel, track, editType, transition, srcInTC, srcOutTC, recInTC, recOutTC }`.
- **Track filter:** treat `V` and `B` (B = video+audio on one event) as video;
  ignore pure-audio events (`A`, `A2`, `AA`, `NONE`). Event-number (`num`) gaps
  from ignored audio events are expected — **`shotNumber` is assigned by
  sequential position among kept rows, never derived from `num`**.
- `FCM:` line → drop-frame flag. FCM may appear multiple times; the **most recent
  FCM applies to subsequent events** (not assumed file-global).
- `M2` lines → speed value attached to the preceding event (not a separate row).
- Edit type: `C` = cut; `D` = dissolve (see Decisions #1 — D's record-in is the
  boundary, flagged `transition: "dissolve"` + duration); `W###`/`K`/`KB` =
  wipe/key, treated as a cut boundary and flagged with the transition type.
- `* FROM CLIP NAME:` → clipName (first one wins). Other comments
  (`* TO CLIP NAME`, `* COMMENT`, `* SOURCE FILE`, blank/notes) are ignored, not
  treated as errors.
- Malformed event line → skipped with a counted warning; never aborts the parse.

Output: `{ startTC: string, dropFrame: boolean, fps: number, events: EdlEvent[] }`,
where `startTC` is the first kept event's record-in (read from the file).
FCPXML support is a sibling parser behind the same output type (later; EDL first).

### `src/lib/store.ts` — generation
- `runShotListFromEdl()`: build 1 row/event (Structure) → extract in/mid/out
  frames per row from the cached MP4 at `recTC − startOffset` → one Gemini call
  per row (Description) → clip-name Source resolution (Enrichment-now). Preserves
  EDL record TC in output.
- Existing `runShotListTwoPass()` (frame-diff) becomes the explicit fallback when
  no EDL is attached.
- A dispatcher chooses EDL path vs fallback based on `project.edl` presence.

### Source resolution (`src/lib/source.ts`, new)
`resolveSource(clipName): { source, confidence: 'resolved' | 'pending_db', raw }`.
Heuristics: production-title/EP pattern and TMS number (`T0045_…`) → resolved;
camera-roll patterns (`A###C###`, `DJI_`, `P10##`, `GH#`, …) → "Shoot/Eigendreh"
+ `pending_db`; otherwise raw clip name + `pending_db`. Always returns `raw` (clip
name) + source TC for the future DB join.

**Layer ownership:** `resolveSource` output populates **Enrichment-layer** fields
(`source`, `sourceConfidence`), even though it runs during the EDL pass for
convenience. The later footage-DB join is the *only other* writer of these
fields and overwrites them wholesale — there are never two code paths racing to
set `source`. Structure-layer fields (`sourceClip`, `sourceInTC`, `sourceOutTC`)
are immutable provenance and are what the DB join keys on.

### Persistence
- Parsed EDL cached in **IndexedDB** alongside the video blob (a 720-event EDL
  serializes to ~100–200KB; localStorage is a ~5MB shared budget already holding
  project state, so EDL goes to IndexedDB to avoid pressure). The lightweight
  reference (filename, event count, startTC) lives in the localStorage project
  record; the full parsed events live in IndexedDB.
- `Project` gains `edl?` (reference + cached parse) and `footageDb?` (later). Shot
  records carry the layered fields above plus `sourceConfidence` and `transition`.

### UI (`DeliverablesPanel` / `Upload` / `SettingsPanel`)
- Two optional inputs: **Attach EDL/FCPXML**, **Attach footage DB (CSV)** (inert
  until DB milestone).
- EDL-recommended banner with the stated downside copy when no EDL is attached.
- Per-row provenance badges: `cut: EDL ✓` / `source: ⚠ pending DB`.

## Data Flow (EDL mode)

```
EDL file ─▶ edl.ts parse ─▶ EdlEvent[]  (Structure: cuts, TC, src clip+TC, speed)
                                  │
   cached MP4 ◀───────────────────┤  per row: extract in/mid/out frames
        │                          │           (recTC − startOffset)
        ▼                          ▼
   3 frames ─▶ Gemini (1 call) ─▶ description/sceneType/movement/notes (Description)
                                  │
   clipName ─▶ resolveSource ─▶ source + confidence + raw  (Enrichment-now)
                                  │
                                  ▼
                         assembled shot row (10h TC base) ─▶ display + export
```

Fallback mode replaces the first stage with `sceneDetect` (pixels) and omits the
Enrichment layer (no provenance available).

## Timecode Handling

- EDL record TC is the timeline position. The base is **read from the EDL** (the
  first kept event's record-in) — never hard-coded. Output preserves this base.
- Frame extraction needs MP4-relative time: `extractAt = recTC − startOffset`,
  where `startOffset` = the first kept event's record-in (dynamic; could be
  `01:00:00:00`, `00:59:30:00`, `10:00:00:00`, …). No literal `10h` anywhere in
  the offset math.
- **MP4 start-TC assumption (explicit):** the browser `<video>`/canvas extractor
  indexes from `currentTime = 0`. We assume **MP4 frame 0 == EDL first
  record-in**, i.e. the rendered master has no baked-in pre-roll/bars and its
  embedded tmcd start-TC is ignored. If this assumption is wrong, *every* frame
  is offset by a constant and every description is silently for the wrong shot —
  so it must be verified, not assumed (see alignment check below).
- FCM determines drop-frame; parser reads the most-recent FCM per event.

### Alignment check (offset, not just duration)
A duration match is necessary but NOT sufficient (two different cuts of equal
length pass it). To catch a constant frame offset (M3):
1. **Duration gate:** MP4 length within ±1s of EDL total record duration; else
   warn.
2. **Offset probe:** sample ~5 EDL cut boundaries spread across the timeline; for
   each, extract the frames just before and just after the predicted MP4 time and
   confirm a visual discontinuity (histogram delta spike, reusing `sceneDetect`'s
   diff). If the discontinuities don't line up, the MP4 has an offset/pre-roll —
   surface a clear warning with the estimated offset and let the user confirm or
   correct it. This turns "trust me" into a verified alignment.

## Error Handling

- Malformed EDL event line → skip with a counted warning; never abort the parse.
  Non-event lines (comments other than FROM CLIP NAME, blanks, notes) are ignored,
  not counted as errors.
- Multiple `FROM CLIP NAME` → first wins.
- Audio-only events → ignored; their `num` gaps do not affect `shotNumber`
  (assigned by kept-row position).
- MP4 missing/not cached → Structure + Source still produced; descriptions show
  "[video required]" (EDL-first/clearance-list mode).
- EDL/MP4 **offset or length mismatch** (from the alignment check) → clear banner
  warning with the estimated offset; proceed only on user confirmation, since a
  bad offset silently mis-describes every shot.
- Frame extraction failure for a row → description "[frame missing]", row kept.

## Testing / Validation

- **Parser unit tests:** the T0189 EDL → 720 kept (video) events → 719 distinct
  record-in cut boundaries (events − 1); sample events match expected src/rec TC
  and clip names; M2 lines attached not rowed.
- **Count reconciliation (document in test):** EDL yields **719** cut boundaries;
  the human list has **717**. The 2-cut difference is the human merging a couple
  of same-clip speed-ramp splits into one shot (we keep them split per Decision
  #1/B). Cut-parity is therefore measured as **recall of manual cuts found in the
  EDL set** (716/717 = 0.999 exact-frame), not raw count equality. Lock 0.999 as
  the regression threshold.
- **Synthetic dissolve fixture:** a hand-authored EDL with a `C`→`D` dissolve pair
  and a `W###` wipe → assert both produce rows, the D/W record-in is the boundary,
  `transition` is flagged, and no row is dropped/duplicated (the T0189 file has
  none, so this path needs its own fixture).
- **Non-10h-base fixture:** a small EDL based at `01:00:00:00` → assert
  `startOffset` is read dynamically and frame-extraction times are correct (guards
  against any hard-coded 10h).
- **Mixed-track fixture:** interleaved `A`/`B`/`V` events with `num` gaps → assert
  audio ignored, `shotNumber` sequential, counts correct.
- **Source heuristic:** archive-with-title rows resolve to the gold Source value;
  camera rolls flagged `pending_db`; spot-check against the manual Source column.
- **Description quality:** manual spot-check vs gold wording/scene-type on a
  sample; confirm 3-frame captures action the single-frame missed.
- **Fallback unchanged:** video-only path still produces its prior result.

## Rollout

1. `edl.ts` parser + unit tests.
2. Source resolver + tests.
3. Layered shot data model + EDL generation path + dispatcher.
4. UI: EDL input, banner, provenance badges; inert DB slot.
5. Validate against T0189 gold; ship behind the existing two-pass button (EDL
   used automatically when attached).
6. (Later milestone) footage-DB CSV join → finishes Source/Location/Originator/
   Rights.
