import { FrameRate } from "./types";

const LANG_NAMES: Record<string, string> = {
  en: "English", de: "German", fr: "French", es: "Spanish",
  it: "Italian", pt: "Portuguese", ja: "Japanese", zh: "Chinese",
  ko: "Korean", ar: "Arabic", ru: "Russian", hi: "Hindi",
  nl: "Dutch", sv: "Swedish", da: "Danish", no: "Norwegian",
  fi: "Finnish", pl: "Polish", cs: "Czech", tr: "Turkish",
};

const TC_INSTRUCTIONS = (frameRate: FrameRate, dropFrame: boolean) => `
TIMECODE FORMAT:
- Frame rate: ${frameRate} fps
- Format: ${dropFrame ? "Drop-Frame (HH:MM:SS;FF)" : "Non-Drop-Frame (HH:MM:SS:FF)"}
- Separator: ${dropFrame ? "semicolon (;) between seconds and frames" : "colon (:) between all fields"}
- All timecodes MUST be exactly 4 fields: HH:MM:SS${dropFrame ? ";" : ":"}FF (hours:minutes:seconds${dropFrame ? ";" : ":"}frames). NEVER omit the hours or frames field.
- All timecodes MUST be accurate to the frame shown on screen.
- IMPORTANT: Timecodes MUST be relative to the START of the provided video clip. The first frame of the clip is 00:00:00${dropFrame ? ";" : ":"}00 regardless of where the clip appears in the original recording.
`;

const LANG_INSTRUCTION = (language: string) => {
  if (language === "auto") {
    return `\nOUTPUT LANGUAGE: Detect the primary spoken/written language of the video and write ALL text output (descriptions, notes, bios, synopses) in that SAME language. If the video contains multiple languages, use the dominant spoken language. Preserve proper nouns and technical terms in their original form.\n`;
  }
  const name = LANG_NAMES[language] || language;
  return `\nOUTPUT LANGUAGE: Write ALL text output (descriptions, notes, bios, synopses, names) in ${name}. If the spoken language in the video differs from ${name}, still write descriptions and notes in ${name} but preserve proper nouns and technical terms.\n`;
};

const ANTI_REPETITION_INSTRUCTION = `
STOP WHEN DONE — DO NOT LOOP:
- Every entry MUST describe unique content. Never write the same description twice.
- When you have logged all real content, STOP and close the JSON array immediately.
- If you notice you are about to repeat a description you already wrote, you have reached the end of the real content — stop there. Do not add any more entries.
- It is better to return a short accurate list than a long list padded with repeated or invented entries.
`;

/**
 * Two-pass shot list — Phase 1: boundary detection only.
 * Asks Gemini for nothing but cut timecodes. Output is small (~10–100 entries
 * even on long videos), so MAX_TOKENS hallucination loops cannot occur.
 */
/**
 * Optional time-range note injected when retrying without videoMetadata offsets.
 * Without videoMetadata, Gemini sees the full video — this restricts the returned cuts
 * to the specific segment the caller wants.
 */
export const BOUNDARY_RANGE_NOTE = (startSec: number, endSec: number, dropFrame: boolean) => {
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}${dropFrame ? ";" : ":"}00`;
  };
  return `ANALYSE ONLY the segment between ${fmt(startSec)} and ${fmt(endSec)} (relative to video start).
Return ONLY timecodes within this range — timecodes outside it are incorrect.`;
};

export const BOUNDARY_DETECTION_PROMPT = (frameRate: FrameRate, dropFrame: boolean, rangeNote?: string) => `
You are an expert assistant editor scanning a video clip for editorial cut points.

YOUR ONLY JOB: Return the timecodes where editorial cuts occur. Do NOT describe shots. Do NOT identify framing or movement. ONLY timecodes.

WHAT COUNTS AS A CUT:
A cut is an instantaneous frame-to-frame change to a different camera setup — a different angle, position, focal length, or subject.

WHAT DOES NOT COUNT AS A CUT (DO NOT log these):
- Camera movement within a continuous take: pans, tilts, zooms, dolly moves, handheld drift
- Reframing or scale changes without a hard cut
- Subject movement within the same setup
- Gradual transitions (dissolves, fades, wipes): count the whole transition as a single cut at its midpoint, or no cut at all if it is purely stylistic
- Compression artefacts, single-frame flashes, glitches

CONTINUITY BIAS:
When uncertain whether a cut occurred, prefer NO cut. Fewer, well-defined cuts are preferred over many false positives.
Once a shot has been running for more than 5 seconds, require clear and unambiguous visual evidence before declaring a new cut.

