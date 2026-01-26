/**
 * Excel Export Utility
 * Generates professional Excel files with styled headers
 */
import ExcelJS from 'exceljs';
import { TranscriptionSegment, Shot, SpeciesSighting } from '../types';

/**
 * Generate styled transcript Excel file
 */
export async function generateTranscriptExcel(
    segments: TranscriptionSegment[]
): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Industry Standard Deliverables Maker';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Transcript');

    // Headers with styling
    const headers = ['Timecode Start', 'Timecode End', 'Speaker', 'Text'];
    const headerRow = sheet.addRow(headers);

    // Style header row
    headerRow.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4472C4' },
        };
        cell.font = {
            bold: true,
            color: { argb: 'FFFFFF' },
            size: 11,
        };
        cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
        };
        cell.border = {
            bottom: { style: 'thin', color: { argb: '2F5496' } },
        };
    });

    // Data rows - SEPARATE columns for speaker and text
    for (const seg of segments) {
        const row = sheet.addRow([
            seg.startTime,
            seg.endTime,
            seg.speaker,
            seg.transcript,
        ]);

        // Alternate row colors
        if (sheet.rowCount % 2 === 0) {
            row.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F2F2F2' },
                };
            });
        }
    }

    // Column widths
    sheet.getColumn(1).width = 18; // Timecode Start
    sheet.getColumn(2).width = 18; // Timecode End
    sheet.getColumn(3).width = 25; // Speaker
    sheet.getColumn(4).width = 80; // Text

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

/**
 * Generate styled shot list Excel file
 */
export async function generateShotListExcel(shots: Shot[]): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Industry Standard Deliverables Maker';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Shot List');

    // Headers
    const headers = ['#', 'TC In', 'TC Out', 'Duration', 'Description', 'Action', 'Audio'];
    const headerRow = sheet.addRow(headers);

    // Style header row
    headerRow.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4472C4' },
        };
        cell.font = {
            bold: true,
            color: { argb: 'FFFFFF' },
            size: 11,
        };
        cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
        };
    });

    // Data rows
    for (const shot of shots) {
        const row = sheet.addRow([
            shot.nr,
            shot.tcIn,
            shot.tcOut,
            shot.duration,
            shot.description,
            shot.action,
            shot.audio,
        ]);

        if (sheet.rowCount % 2 === 0) {
            row.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F2F2F2' },
                };
            });
        }
    }

    // Column widths
    sheet.getColumn(1).width = 6;  // #
    sheet.getColumn(2).width = 14; // TC In
    sheet.getColumn(3).width = 14; // TC Out
    sheet.getColumn(4).width = 10; // Duration
    sheet.getColumn(5).width = 50; // Description
    sheet.getColumn(6).width = 30; // Action
    sheet.getColumn(7).width = 30; // Audio

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

/**
 * Generate styled fauna log Excel file
 */
export async function generateFaunaExcel(
    sightings: SpeciesSighting[]
): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Industry Standard Deliverables Maker';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Fauna Log');

    // Headers
    const headers = ['Timecode', 'Common Name', 'Latin Name', 'German Name', 'Behavior', 'IUCN Status'];
    const headerRow = sheet.addRow(headers);

    // Style header row
    headerRow.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '538135' },
        };
        cell.font = {
            bold: true,
            color: { argb: 'FFFFFF' },
            size: 11,
        };
        cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
        };
    });

    // Data rows
    for (const sighting of sightings) {
        const row = sheet.addRow([
            sighting.timecode,
            sighting.commonName,
            sighting.latinName,
            sighting.germanName || '',
            sighting.behavior || '',
            sighting.iucnStatus || '',
        ]);

        if (sheet.rowCount % 2 === 0) {
            row.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'E2EFDA' },
                };
            });
        }
    }

    // Column widths
    sheet.getColumn(1).width = 14; // Timecode
    sheet.getColumn(2).width = 25; // Common Name
    sheet.getColumn(3).width = 30; // Latin Name
    sheet.getColumn(4).width = 25; // German Name
    sheet.getColumn(5).width = 25; // Behavior
    sheet.getColumn(6).width = 12; // IUCN Status

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

/**
 * Download a Blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
