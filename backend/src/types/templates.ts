/**
 * Template Types
 * Data structures for custom script templates
 */

export interface ScriptTemplate {
    id: string;
    name: string;
    userId: string;
    moduleType: 'shotList' | 'transcription' | 'fauna' | 'graphics' | 'cast' | 'full';
    structure: TemplateStructure;
    createdAt: Date;
    updatedAt: Date;
}

export interface TemplateStructure {
    format: 'xlsx' | 'csv' | 'docx';
    columns: ColumnDef[];
    fieldMappings: FieldMapping[];
}

export interface ColumnDef {
    header: string;
    dataField: string;
    width?: number;
    format?: 'timecode' | 'text' | 'number' | 'duration';
}

export interface FieldMapping {
    templateField: string;
    ourField: string;
    transform?: 'uppercase' | 'lowercase' | 'titlecase';
}

export interface AnalyzedTemplate {
    detectedColumns: {
        header: string;
        mapsTo: string;
        confidence: number;
    }[];
    format: 'xlsx' | 'csv';
    rowCount: number;
}