MINIMUM SHOT LENGTH: 8 frames. Do NOT log cuts that would create shots shorter than 8 frames.

TIMECODE FORMAT:
- Frame rate: ${frameRate} fps
- Format: ${dropFrame ? "Drop-Frame (HH:MM:SS;FF)" : "Non-Drop-Frame (HH:MM:SS:FF)"}
- All timecodes MUST be relative to the START of the provided video clip. The first frame of the clip is 00:00:00${dropFrame ? ";" : ":"}00.

DO NOT include 00:00:00${dropFrame ? ";" : ":"}00 (it is the implied start of shot 1).
DO NOT include the very last frame (it is the implied end of the last shot).
Only include the timecodes BETWEEN shots — i.e. the first frame of shot 2, shot 3, etc.

CRITICAL — NO COUNTING OR INVENTED CUTS:
If you cannot find real editorial cuts in a segment, return an empty "cuts" array — this is the correct and expected answer.
NEVER generate timecodes at regular intervals (every 1 s, every 2 s, every 4 s, etc.) unless each one is a verified, frame-accurate editorial cut.
A short, accurate list is always better than a long, invented one. When uncertain, omit the entry.

${rangeNote ?? ""}

Return ONLY valid JSON in this exact format:
{
  "cuts": [
    "00:00:05${dropFrame ? ";" : ":"}12",
    "00:00:18${dropFrame ? ";" : ":"}03",
    "00:00:42${dropFrame ? ";" : ":"}00"
  ]
}
`;

/**
 * Two-pass shot list — Phase 2: describe a single still frame.
 * Takes the MIDDLE frame of one shot and asks Gemini for the editor-label
 * fields (description, sceneType, cameraMovement, notes). Per-shot,
 * one-image call — no video context, no hallucination room.
 */
export const SHOT_DESCRIBE_PROMPT = (language: string) => `
You are an expert assistant editor labeling a single shot from a documentary.

You are looking at one to three frames from ONE shot of a longer film. When multiple frames are given they are the START, MIDDLE and END of the same shot, in order — use them together to judge the camera movement and the main action as it unfolds (e.g. someone jumping, an animal moving through frame). Describe THIS ONE shot based ONLY on what is visible across these frames. Do NOT describe them as separate shots.

DESCRIPTION FIELD — BROADCAST SHORTHAND (this is how professional shot lists read):
- Format: "SIZE; subject + action" using a leading shot-size abbreviation, semicolon-separated, terse.
- Start with the shot-size abbreviation: WS (wide), MS (medium), MCU (medium close-up), CU (close-up), ECU (extreme close-up), Aerial, Insert, Two-Shot, POV. Use two if apt (e.g. "Aerial; WS").
- Then the subject and ONE main action/state, telegraphic style — drop articles where natural.
- Maximum ~10 words / 80 characters. Be brief, like an editor's note, NOT a sentence.
- Do NOT invent objects, actions, or PROPER NAMES of people/places. If a person's name is not shown on screen, describe them generically ("man with beard", "researcher").
- Static or slowly evolving scenes should be described plainly — do NOT fabricate movement or detail.
- Examples (match this register exactly):
    "WS; ship in arctic waves"
    "CU; hand poking scat with a stick"
    "Aerial; car driving through forest"
    "MS; man with beard looking through binoculars"
    "ECU; segmented object on wet surface"

SCENE TYPE — the full shot-size name (structured column): e.g. "Wide Shot", "Medium Shot", "Medium Close-Up", "Close-Up", "Extreme Close-Up", "Aerial", "Insert", "Two-Shot", "POV". Must agree with the abbreviation you used in the description.

CAMERA MOVEMENT (movement only):
Default to "Static". Only mark movement when there is clear visual evidence:
- With MULTIPLE frames: compare the framing across them — if the background/composition shifts noticeably between start and end while the scene is continuous, that indicates a Pan, Tilt, Tracking, Dolly or Zoom (pick whichever the shift suggests). If the framing is essentially identical, it is "Static".
- Motion blur on background while subject is sharp → likely a tracking shot or pan
- Significant motion blur throughout → likely handheld or rapid camera move
- Top-down framing or unusual angle suggesting aerial → "Aerial" or "Drone"
- Tilted horizon → handheld or Dutch angle
Conservative defaults: "Static", "Handheld", "Aerial", "Pan", "Tilt", "Dolly", "Zoom", "Tracking".
IMPORTANT: subject movement alone (an animal walking through a fixed frame) is NOT camera movement — that is still "Static".

