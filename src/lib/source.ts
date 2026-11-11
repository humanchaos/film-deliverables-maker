/**
 * Source-clip provenance resolution (Enrichment layer).
 *
 * From an EDL clip name we derive a best-effort human-readable Source now, and
 * flag uncertain entries as "pending_db" until the footage/rights database is
 * delivered. The raw clip name + source timecode are always retained upstream
 * (Structure layer) so the later DB join is exact.
 *
 * This is the ONLY early writer of `source`/`sourceConfidence`; the future DB
 * join overwrites them wholesale.
 */

export type SourceConfidence = "resolved" | "pending_db";

export interface ResolvedSource {
  source: string;
  confidence: SourceConfidence;
  raw: string;
}

// Camera-original patterns → own shoot. The roll may actually belong to another
// production (only the footage DB knows), so these stay "pending_db".
const CAMERA_RE = [
  /^A\d{3}C\d{3}/i,      // ARRI/Sony style: A006C051
  /^DJI[_-]?\d/i,        // drone
  /^P10\d{5}/i,          // Panasonic P1001311
  /^GH\d{6}/i,           // GH5 GH440160
  /^MVI[_-]?\d/i,        // Canon
  /^C\d{4}/i,            // Canon C-clips
  /^DSC[_-]?\d/i,
  /^IMG[_-]?\d/i,
];

/**
 * Resolve a Source value from an EDL clip name.
 * - Archive with an embedded production title / TMS number → resolved.
 * - Recognised camera-roll pattern → "Shoot/Eigendreh" + pending_db.
 * - Otherwise → raw clip name + pending_db.
 */
export function resolveSource(clipName: string | null): ResolvedSource {
  const raw = (clipName || "").trim();
  if (!raw) return { source: "", confidence: "pending_db", raw: "" };

  const upper = raw.toUpperCase();

  // Title + episode marker, e.g. "T0045_WILD SRI LANKA_EP3_COAST…",
  // "T0062_ISLANDS IN TIME_A WILDLIFE ODYSSEY_EP3…". The main title is the FIRST
  // segment after the TMS number — NOT the clause right before "_EP" (that's a
  // subtitle). Split on "_" or " - " and take the leading segment.
  const epMatch = raw.match(/EP\s*(\d+)/i);
  if (epMatch) {
    const stripped = raw.replace(/^T0\d{3}[_ ]+/i, ""); // drop leading TMS number
    const title = stripped.split(/_| - /)[0].replace(/\s+/g, " ").trim();
    if (title) return { source: `${titleCase(title)} - EP${epMatch[1]}`, confidence: "resolved", raw };
  }

  // Title-graphics / mixdowns (signature, titles).
  if (upper.includes("VIDEO MIXDOWN") || upper.includes("MIXDOWN") || /^TR\s/i.test(raw)) {
    return { source: "Title/Graphic", confidence: "pending_db", raw };
  }

  // Camera originals → own shoot (may be reused footage → pending_db).
  if (CAMERA_RE.some((re) => re.test(raw))) {
    return { source: "Shoot/Eigendreh", confidence: "pending_db", raw };
  }

  // A leading TMS number with a title but no EP, e.g. "T0114_TASMANIA...".
  const tms = raw.match(/^T0\d{3}[_ ]+([A-Za-z][A-Za-z0-9 .'\-]+?)(?:[_.,]|$)/);
  if (tms) {
    return { source: titleCase(tms[1].replace(/[_]+/g, " ").trim()), confidence: "resolved", raw };
  }

  // Fallback: show the raw clip name, mark for DB.
  return { source: raw.split(/[.,]/)[0], confidence: "pending_db", raw };
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
