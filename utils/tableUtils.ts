/**
 * Utility functions for table formatting and data export
 * Optimized for professional production document formats
 */

export type TimecodeFormat = 'NDF' | 'DF'; // Non-Drop-Frame vs Drop-Frame

/**
 * Detect if timecode uses drop-frame format (semicolon separator)
 */
export function isDropFrameTimecode(tc: string): boolean {
  return tc.includes(';');
}

/**
 * Convert drop-frame timecode to seconds
 * Only valid for 29.97fps and 59.94fps
 */
export function dropFrameToSeconds(tc: string, frameRate: number): number {
  // Only valid for 29.97fps and 59.94fps
  // Only valid for 29.97fps and 59.94fps
  if (Math.abs(frameRate - 29.97) > 0.01 && Math.abs(frameRate - 59.94) > 0.01) {
    // console.warn(`Drop-frame timecode is only valid for 29.97fps and 59.94fps, got ${frameRate}fps`);
    // Fall back to non-drop-frame parsing
    return parseTimecode(tc.replace(/;/g, ':'), frameRate);
  }

  // Parse the timecode
  const parts = tc.split(/[:;]/);
  if (parts.length !== 4) return 0;

  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);
  const seconds = parseInt(parts[2]);
  const frames = parseInt(parts[3]);

  // Calculate drop-frame parameters
  const dropFrames = frameRate === 29.97 ? 2 : 4; // 2 for 29.97fps, 4 for 59.94fps

  // Total minutes
  const totalMinutes = hours * 60 + minutes;

  // Calculate total frames with drop-frame compensation
  // Frames are dropped at the start of each minute EXCEPT every 10th minute
  const droppedFrames = dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));

  const totalFrames =
    (hours * 60 * 60 * frameRate) +
    (minutes * 60 * frameRate) +
    (seconds * frameRate) +
    frames -
    droppedFrames;

  return totalFrames / frameRate;
}

/**
 * Convert seconds to drop-frame timecode
 * Only valid for 29.97fps and 59.94fps
 */
export function secondsToDropFrameTimecode(seconds: number, frameRate: number): string {
  // Only valid for 29.97fps and 59.94fps
  if (frameRate !== 29.97 && frameRate !== 59.94) {
    console.warn(`Drop-frame timecode is only valid for 29.97fps and 59.94fps, got ${frameRate}fps`);
    // Fall back to non-drop-frame
    return secondsToTimecode(seconds, frameRate);
  }

  const dropFrames = frameRate === 29.97 ? 2 : 4; // 2 for 29.97fps, 4 for 59.94fps

  // Total frames from seconds
  let totalFrames = Math.round(seconds * frameRate);

  // Calculate 10-minute chunks
  const tenMinuteChunks = Math.floor(totalFrames / (frameRate * 600));
  let remainingFrames = totalFrames % (frameRate * 600);

  // Add back the dropped frames (except for 10-minute marks)
  if (remainingFrames >= dropFrames) {
    // Calculate how many minutes have passed in this 10-minute chunk
    const minutesInChunk = Math.floor((remainingFrames - dropFrames) / (frameRate * 60 - dropFrames));
    const adjustedFrames = remainingFrames + (dropFrames * minutesInChunk);
    remainingFrames = adjustedFrames;
  }

  totalFrames = (tenMinuteChunks * (frameRate * 600)) + remainingFrames;

  // Convert to HH:MM:SS;FF
  const fps = Math.round(frameRate);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / frameRate);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')};${frames.toString().padStart(2, '0')}`;
}

/**
 * Convert timecode between NDF and DF formats
 */
export function convertTimecode(
  tc: string,
  fromFormat: TimecodeFormat,
  toFormat: TimecodeFormat,
  frameRate: number
): string {
  if (fromFormat === toFormat) return tc;

  // Convert to seconds first
  const seconds = fromFormat === 'DF' ? dropFrameToSeconds(tc, frameRate) : parseTimecode(tc, frameRate);

  // Convert to target format
  return toFormat === 'DF' ? secondsToDropFrameTimecode(seconds, frameRate) : secondsToTimecode(seconds, frameRate);
}

/**
 * Parse timecode string to seconds
 * Supports formats: HH:MM:SS, HH:MM:SS:FF, HH:MM:SS.mmm, HH:MM:SS;FF (drop-frame)
 */
