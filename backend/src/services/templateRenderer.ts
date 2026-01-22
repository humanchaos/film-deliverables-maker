/**
 * Template Renderer Service
 * Render analysis results using custom templates
 */

import ExcelJS from 'exceljs';
import type { AnalysisResults } from '../types.js';
import type { ScriptTemplate, TemplateStructure } from '../types/templates.js';
import { getDb } from './firebase.js';

/**
 * Render results using custom template
 */
export async function renderWithTemplate(
    results: AnalysisResults,
    templateId: string
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const db = getDb();
    const doc = await db.collection('templates').doc(templateId).get();

    if (!doc.exists) {
        throw new Error(`Template ${templateId} not found`);
    }

    const template = { id: doc.id, ...doc.data() } as ScriptTemplate;
    const data = getModuleData(results, template.moduleType);

    if (template.structure.format === 'xlsx') {
        const buffer = await renderExcel(template.structure, data, template.name);
        return {
            buffer,
            filename: `${sanitizeFilename(template.name)}.xlsx`,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        };
    }

    if (template.structure.format === 'csv') {
        const buffer = renderCsv(template.structure, data);
        return {
            buffer,
            filename: `${sanitizeFilename(template.name)}.csv`,
            mimeType: 'text/csv'
        };
    }

    throw new Error(`Unsupported format: ${template.structure.format}`);
}

/**
 * Render Excel using template structure
 */
async function renderExcel(
    structure: TemplateStructure,
    data: any[],
    sheetName: string
): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Video Analyzer';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sheetName.substring(0, 31)); // Excel limit

    if (structure.columns && structure.columns.length > 0) {
        // Set up columns with headers
        sheet.columns = structure.columns.map((col, i) => ({
            header: col.header,
            key: col.dataField,
            width: col.width || 15
        }));

        // Style header row
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Add data rows
        for (const item of data) {
            const rowData: Record<string, any> = {};
            for (const col of structure.columns) {
                let value = getNestedValue(item, col.dataField);

                // Format if needed
                if (col.format === 'timecode' && typeof value === 'number') {
                    value = secondsToTimecode(value);
                }

                rowData[col.dataField] = value ?? '';
            }
            sheet.addRow(rowData);
        }

        // Auto-filter
        sheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: structure.columns.length }
        };
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Render CSV using template structure
 */
function renderCsv(structure: TemplateStructure, data: any[]): Buffer {
    const lines: string[] = [];

    // Header row
    const headers = structure.columns.map(col => escapeCSV(col.header));
    lines.push(headers.join(','));

    // Data rows
    for (const item of data) {
        const row = structure.columns.map(col => {
            let value = getNestedValue(item, col.dataField);

            if (col.format === 'timecode' && typeof value === 'number') {
                value = secondsToTimecode(value);
            }

            return escapeCSV(String(value ?? ''));
        });
        lines.push(row.join(','));
    }

    return Buffer.from(lines.join('\n'), 'utf-8');
}

/**
 * Get data array for specific module type
 */
function getModuleData(results: AnalysisResults, moduleType: string): any[] {
    switch (moduleType) {
        case 'shotList':
            return (results.shotList as any)?.shots || [];
        case 'transcription':
            return (results.transcription as any)?.segments || [];
        case 'fauna':
            return (results.fauna as any)?.sightings || [];
        case 'graphics':
            return (results.graphics as any)?.entries || [];
        case 'cast':
            return (results.cast as any)?.people || [];
        default:
            return [];
    }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
    if (!path.includes('.')) {
        return obj[path];
    }

    return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Escape value for CSV
 */
function escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * Convert seconds to timecode
 */
function secondsToTimecode(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 25);

    return [
        h.toString().padStart(2, '0'),
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0'),
        f.toString().padStart(2, '0')
    ].join(':');
}

/**
 * Sanitize filename
 */
function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}
