/**
 * NLE Export Service
 * Generates exchange formats for professional Non-Linear Editors.
 * Supported Formats:
 * - EDL (CMX 3600): Standard for Avid/Premiere/Resolve (Shot List)
 * - FCP XML (Version 5): Legacy XML supported by most NLEs (Shot List and Sequences)
 * - CSV Markers: For DaVinci Resolve etc.
 */

import { Shot, ProjectMetadata } from '../types';
import { applyTimecodeOffset, parseTimecode } from '../utils/tableUtils';

export type NLEFormat = 'edl' | 'fcp_xml' | 'resolve_csv' | 'avid_markers';

/**
 * Generate CMX 3600 EDL
 */
export function generateEDL(shots: Shot[], fileName: string, projectMetadata: ProjectMetadata, frameRate: number = 25): string {
    const title = (projectMetadata.episodeTitle || fileName).toUpperCase().substring(0, 50);
    const date = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY typical for EDL

    let edl = `TITLE: ${title}\nFCM: NON-DROP FRAME\n\n`; // Simple Header

    shots.forEach((shot, index) => {
        const editId = (index + 1).toString().padStart(3, '0');
        const reel = 'AX'; // Auxiliary / Generic Reel
        const track = 'V';  // Video
        const type = 'C';   // Cut

        // Apply Offsets
        const tcIn = applyTimecodeOffset(shot.tcIn, projectMetadata.timecodeStart, frameRate);
        const tcOut = applyTimecodeOffset(shot.tcOut, projectMetadata.timecodeStart, frameRate);

        // Start Timecode in Sequence (Record In)
        // For a shot list, we usually lay them out sequentially OR just list them.
        // If it's a "Shot List" for logging, we might want "Record In" to match "Source In".
        // But EDLs imply a sequence.
        // Let's assume sequential layout for now, starting at timecodeStart.

        // HOWEVER, if the purpose is "Locators" or "Subclips", EDL might not be the best.
        // Ideally, we replicate the Source TC into the Record TC for simple logging EDLs.

        edl += `${editId}  ${reel}    ${track}     ${type}        ${tcIn} ${tcOut} ${tcIn} ${tcOut}\n`;
        edl += `* FROM CLIP NAME: ${fileName}\n`;
        if (shot.description) edl += `* COMMENT: ${shot.description}\n`;
        edl += `\n`;
    });

    return edl;
}

/**
 * Generate FCP XML (v5)
 */
export function generateFCPXML(shots: Shot[], fileName: string, projectMetadata: ProjectMetadata, frameRate: number = 25): string {
    // Basic XML Structure
    const duration = shots.reduce((acc, shot) => {
        const start = parseTimecode(shot.tcIn, frameRate);
        const end = parseTimecode(shot.tcOut, frameRate);
        return acc + Math.max(0, end - start);
    }, 0);

    // FPS Integer approximation
    const timebase = Math.round(frameRate);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${fileName}</name>
    <duration>${Math.round(duration * frameRate)}</duration>
    <rate>
      <timebase>${timebase}</timebase>
      <ntsc>${frameRate % 1 !== 0 ? 'TRUE' : 'FALSE'}</ntsc>
    </rate>
    <media>
      <video>
        <track>
`;

    shots.forEach((shot, index) => {
        const shotDuration = parseTimecode(shot.duration, frameRate);
        const frameDuration = Math.round(shotDuration * frameRate);
        const startTc = applyTimecodeOffset(shot.tcIn, projectMetadata.timecodeStart, frameRate);
        const endTc = applyTimecodeOffset(shot.tcOut, projectMetadata.timecodeStart, frameRate);

        // We need source frame counts
        const startInFrames = Math.round(parseTimecode(startTc, frameRate) * frameRate);
        const endInFrames = startInFrames + frameDuration;

        xml += `          <clipitem id="clipitem-${index + 1}">
            <name>${shot.description || `Shot ${index + 1}`}</name>
            <duration>${frameDuration}</duration>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>${frameRate % 1 !== 0 ? 'TRUE' : 'FALSE'}</ntsc>
            </rate>
            <start>${startInFrames}</start>
            <end>${endInFrames}</end>
            <in>${startInFrames}</in>
            <out>${endInFrames}</out>
            <file id="file-1">
              <name>${fileName}</name>
              <pathurl>file://localhost/${fileName}</pathurl>
              <rate>
                <timebase>${timebase}</timebase>
                <ntsc>${frameRate % 1 !== 0 ? 'TRUE' : 'FALSE'}</ntsc>
              </rate>
              <duration>${frameDuration}</duration>
            </file>
            <labels>
              <label2>Action: ${shot.action}</label2>
            </labels>
          </clipitem>
`;
    });

    xml += `        </track>
      </video>
    </media>
  </sequence>
</xmeml>`;

    return xml;
}

/**
 * Generate DaVinci Resolve CSV Markers
 */
export function generateResolveCSV(shots: Shot[], projectMetadata: ProjectMetadata, frameRate: number = 25): string {
    // Header
    let csv = `Source In,Source Out,Duration,Note,Name,Color\n`;

    shots.forEach(shot => {
        const tcIn = applyTimecodeOffset(shot.tcIn, projectMetadata.timecodeStart, frameRate);
        const tcOut = applyTimecodeOffset(shot.tcOut, projectMetadata.timecodeStart, frameRate);

        // Escape content
        const note = `"${(shot.description || '').replace(/"/g, '""')}"`;
        const name = `"${(shot.action || '').replace(/"/g, '""')}"`;

        csv += `${tcIn},${tcOut},${shot.duration},${note},${name},Blue\n`;
    });

    return csv;
}

/**
 * Download functions for NLE formats
 */
export function downloadNLEFile(content: string, fileName: string, format: NLEFormat) {
    let extension = 'txt';
    let mimeType = 'text/plain';

    switch (format) {
        case 'edl': extension = 'edl'; break;
        case 'fcp_xml': extension = 'xml'; mimeType = 'text/xml'; break;
        case 'resolve_csv': extension = 'csv'; mimeType = 'text/csv'; break;
        case 'avid_markers': extension = 'txt'; break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}_export.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
