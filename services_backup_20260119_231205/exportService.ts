import { saveAs } from 'file-saver';
import { AnalysisMode } from '../types';

export interface ExportData<T> {
    version: string;
    type: AnalysisMode;
    date: string;
    sourceFile: string;
    data: T;
}

const CURRENT_VERSION = '1.0.0';

/**
 * Export analysis data to JSON file
 */
export function exportToJSON<T>(
    data: T,
    mode: AnalysisMode,
    fileName: string
) {
    const exportPayload: ExportData<T> = {
        version: CURRENT_VERSION,
        type: mode,
        date: new Date().toISOString(),
        sourceFile: fileName,
        data: data
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    saveAs(blob, `${fileName}_${mode}_analysis.json`);
}

/**
 * Import analysis data from JSON file
 * Returns null if validation fails
 */
export async function importFromJSON<T>(file: File): Promise<ExportData<T> | null> {
    try {
        const text = await file.text();
        const data = JSON.parse(text) as ExportData<T>;

        // Basic validation
        if (!data.version || !data.type || !data.data) {
            console.error('Invalid import file format');
            return null;
        }

        return data;
    } catch (error) {
        console.error('Failed to parse JSON import', error);
        return null;
    }
}
