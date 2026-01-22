/**
 * Template Service
 * Frontend API for custom script template management
 */

const API_BASE_URL = import.meta.env.VITE_API_URL_V2 || 'http://localhost:8080';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TemplateSummary {
    id: string;
    name: string;
    moduleType: string;
    format: string;
    columnCount: number;
    createdAt: string | null;
}

export interface TemplateDetail {
    id: string;
    name: string;
    moduleType: string;
    structure: {
        format: string;
        columns: Array<{
            header: string;
            dataField: string;
            format?: string;
        }>;
    };
    createdAt: string | null;
    updatedAt: string | null;
}

export interface DetectedColumn {
    header: string;
    mapsTo: string;
    confidence: number;
}

export interface CreateTemplateResponse {
    id: string;
    name: string;
    moduleType: string;
    format: string;
    detectedColumns: DetectedColumn[];
}

// ═══════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List all saved templates
 */
export async function listTemplates(): Promise<TemplateSummary[]> {
    const response = await fetch(`${API_BASE_URL}/api/templates`);

    if (!response.ok) {
        throw new Error(`Failed to fetch templates: ${response.status}`);
    }

    const data = await response.json();
    return data.templates || [];
}

/**
 * Create a new template by uploading a sample file
 */
export async function createTemplate(
    name: string,
    moduleType: string,
    file: File
): Promise<CreateTemplateResponse> {
    // Convert file to base64
    const fileData = await fileToBase64(file);

    const response = await fetch(`${API_BASE_URL}/api/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            moduleType,
            fileData,
            fileName: file.name
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Failed to create template: ${response.status}`);
    }

    return response.json();
}

/**
 * Get template details
 */
export async function getTemplate(id: string): Promise<TemplateDetail> {
    const response = await fetch(`${API_BASE_URL}/api/templates/${id}`);

    if (!response.ok) {
        throw new Error(`Failed to get template: ${response.status}`);
    }

    return response.json();
}

/**
 * Delete a template
 */
export async function deleteTemplate(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/templates/${id}`, {
        method: 'DELETE'
    });

    if (!response.ok) {
        throw new Error(`Failed to delete template: ${response.status}`);
    }
}

/**
 * Download job results using a custom template
 */
export async function downloadWithTemplate(
    jobId: string,
    moduleType: string,
    templateId: string
): Promise<Blob> {
    const response = await fetch(
        `${API_BASE_URL}/api/jobs/${jobId}/download/${moduleType}?templateId=${templateId}`
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Download failed: ${response.status}`);
    }

    return response.blob();
}

/**
 * Trigger blob download in browser
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

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // Remove data URL prefix (e.g., "data:application/...;base64,")
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Module type labels for UI
export const MODULE_TYPE_LABELS: Record<string, string> = {
    shotList: 'Shot List',
    transcription: 'Transcription',
    fauna: 'Fauna/Wildlife',
    graphics: 'Graphics',
    cast: 'Cast/Bio'
};
