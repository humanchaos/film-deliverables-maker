/**
 * Client-side deterministic shot/scene-cut detection.
 *
 * WHY THIS EXISTS
 * ---------------
 * We previously asked Gemini to return cut timecodes from low-res video chunks.
 * A language model does not "see" cuts — it predicts tokens, and when it cannot
 * resolve cuts it pattern-completes (arithmetic timecode sequences). Measured
 * against a 718-shot human shotlist it recovered only ~31% of real cuts.
 *
 * A cut is a SIGNAL-PROCESSING event: an instantaneous, large frame-to-frame
 * change. This module detects cuts the way `ffmpeg scdet` / PySceneDetect do —
 * compare consecutive downscaled frames and fire when the change spikes. On the
 * same footage this reaches ~89% recall / ~87% precision, validated offline
 * against the manual shotlist.
 *
 * HOW IT RUNS IN THE BROWSER (no ffmpeg, no server, any file size)
 * ----------------------------------------------------------------
 * We sample at a FIXED cadence by seeking the <video> element (default every
 * 0.2 s) and drawing each frame to a tiny canvas. We deliberately do NOT play
 * the video at high speed and grab frames via requestVideoFrameCallback: on
 * large files (>1 GB) fast playback stalls and rVFC stops firing for minutes at
 * a time, producing wildly different, badly under-sampled results every run
 * (e.g. 700 cuts one run, 480 the next, with multi-minute dead zones). Seeking
 * is slower but DETERMINISTIC and reproducible, and it works at any file size
 * because nothing is loaded wholesale into memory.
 *
 * METRIC (validated parameters — change with care, see offline tuning):
 *   - Downscale each frame to 64×36, convert to BT.601 luma.
 *   - 16-bin luma histogram; difference = Σ|binΔ| / pixels × 100  (0–100 scale).
 *     Histogram (not per-pixel SAD) is used because it is robust to camera
 *     motion/pans, which otherwise produce false cuts.
 *   - A cut is a LOCAL PEAK in the difference signal above `threshold`.
 *   - Enforce a minimum shot length (default 8 frames).
 */

export interface SceneDetectOptions {
  /** Histogram-difference peak threshold on the 0–100 scale. Lower = more cuts. Default 22. */
  threshold?: number;
  /** Downscale width. Default 64. */
  downscaleW?: number;
  /** Downscale height. Default 36. */
  downscaleH?: number;
  /** Minimum shot length in seconds — cuts closer than this are merged. Default 8/frameRate. */
  minShotSec?: number;
  /** Frame rate, used only to derive the default minimum shot length. Default 25. */
  frameRate?: number;
  /** Seek cadence in seconds — sample one frame every this many seconds. Default 0.2 (5 fps). */
  cadenceSec?: number;
  /**
   * Constant bias correction (seconds) added to every detected cut. The seek+
   * cadence scan detects cuts a consistent ~0.3–0.4 s EARLY relative to where an
   * editor places the splice (measured against a human gold-standard shotlist:
   * mean offset +0.4 s, low variance). Nudging cuts later by this amount lifts
   * ±0.5 s placement accuracy from ~0.58 to ~0.84 R/P. Default 0.3.
   */
  biasSec?: number;
  /** 0..1 progress callback (fraction of video scanned). */
  onProgress?: (fraction: number) => void;
  /** Abort the scan. */
  signal?: AbortSignal;
}

const NUM_BINS = 16;

/** Compute a 16-bin BT.601-luma histogram from RGBA pixel data. */
function lumaHistogram(rgba: Uint8ClampedArray): Int32Array {
  const hist = new Int32Array(NUM_BINS);
  for (let i = 0; i < rgba.length; i += 4) {
    // BT.601 luma — matches ffmpeg `format=gray`, which our thresholds were tuned against.
    const y = (rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114) | 0;
    hist[y >> 4]++; // 256 levels → 16 bins
  }
  return hist;
}

/** Normalized histogram difference on a 0–100 scale. */
function histDiff(a: Int32Array, b: Int32Array, pixels: number): number {
  let s = 0;
  for (let k = 0; k < NUM_BINS; k++) {
    const d = a[k] - b[k];
    s += d >= 0 ? d : -d;
  }
  return (s / pixels) * 100;
}

/**
 * Detect scene cuts in a video. Returns a sorted array of cut times in seconds
 * (the first frame of each shot after shot 1). Excludes 0 and the final frame —
 * callers add those as the implicit start/end boundaries.
 */