NOTES (max 80 characters): Lighting, weather, time of day, mood, archival/B-roll character — anything that does not belong in the other fields.

${LANG_INSTRUCTION(language)}

Return ONLY valid JSON in this exact format:
{
  "description": "WS; ship in arctic waves",
  "sceneType": "Wide Shot",
  "cameraMovement": "Static",
  "notes": "Overcast, cold tones"
}
`;

export const SHOT_LIST_PROMPT = (frameRate: FrameRate, dropFrame: boolean, language: string) => `
You are an expert assistant editor creating a broadcast-standard shot list.

Analyze this video and log each distinct camera shot.

CONTINUITY RULE — ASSUME CONTINUATION:
Your default assumption is that the current shot is still running. Only start a new shot entry when you see a clear editorial cut — an instantaneous frame change to a different camera setup.
Do NOT create a new shot for:
- Camera movement within a continuous take (pan, tilt, zoom, handheld drift)
- Reframing or scale changes without a cut
- Subject movement within the same setup
- Gradual transitions or dissolves (log these as a single shot)
When uncertain whether a cut occurred, extend the current shot rather than creating a new entry.
Once a shot has been running for more than 5 seconds, require clear and unambiguous visual evidence of a cut before ending it.
Fewer, well-defined shots are preferred over many fragmented ones.

MINIMUM SHOT LENGTH: Each shot must be at least 8 frames. Do NOT log momentary flashes, single frames, or sub-second cuts — these are compression artefacts, not editorial shots.

DESCRIBE ONLY WHAT IS VISIBLE:
- Do not invent objects, people, or actions that are not clearly on screen.
- Static or slowly evolving scenes should be described faithfully as such — do not add movement or novelty to avoid repetition.
- If a scene continues largely unchanged, it is one shot. Log it once.

${TC_INSTRUCTIONS(frameRate, dropFrame)}
${LANG_INSTRUCTION(language)}

For each shot, provide:
1. Shot number (sequential)
2. TC In (timecode of the first frame)
3. TC Out (timecode of the last frame)
4. Duration (TC Out - TC In)
5. Description — editorial label format ONLY. Structure: [location] + [primary subject] + [action or state]. Hard rules: max 20 words / 120 characters; one main action per shot; do NOT list secondary details; reuse exact wording when scene is visually similar. CRITICAL: do NOT put shot size, framing, or camera movement in description — those fields are sceneType and cameraMovement.
6. Scene Type — framing/shot size ONLY (e.g., "Wide Shot", "Close-Up", "Medium Shot", "Aerial", "Insert", "B-Roll", "Interview", "Extreme Close-Up", etc.)
7. Camera Movement — movement ONLY (e.g., "Static", "Pan Left", "Pan Right", "Tilt Up", "Tilt Down", "Dolly In", "Handheld", "Drone", "Tracking", "Zoom In", etc.)
8. Notes (any relevant notes about the shot)

FIELD SEPARATION RULE:
  ✗ WRONG — description: "Wide shot of mountain landscape at dawn" (shot size leaked into description)
  ✓ RIGHT  — description: "Mountain landscape at dawn, morning mist rolling through the valley" | sceneType: "Wide Shot" | cameraMovement: "Slow Pan Right"

${ANTI_REPETITION_INSTRUCTION}
Return ONLY valid JSON in this exact format:
{
  "shots": [
    {
      "shotNumber": 1,
      "tcIn": "00:00:00${dropFrame ? ";" : ":"}00",
      "tcOut": "00:00:05${dropFrame ? ";" : ":"}12",
      "duration": "00:00:05${dropFrame ? ";" : ":"}12",
      "description": "Mountain landscape at dawn, morning mist rolling through the valley",
      "sceneType": "Wide Shot",
      "cameraMovement": "Slow Pan Right",
      "notes": ""
    }
  ]
}
`;

export const DIALOGUE_LIST_PROMPT = (frameRate: FrameRate, dropFrame: boolean, language: string, clipEndTC: string) => `
You are an expert assistant editor creating a broadcast-standard dialogue list / transcript.

Analyze this video and create a frame-accurate transcript of ALL spoken dialogue, narration, and voice-over.

