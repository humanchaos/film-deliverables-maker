/**
 * Template Analyzer Service
 * Analyze uploaded sample files and learn their structure
 */

import ExcelJS from 'exceljs';
import type { TemplateStructure, ColumnDef, FieldMapping, AnalyzedTemplate } from '../types/templates.js';

/**
 * Analyze uploaded sample and learn its structure
 */
export async function analyzeTemplate(
    fileBuffer: Buffer,
    fileName: string,
    moduleType: string
): Promise<AnalyzedTemplate> {
    const ext = fileName.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
        return analyzeExcelTemplate(fileBuffer, moduleType);
    } else if (ext === 'csv') {
        return analyzeCsvTemplate(fileBuffer, moduleType);
    }

    throw new Error(`Unsupported format: ${ext}. Use .xlsx or .csv`);
}

/**
 * Analyze Excel template
 */
async function analyzeExcelTemplate(
    buffer: Buffer,
    moduleType: string
): Promise<AnalyzedTemplate> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
        throw new Error('No worksheet found in Excel file');
    }

    const detectedColumns: AnalyzedTemplate['detectedColumns'] = [];
    const headerRow = sheet.getRow(1);

    headerRow.eachCell((cell, colNum) => {
        const header = cell.value?.toString() || `Column ${colNum}`;
        const mapping = autoMapField(header, moduleType);

        detectedColumns.push({
            header,
            mapsTo: mapping.ourField,
            confidence: mapping.confidence
        });
    });

    return {
        detectedColumns,
        format: 'xlsx',
        rowCount: sheet.rowCount - 1 // Exclude header
    };
}

/**
 * Analyze CSV template
 */
async function analyzeCsvTemplate(
    buffer: Buffer,
    moduleType: string
): Promise<AnalyzedTemplate> {
    const content = buffer.toString('utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length === 0) {
        throw new Error('Empty CSV file');
    }

    const headers = parseCSVLine(lines[0]);
    const detectedColumns: AnalyzedTemplate['detectedColumns'] = [];

    for (const header of headers) {
        const mapping = autoMapField(header, moduleType);
        detectedColumns.push({
            header,
            mapsTo: mapping.ourField,
            confidence: mapping.confidence
        });
    }

    return {
        detectedColumns,
        format: 'csv',
        rowCount: lines.length - 1
    };
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());

    return result;
}

/**
 * Auto-map template headers to our data fields
 */
function autoMapField(header: string, moduleType: string): { ourField: string; confidence: number } {
    const h = header.toLowerCase().trim();

    // Shot list mappings
    const shotMappings: Record<string, string> = {
        'shot': 'index',
        'shot #': 'index',
        'shot no': 'index',
        'nr': 'index',
        'no': 'index',
        'number': 'index',
        'tc in': 'tcIn',
        'tc-in': 'tcIn',
        'in': 'tcIn',
        'start': 'tcIn',
        'timecode in': 'tcIn',
        'tc out': 'tcOut',
        'tc-out': 'tcOut',
        'out': 'tcOut',
        'end': 'tcOut',
        'timecode out': 'tcOut',
        'duration': 'duration',
        'dur': 'duration',
        'length': 'duration',
        'description': 'description',
        'visual': 'description',
        'scene': 'description',
        'action': 'action',
        'camera': 'action',
        'movement': 'action',
        'audio': 'audio',
        'sound': 'audio',
        'sfx': 'audio',
    };

    // Transcript mappings
    const transcriptMappings: Record<string, string> = {
        'timecode': 'startTime',
        'tc': 'startTime',
        'time': 'startTime',
        'start time': 'startTime',
        'end time': 'endTime',
        'speaker': 'speaker',
        'name': 'speaker',
        'character': 'speaker',
        'who': 'speaker',
        'text': 'text',
        'dialogue': 'text',
        'transcript': 'text',
        'speech': 'text',
        'content': 'text',
    };

    // Fauna mappings
    const faunaMappings: Record<string, string> = {
        'species': 'commonName',
        'common name': 'commonName',
        'animal': 'commonName',
        'latin': 'latinName',
        'scientific': 'latinName',
        'latin name': 'latinName',
        'local': 'localName',
        'local name': 'localName',
        'timecode': 'timecode',
        'tc': 'timecode',
        'time': 'timecode',
        'category': 'category',
        'type': 'category',
        'behavior': 'behavior',
        'behaviour': 'behavior',
        'action': 'behavior',
        'status': 'iucnStatus',
        'iucn': 'iucnStatus',
        'conservation': 'iucnStatus',
    };

    // Select mappings based on module type
    let mappings: Record<string, string>;
    switch (moduleType) {
        case 'shotList':
            mappings = shotMappings;
            break;
        case 'transcription':
            mappings = transcriptMappings;
            break;
        case 'fauna':
            mappings = faunaMappings;
            break;
        default:
            mappings = { ...shotMappings, ...transcriptMappings, ...faunaMappings };
    }

    // Exact match (high confidence)
    if (mappings[h]) {
        return { ourField: mappings[h], confidence: 1.0 };
    }

    // Partial match (medium confidence)
    for (const [key, value] of Object.entries(mappings)) {
        if (h.includes(key) || key.includes(h)) {
            return { ourField: value, confidence: 0.7 };
        }
    }

    // Unknown - create custom field (low confidence)
    const sanitized = h.replace(/[^a-z0-9]/g, '_');
    return { ourField: `custom_${sanitized}`, confidence: 0.3 };
}

/**
 * Build template structure from analyzed columns
 */
export function buildTemplateStructure(
    analyzed: AnalyzedTemplate,
    moduleType: string
): TemplateStructure {
    const columns: ColumnDef[] = analyzed.detectedColumns.map(col => ({
        header: col.header,
        dataField: col.mapsTo,
        format: col.mapsTo.includes('tc') || col.mapsTo.includes('Time') || col.mapsTo === 'timecode'
            ? 'timecode' : 'text'
    }));

    const fieldMappings: FieldMapping[] = analyzed.detectedColumns.map(col => ({
        templateField: col.header,
        ourField: col.mapsTo
    }));

    return {
        format: analyzed.format,
        columns,
        fieldMappings
    };
}