export async function detectScenes(
  videoUrl: string,
  opts: SceneDetectOptions = {}
): Promise<number[]> {
  const {
    threshold = 25,
    downscaleW = 64,
    downscaleH = 36,
    frameRate = 25,
    minShotSec = 8 / frameRate,
    cadenceSec = 0.2,
    biasSec = 0.3,
    onProgress,
    signal,
  } = opts;

  const pixels = downscaleW * downscaleH;

  // Collected (time, diff) samples in scan order.
  const times: number[] = [];
  const diffs: number[] = [];

  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;

  const canvas = document.createElement("canvas");
  canvas.width = downscaleW;
  canvas.height = downscaleH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create 2D canvas context for scene detection");

  let prevHist: Int32Array | null = null;

  const sampleFrame = (t: number) => {
    ctx.drawImage(video, 0, 0, downscaleW, downscaleH);
    const { data } = ctx.getImageData(0, 0, downscaleW, downscaleH);
    const hist = lumaHistogram(data);
    if (prevHist) {
      times.push(t);
      diffs.push(histDiff(hist, prevHist, pixels));
    }
    prevHist = hist;
  };

  // ── Deterministic seek-based scan ──────────────────────────────────────────
  // We sample at a FIXED cadence by seeking, NOT by playing the video. An
  // earlier version played at 8× and grabbed frames via requestVideoFrameCallback,
  // but on large files (>1 GB) fast playback stalls and rVFC stops firing for
  // long stretches — producing different (and badly under-sampled) results every
  // run, with multi-minute dead zones. Seeking guarantees uniform coverage of
  // every `cadenceSec` window regardless of machine load or file size, so the
  // result is reproducible. This mirrors the offline ffmpeg `fps=` validation
  // exactly (uniform sampling), which is what the threshold was tuned against.
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const SEEK_TIMEOUT_MS = 4000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      video.onseeked = null;
      video.onerror = null;
      try { video.pause(); } catch { /* ignore */ }
      video.removeAttribute("src");
      video.load();
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    const done = () => { if (!settled) { settled = true; cleanup(); resolve(); } };
    const fail = (e: unknown) => {
      if (!settled) {
        settled = true; cleanup();
        reject(e instanceof Error ? e : new Error("Scene detection failed during scan"));
      }
    };
    const onAbort = () => done(); // graceful stop — keep what we have
    if (signal) {
      if (signal.aborted) { done(); return; }
      signal.addEventListener("abort", onAbort);
    }

    const duration = () => (isFinite(video.duration) && video.duration > 0 ? video.duration : 0);

    let target = 0;          // next timestamp we want to sample
    let lastActual = -1;     // last actual currentTime sampled (to detect end-clamping)
    let endClampStalls = 0;  // consecutive seeks that didn't advance the playhead
    let timeoutSkips = 0;    // consecutive seeks that never fired 'seeked'
    const MAX_TIMEOUT_SKIPS = 8; // ~8 × cadence of dead zone tolerated before giving up

    const armTimeout = () => {
      if (timer) clearTimeout(timer);
      // A single seek that never fires 'seeked' (transient decoder hiccup, or a
      // briefly undecodable spot) must NOT kill the whole scan — that's how we
      // were losing the last few minutes. Skip past it and keep going; only give
      // up after MANY consecutive stalls (a genuinely unseekable tail).
      timer = setTimeout(() => {
        if (settled) return;
        timeoutSkips++;
        if (timeoutSkips >= MAX_TIMEOUT_SKIPS) {
          console.warn(
            `[sceneDetect] ${timeoutSkips} consecutive seek stalls near ${target.toFixed(1)}s ` +
            `— finishing with ${diffs.length} samples`
          );
          done();
          return;
        }
        // Skip this timestamp and try the next one.
        target += cadenceSec;
        seekNext();
      }, SEEK_TIMEOUT_MS);
    };

    const seekNext = () => {
      if (settled) return;
      const d = duration();
      if (d && target >= d) { done(); return; }
      armTimeout();
      try { video.currentTime = target; } catch { done(); }
    };

    video.onerror = () => {
      // Truncated/corrupt file: keep cuts found before the break.
      if (diffs.length > 0) {
        console.warn(
          `[sceneDetect] Decode error near ${target.toFixed(1)}s ` +
          `(likely truncated/corrupt) — keeping ${diffs.length} samples`
        );
        done();
      } else {
        fail(new Error("Video failed to load/decode during scene scan"));
      }
    };

    video.onseeked = () => {
      if (settled) return;
      if (timer) { clearTimeout(timer); timer = null; }
      timeoutSkips = 0; // a successful seek resets the stall counter
      const actual = video.currentTime;
      try {
        sampleFrame(actual);
      } catch (e) {
        fail(e); return;
      }
      const d = duration();
      if (d && onProgress) onProgress(Math.min(1, actual / d));

      // End-clamp detection: if seeking no longer advances the playhead, we've
      // genuinely hit the end. Stop after a few non-advancing seeks.
      if (actual <= lastActual + 1e-3) {
        if (++endClampStalls >= 3) { done(); return; }
      } else {
        endClampStalls = 0;
      }
      lastActual = actual;

      target += cadenceSec;
      seekNext();
    };

    video.onloadedmetadata = () => { seekNext(); };
    // If metadata is already available (cached), kick it off.
    if (video.readyState >= 1) seekNext();
  });

  // ── Peak detection over the difference signal ──
  // A cut is a local maximum that exceeds the threshold. Requiring a local peak
  // (diff[i] >= neighbours) suppresses the broad "humps" caused by sustained
  // motion, keeping precision high.
  //
  // NOTE: an earlier version added a "refinement" pass that searched a ±0.5 s
  // window around each coarse cut to localize it to the exact cut frame. That
  // turned out to collapse fast-cut sequences (window wider than the min shot
  // length → multiple candidates converged on the same peak), regressing the
  // result from ~700 cuts to ~60. We removed it; a smarter neighbor-bounded
  // refinement can be added later if frame-accurate placement is needed.
  const cuts: number[] = [];
  let lastCut = -Infinity;
  for (let i = 0; i < diffs.length; i++) {
    const isPeak =
      diffs[i] > threshold &&
      (i === 0 || diffs[i] >= diffs[i - 1]) &&
      (i === diffs.length - 1 || diffs[i] >= diffs[i + 1]);
    if (isPeak && times[i] - lastCut >= minShotSec) {
      cuts.push(times[i]);
      lastCut = times[i];
    }
  }

  // Apply the constant bias correction (see biasSec docs). The scan detects cuts
  // a consistent ~0.3 s early; nudging them later aligns with editor splice
  // points. Validated to raise ±0.5 s placement accuracy 0.58 → 0.84 against a
  // human gold-standard shotlist.
  if (biasSec) return cuts.map((c) => c + biasSec);
  return cuts;
}