${clipEndTC ? `CLIP BOUNDS:
- This clip runs from 00:00:00${dropFrame ? ";" : ":"}00 to ${clipEndTC}.
- Every tcIn and tcOut MUST be ≤ ${clipEndTC}. Timecodes beyond ${clipEndTC} do not exist in this clip — never output them.
- Timecodes are HH:MM:SS${dropFrame ? ";" : ":"}FF positions in the clip, NOT wall-clock times. They advance with the video; they never jump.
` : ""}
${TC_INSTRUCTIONS(frameRate, dropFrame)}
${LANG_INSTRUCTION(language)}

For each dialogue entry, provide:
1. TC In (timecode when speaking begins)
2. TC Out (timecode when speaking ends)
3. Speaker (name of person speaking, or "NARRATOR" for voice-over/narration)
4. Dialogue (exact words spoken, verbatim)
5. Is Narration (true if voice-over/narration, false if on-camera dialogue)
6. Language (${language} unless a different language is spoken)
7. Notes (e.g., "(whispering)", "(phone)", "(archival audio)")

${ANTI_REPETITION_INSTRUCTION}
Return ONLY valid JSON:
{
  "entries": [
    {
      "tcIn": "00:00:10${dropFrame ? ";" : ":"}00",
      "tcOut": "00:00:15${dropFrame ? ";" : ":"}12",
      "speaker": "NARRATOR",
      "dialogue": "In the heart of the Austrian Alps...",
      "isNarration": true,
      "language": "${language}",
      "notes": ""
    }
  ]
}
`;

export const GRAPHICS_LIST_PROMPT = (frameRate: FrameRate, dropFrame: boolean, language: string) => `
You are an expert assistant editor creating a broadcast-standard graphics log.

Analyze this video and log ONLY production graphics — designed, composed elements that are part of the film's visual language.

⚠️ CRITICAL — IGNORE THE BURNED-IN TIMECODE (BITC):
This master may have a burned-in timecode: a small HH:MM:SS:FF (or HH:MM:SS;FF) counter — usually white text in a corner — that INCREMENTS EVERY SINGLE FRAME. This is a technical overlay, NOT a production graphic. NEVER log it. Ignore ANY timecode-like counter that changes continuously frame to frame. Logging the BITC is a serious error.

LOG these graphic types (capture the FULL on-screen text):
- "lower_third": a name + title super identifying a person (capture BOTH lines, e.g. "SCOTT CARVER / Wildlife Ecologist", "ASHA DE VOS / Marine Biologist").
- "location_mark": a place/location super (e.g. "HOBART / Tasmania / Australia", "POBITORA WILDLIFE SANCTUARY / Assam / India").
- "title_card": the film title, chapter/section titles, time-jump inserts (e.g. "3 HOURS LATER", "THE END").
- "cgi": designed CGI / animation / science-graphic sequences with no necessarily-readable text (e.g. "CT scan of wombat", "phytoplankton bloom animation", "mathematical model", "DNA extraction animation", "iron cycle diagram"). Describe what the animation shows in the content field.
- "credit": opening or closing credit sequences.
- "logo": network bugs, production company logos.

DO NOT LOG:
- The burned-in timecode counter (see above).
- Dialogue subtitles / captions — lines of spoken speech displayed as text.
- Anything that is simply a caption of what someone is saying.

${TC_INSTRUCTIONS(frameRate, dropFrame)}
${LANG_INSTRUCTION(language)}

For each graphic, provide:
1. TC In (timecode when graphic first appears)
2. TC Out (timecode when graphic disappears)
3. Graphic Type: "lower_third", "location_mark", "title_card", "cgi", "credit", "logo", or "other"
4. Content (exact text shown on screen — for "cgi" with no text, a short description of the animation)
5. Position (e.g., "lower third left", "center", "upper right")
6. Notes (font color, animation, background, etc.)

${ANTI_REPETITION_INSTRUCTION}
Return ONLY valid JSON:
{
  "entries": [
    {
      "tcIn": "00:00:10${dropFrame ? ";" : ":"}00",
      "tcOut": "00:00:15${dropFrame ? ";" : ":"}00",
      "graphicType": "lower_third",
      "content": "Dr. Jane Smith, Marine Biologist",
      "position": "lower third left",
      "notes": "White text on semi-transparent black bar"
    }
  ]
}
`;

export const SYNOPSES_PROMPT = (language: string) => `
You are an expert film publicist writing broadcast-standard synopses for a documentary.

${LANG_INSTRUCTION(language)}

Watch this video carefully and write:

1. LOGLINE: A single compelling sentence (max 30 words) that captures the essence.
2. SHORT SYNOPSIS: 2-3 sentences (50-75 words). Focus on the central story/conflict.
3. MEDIUM SYNOPSIS: 1 paragraph (150-200 words). Include key characters and narrative arc.
4. LONG SYNOPSIS: 3-4 paragraphs (400-600 words). Detailed narrative covering all major story beats, characters, and themes. Do NOT reveal the ending unless it's essential.

Return ONLY valid JSON:
{
  "logline": "...",
  "shortSynopsis": "...",
  "mediumSynopsis": "...",
  "longSynopsis": "..."
}
`;

export const TALENT_BIOS_PROMPT = (frameRate: FrameRate, dropFrame: boolean, language: string, clipEndTC: string) => `
You are an expert researcher creating talent profiles for a documentary's deliverables package.

Analyze this video and identify the NAMED on-screen talent — the presenter/host, interviewees, and experts whose REAL NAME is established on screen or in the narration. This is a talent/credits deliverable, not a census of everyone in frame.

⚠️ NAMED PEOPLE ONLY — this is the most important rule:
- ONLY include a person if you can determine their ACTUAL NAME (first + last, e.g. "Scott Carver", "Patricia Yang") from a lower-third, credit, on-screen text, or from narration/dialogue that names them.
- DO NOT include anyone you cannot name. No "Unidentified male", no "Man with beard", no "Research Assistant", no "Boat crew", no generic descriptions. If you don't know the real name, OMIT the person entirely.
- DO NOT log background people, crowds, audiences (e.g. an awards-ceremony audience), bystanders, assistants, or crew — even if visible. Only the recurring host and the named contributors belong here.
- The same person must appear ONCE. Always use their full name spelled identically every time (e.g. always "Scott Burnett", never also "Scott" or "the presenter"). Merge all their appearances under that one full name.

NAME IDENTIFICATION — use ALL of these sources, in priority order:
1. LOWER THIRDS / CHYRONS: Text overlays superimposed at the bottom of the frame that name the person. These appear as white or coloured text, often with a title line beneath. Scan every frame carefully — lower thirds are the most reliable source of names.
2. CREDIT SEQUENCES: Opening or closing credits that name cast, crew, interviewees.
3. ON-SCREEN TEXT: Any other text overlays, title cards, or captions that identify people.
4. DIALOGUE: Listen for moments when characters address each other by name ("Thank you, Ellen", "As Lisa explained…"), or when a narrator introduces someone ("Dr Smith has spent 20 years…").

CRITICAL: Only log timecodes where the person is VISUALLY VISIBLE in the video frame. Do NOT log timecodes where:
- The person is only heard speaking (voice-over) but B-roll or other footage is shown
- The camera is showing cutaway shots, animals, landscapes, or other subjects while the person speaks
- The person's voice is audible but they are not in the frame

Each timecode in "appearances" and "firstAppearance" must correspond to a frame where the person's face or body is clearly visible on screen.

FIRST APPEARANCE — scan from the very first frame:
- firstAppearance must be the earliest frame in the entire clip where this person is physically on screen.
- The clip begins at 00:00:00${dropFrame ? ";" : ":"}00. Scan from the opening seconds — people often appear before their lower-third is shown.
- Do NOT use a later appearance as firstAppearance just because it is more prominent.

CLIP BOUNDS:
- This clip runs from 00:00:00${dropFrame ? ";" : ":"}00 to ${clipEndTC}.
- ALL timecodes — firstAppearance and every entry in appearances — MUST be ≤ ${clipEndTC}.
- Timecodes beyond ${clipEndTC} do not exist in this clip. Do not include them.

${TC_INSTRUCTIONS(frameRate, dropFrame)}
${LANG_INSTRUCTION(language)}

For each person, provide:
1. Name (from the sources above — prefer the exact name as shown on screen)
2. Role (e.g., "Subject", "Expert", "Narrator", "Director", "Interviewee" — use the title shown in their lower third if available)
3. First Appearance (timecode of the first frame where their face/body is visible)
4. Bio (2-3 sentences about who they are, their expertise, and relevance to the film)
5. All Appearances (list of timecodes where they are VISUALLY on screen — one timecode per distinct on-screen appearance, maximum 10 entries)