export function parseTimecode(tc: string, frameRate: number = 25): number {
  if (!tc) return 0;
  let cleanTc = tc.trim();

  // Handle Drop Frame or Semicolon format
  const isSupportedDF = Math.abs(frameRate - 29.97) < 0.01 || Math.abs(frameRate - 59.94) < 0.01;
  if (cleanTc.includes(';')) {
    if (isSupportedDF) {
      return dropFrameToSeconds(cleanTc, frameRate);
    } else {
      cleanTc = cleanTc.replace(/;/g, ':');
    }
  }

  // Handle Milliseconds (Format: HH:MM:SS.mmm or MM:SS.mmm or SS.mmm)
  if (cleanTc.includes('.')) {
    const [timePart, msPart] = cleanTc.split('.');
    const milliseconds = parseFloat(`0.${msPart || '0'}`);

    const parts = timePart.split(':');
    let seconds = 0;

    if (parts.length === 3) { // HH:MM:SS
      seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    } else if (parts.length === 2) { // MM:SS
      seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (parts.length === 1) { // SS
      seconds = parseInt(parts[0]);
    }

    return seconds + milliseconds;
  }

  // Handle Frame-based or standard formats (HH:MM:SS:FF or HH:MM:SS or MM:SS)
  const parts = cleanTc.split(':');

  if (parts.length === 4) {
    // HH:MM:SS:FF
    const [hours, minutes, seconds, frames] = parts;
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(frames) / frameRate;
  } else if (parts.length === 3) {
    // HH:MM:SS
    const [hours, minutes, seconds] = parts;
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
  } else if (parts.length === 2) {
    // MM:SS
    const [minutes, seconds] = parts;
    return parseInt(minutes) * 60 + parseFloat(seconds);
  } else if (parts.length === 1) {
    // Just seconds?
    return parseFloat(parts[0]);
  }

  return 0;
}

/**
 * Convert seconds to timecode
 * Supports both frame-based (HH:MM:SS:FF) and millisecond-based (HH:MM:SS.mmm) formats
 */
export function secondsToTimecode(seconds: number, frameRate: number = 25, includeFrames: boolean = true): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const base = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  if (includeFrames) {
    const frames = Math.floor((seconds % 1) * frameRate);
    return `${base}:${frames.toString().padStart(2, '0')}`;
  }

  const milliseconds = Math.floor((seconds % 1) * 1000);
  return `${base}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Generate CSV content from headers and rows
 * Uses UTF-8 BOM and semicolon delimiter for European Excel compatibility
 */
export function generateCSV(headers: string[], rows: any[][]): string {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel
  const delimiter = ';'; // Semicolon for European Excel

  const escape = (str: string) => {
    if (str === null || str === undefined) return '';
    const s = String(str);
    // Escape if contains delimiter, quotes, or newlines
    if (s.includes(delimiter) || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerLine = headers.map(escape).join(delimiter);
  const dataLines = rows.map(row => row.map(escape).join(delimiter)).join('\n');

  return `${BOM}${headerLine}\n${dataLines}`;
}


/**
 * Trigger file download in browser
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Cleanup
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ... (previous imports if any)

/**
 * Detect most likely timecode format from frame rate
 */
export function detectTimecodeFormat(frameRate: number): TimecodeFormat {
  // Standard broadcast definition: 29.97 and 59.94 usually use Drop Frame
  if (Math.abs(frameRate - 29.97) < 0.01 || Math.abs(frameRate - 59.94) < 0.01) {
    return 'DF';
  }
  return 'NDF';
}

/**
 * Format file size bytes to human readable string (MB/GB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Copy text to clipboard using modern Clipboard API
 * Returns true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Apply a timecode offset to a given timecode string or seconds value
 * @param time The original time (string "HH:MM:SS:FF" or number of seconds)
 * @param offset Timecode string "HH:MM:SS:FF" acting as the start time
 * @param frameRate Video frame rate
 * @returns The new timecode string with offset applied
 */
export function applyTimecodeOffset(
  time: string | number,
  offset: string | undefined | null,
  frameRate: number = 25
): string {
  // 1. Calculate base seconds
  let baseSeconds = 0;
  if (typeof time === 'number') {
    baseSeconds = time;
  } else {
    baseSeconds = parseTimecode(time, frameRate);
  }

  // 2. Calculate offset seconds
  let offsetSeconds = 0;
  if (offset && offset !== '00:00:00:00') {
    offsetSeconds = parseTimecode(offset, frameRate);
  }

  // 3. Combine
  const totalSeconds = baseSeconds + offsetSeconds;

  // 4. Return new timecode
  // Use Drop Frame logic if appropriate for the frame rate
  const format = detectTimecodeFormat(frameRate);
  if (format === 'DF') {
    return secondsToDropFrameTimecode(totalSeconds, frameRate);
  }
  return secondsToTimecode(totalSeconds, frameRate);
}
