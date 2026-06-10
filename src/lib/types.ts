// ─── Core Project Types ───────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  videoFile: VideoFile | null;
  settings: ProjectSettings;
  status: ProjectStatus;
  deliverables: Deliverables;
  /** Attached EDL (parsed) — present when the user has imported an edit list. */
  edl?: EdlRef | null;
}

/** Lightweight EDL reference stored on the project (parsed events included; ~150KB). */
export interface EdlRef {
  fileName: string;
  startTC: string;
  dropFrame: boolean;
  fps: number;
  eventCount: number;
  // Parsed events kept inline for v1 (small). Typed loosely to avoid a types↔lib cycle.
  events: unknown[];
  warnings: string[];
}

export type ProjectStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "completed"
  | "error";

export interface VideoFile {
  name: string;
  size: number;
  type: string;
  duration: number | null;
  frameRate: FrameRate;
  uploadedAt: string;
  geminiFileUri?: string;
}

export interface ProjectSettings {
  frameRate: FrameRate;
  dropFrame: boolean;
  broadcaster: Broadcaster;
  language: string;
}

// ─── Timecode Types ───────────────────────────────────────────────

export type FrameRate = 23.976 | 24 | 25 | 29.97 | 30 | 50 | 59.94 | 60;

export const FRAME_RATES: FrameRate[] = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

export type Broadcaster = "PBS" | "BBC" | "ServusTV" | "ARD/ZDF" | "ORF" | "Custom";

export const BROADCASTERS: Broadcaster[] = ["PBS", "BBC", "ServusTV", "ARD/ZDF", "ORF", "Custom"];

// ─── Deliverables Types ───────────────────────────────────────────

export interface Deliverables {
  shotList: ShotEntry[];
  dialogueList: DialogueEntry[];
  graphicsList: GraphicsEntry[];
  synopses: Synopses | null;
  talentBios: TalentBio[];
  faunaLog: FaunaEntry[];
}

export interface ShotEntry {
  id: string;
  shotNumber: number;
  tcIn: string;
  tcOut: string;
  duration: string;
  description: string;
  sceneType: string;
  cameraMovement: string;
  notes: string;
  // ─── EDL-sourced fields (optional; present when generated from an EDL) ───
  /** Structure layer: raw source clip name from the EDL. */
  sourceClip?: string;
  /** Structure layer: source in/out timecodes (provenance for the DB join). */
  sourceInTC?: string;
  sourceOutTC?: string;
  /** Enrichment layer: best-effort human-readable source. */
  source?: string;
  /** Enrichment layer: "resolved" | "pending_db" (needs footage DB). */
  sourceConfidence?: "resolved" | "pending_db";
  /** Structure layer: "cut" | "dissolve" | "wipe" | "key" (non-cut flagged). */
  transition?: string;
  /** Provenance of the cut: "edl" (frame-exact) | "auto" (pixel-detected). */
  cutSource?: "edl" | "auto";
  /** Enrichment: location, carried forward from the nearest preceding location mark. */
  location?: string;
}

export interface DialogueEntry {
  id: string;
  tcIn: string;
  tcOut: string;
  speaker: string;
  dialogue: string;
  isNarration: boolean;
  language: string;
  notes: string;
}

export interface GraphicsEntry {
  id: string;
  tcIn: string;
  tcOut: string;
  graphicType: "lower_third" | "location_mark" | "title_card" | "cgi" | "subtitle" | "credit" | "logo" | "other";
  content: string;
  position: string;
  notes: string;
}

export interface Synopses {
  logline: string;
  shortSynopsis: string;
  mediumSynopsis: string;
  longSynopsis: string;
}

export interface TalentBio {
  id: string;
  name: string;
  role: string;
  firstAppearance: string;
  bio: string;
  appearances: string[];
}

export interface FaunaEntry {
  id: string;
  tcIn: string;
  tcOut: string;
  commonName: string;
  scientificName: string;
  iucnStatus: IUCNStatus;
  confidence: number;
  notes: string;
}

export type IUCNStatus =
  | "LC"  // Least Concern
  | "NT"  // Near Threatened
  | "VU"  // Vulnerable
  | "EN"  // Endangered
  | "CR"  // Critically Endangered
  | "EW"  // Extinct in the Wild
  | "EX"  // Extinct
  | "DD"  // Data Deficient
  | "NE"; // Not Evaluated

export const IUCN_LABELS: Record<IUCNStatus, string> = {
  LC: "Least Concern",
  NT: "Near Threatened",
  VU: "Vulnerable",
  EN: "Endangered",
  CR: "Critically Endangered",
  EW: "Extinct in the Wild",
  EX: "Extinct",
  DD: "Data Deficient",
  NE: "Not Evaluated",
};

export const IUCN_COLORS: Record<IUCNStatus, string> = {
  LC: "#22c55e",
  NT: "#84cc16",
  VU: "#f59e0b",
  EN: "#f97316",
  CR: "#ef4444",
  EW: "#7c3aed",
  EX: "#1f2937",
  DD: "#6b7280",
  NE: "#9ca3af",
};

// ─── Analysis Job Types ──────────────────────────────────────────

export type AnalysisType =
  | "shot_list"
  | "dialogue_list"
  | "graphics_list"
  | "synopses"
  | "talent_bios"
  | "fauna_log";

export const ANALYSIS_LABELS: Record<AnalysisType, string> = {
  shot_list: "Shot List",
  dialogue_list: "Dialogue List",
  graphics_list: "Graphics Log",
  synopses: "Synopses",
  talent_bios: "Talent Bios",
  fauna_log: "Fauna Identification",
};

export interface AnalysisJob {
  id: string;
  projectId: string;
  type: AnalysisType;
  status: "queued" | "processing" | "completed" | "error";
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}