${ANTI_REPETITION_INSTRUCTION}
Return ONLY valid JSON:
{
  "bios": [
    {
      "name": "Dr. Jane Smith",
      "role": "Marine Biologist / Expert",
      "firstAppearance": "00:02:30${dropFrame ? ";" : ":"}00",
      "bio": "Dr. Jane Smith is a marine biologist at the University of Vienna...",
      "appearances": ["00:02:30${dropFrame ? ";" : ":"}00", "00:15:42${dropFrame ? ";" : ":"}00"]
    }
  ]
}
`;

export const FAUNA_LOG_PROMPT = (frameRate: FrameRate, dropFrame: boolean, language: string, clipEndTC: string) => `
You are an expert wildlife biologist and nature documentary researcher.

Analyze this video and identify each animal species that is VISUALLY ON SCREEN (the animal is visible in the frame).

CRITICAL: Only log timecodes where the animal is VISUALLY VISIBLE in the video frame. Do NOT log timecodes where:
- The animal is only mentioned in narration or dialogue but not shown
- The camera is showing people, graphics, or other subjects while the animal is discussed
- The animal's sounds are audible but the animal is not in the frame

DO NOT LOG the following — they are not logged in a broadcast wildlife species list:
- Humans (Homo sapiens) — people, researchers, filmmakers, handlers, or any person on screen
- Equipment or objects (cameras, vehicles, traps, trackers, drones, etc.)
- Taxidermy, sculptures, illustrations, or non-living animal representations
- DOMESTIC / LIVESTOCK animals: cattle/cows, water buffalo, sheep, goats, horses, pigs, domestic dogs/cats, poultry — these are not wildlife and are excluded
- INCIDENTAL / BACKGROUND animals that are not a subject of the shot (e.g. a small bird passing through, insects in the background) — only log an animal that is a focal subject of the footage

TC In and TC Out must correspond to frames where the animal is clearly visible on screen.

IMPORTANT: Log each species ONCE only — use the timecode of its FIRST appearance in the video. Do not create multiple entries for the same species.

CLIP BOUNDS:
- This clip runs from 00:00:00${dropFrame ? ";" : ":"}00 to ${clipEndTC}.
- Every tcIn and tcOut MUST be ≤ ${clipEndTC}. Any entry with a timecode beyond this is a hallucination — omit it.

COVERAGE — be systematic and complete:
- Scan the ENTIRE clip from start to end. Do not stop logging partway through; species appearing late in the clip matter as much as early ones.
- A wildlife documentary typically features MANY species. Every animal that is a focal subject of a shot must be logged — including small subjects (insects, krill, fish) when the camera clearly features them.
- Fast-cut montage sequences (e.g. an opening teaser) legitimately show many different species within a minute — log each clearly identifiable focal species, one entry per species.

CONFIDENCE STANDARD — only log what you can clearly see:
- Only include a species if you are at least 80% confident from what is visually on screen.
- Do NOT infer species from habitat, region, or context. Log only what you can actually see.
- If uncertain of exact genus or species, log it at the most specific level you ARE confident about (e.g. "whale, likely Balaenoptera sp."), lower the confidence value, and describe your uncertainty in Notes. An honest genus-level entry is better than omitting the animal entirely.

${TC_INSTRUCTIONS(frameRate, dropFrame)}
${LANG_INSTRUCTION(language)}

For each species (first appearance only), provide:
1. TC In (timecode of the species' FIRST visible appearance)
2. TC Out (timecode when it leaves frame in that first appearance)
3. Common Name (e.g., "Golden Eagle")
4. Scientific Name (e.g., "Aquila chrysaetos")
5. IUCN Conservation Status: One of LC (Least Concern), NT (Near Threatened), VU (Vulnerable), EN (Endangered), CR (Critically Endangered), EW (Extinct in the Wild), EX (Extinct), DD (Data Deficient), NE (Not Evaluated)
6. Confidence (0.0 to 1.0, how confident you are in the identification)
7. Notes (brief: behavior, habitat, features — max 15 words)

Include ALL non-human animal types: mammals, birds, reptiles, amphibians, fish, insects.
If uncertain of exact species, provide your best identification and lower confidence.

${ANTI_REPETITION_INSTRUCTION}
Return ONLY valid JSON:
{
  "entries": [
    {
      "tcIn": "00:01:15${dropFrame ? ";" : ":"}00",
      "tcOut": "00:01:28${dropFrame ? ";" : ":"}12",
      "commonName": "Golden Eagle",
      "scientificName": "Aquila chrysaetos",
      "iucnStatus": "LC",
      "confidence": 0.95,
      "notes": "Soaring over alpine meadow, distinctive golden nape visible"
    }
  ]
}
`;
