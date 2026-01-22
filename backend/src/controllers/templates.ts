/**
 * Templates Controller
 * CRUD operations for custom script templates
 */

import type { Request, Response } from 'express';
import { getDb, Timestamp } from '../services/firebase.js';
import { analyzeTemplate, buildTemplateStructure } from '../services/templateAnalyzer.js';
import { renderWithTemplate } from '../services/templateRenderer.js';
import type { ScriptTemplate } from '../types/templates.js';

// Generate simple ID
function generateId(): string {
    return `tmpl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * POST /api/templates
 * Upload and analyze a new template
 */
export async function createTemplate(req: Request, res: Response): Promise<void> {
    try {
        const { name, moduleType, fileData, fileName } = req.body;

        if (!name || !moduleType || !fileData || !fileName) {
            res.status(400).json({
                error: 'Missing required fields: name, moduleType, fileData, fileName'
            });
            return;
        }

        // Validate module type
        const validModules = ['shotList', 'transcription', 'fauna', 'graphics', 'cast'];
        if (!validModules.includes(moduleType)) {
            res.status(400).json({
                error: `Invalid moduleType. Must be one of: ${validModules.join(', ')}`
            });
            return;
        }

        // Decode base64 file data
        const fileBuffer = Buffer.from(fileData, 'base64');

        // Analyze the template
        console.log(`[Templates] Analyzing template: ${fileName}`);
        const analyzed = await analyzeTemplate(fileBuffer, fileName, moduleType);

        // Build structure
        const structure = buildTemplateStructure(analyzed, moduleType);

        // Create template document
        const template: Omit<ScriptTemplate, 'id'> = {
            name,
            userId: 'default', // TODO: Add auth
            moduleType,
            structure,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const db = getDb();
        const id = generateId();
        await db.collection('templates').doc(id).set({
            ...template,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });

        console.log(`[Templates] Created template: ${id} (${name})`);

        res.status(201).json({
            id,
            name,
            moduleType,
            format: analyzed.format,
            detectedColumns: analyzed.detectedColumns
        });
    } catch (error) {
        console.error('[Templates] Create failed:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to create template'
        });
    }
}

/**
 * GET /api/templates
 * List all templates
 */
export async function listTemplates(req: Request, res: Response): Promise<void> {
    try {
        const db = getDb();
        const snapshot = await db.collection('templates').get();

        const templates = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                moduleType: data.moduleType,
                format: data.structure?.format,
                columnCount: data.structure?.columns?.length || 0,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null
            };
        });

        res.json({ templates });
    } catch (error) {
        console.error('[Templates] List failed:', error);
        res.status(500).json({ error: 'Failed to list templates' });
    }
}

/**
 * GET /api/templates/:id
 * Get template details
 */
export async function getTemplate(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const db = getDb();
        const doc = await db.collection('templates').doc(id).get();

        if (!doc.exists) {
            res.status(404).json({ error: 'Template not found' });
            return;
        }

        const data = doc.data()!;
        res.json({
            id: doc.id,
            name: data.name,
            moduleType: data.moduleType,
            structure: data.structure,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null
        });
    } catch (error) {
        console.error('[Templates] Get failed:', error);
        res.status(500).json({ error: 'Failed to get template' });
    }
}

/**
 * PUT /api/templates/:id
 * Update template name
 */
export async function updateTemplate(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name) {
            res.status(400).json({ error: 'Name is required' });
            return;
        }

        const db = getDb();
        const docRef = db.collection('templates').doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({ error: 'Template not found' });
            return;
        }

        await docRef.update({
            name,
            updatedAt: Timestamp.now()
        });

        res.json({ success: true, id, name });
    } catch (error) {
        console.error('[Templates] Update failed:', error);
        res.status(500).json({ error: 'Failed to update template' });
    }
}

/**
 * DELETE /api/templates/:id
 * Delete a template
 */
export async function deleteTemplate(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const db = getDb();
        const docRef = db.collection('templates').doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({ error: 'Template not found' });
            return;
        }

        await docRef.delete();
        console.log(`[Templates] Deleted template: ${id}`);

        res.json({ success: true });
    } catch (error) {
        console.error('[Templates] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
}

/**
 * GET /api/jobs/:jobId/download/:module
 * Download job results with optional template
 */
export async function downloadWithTemplate(req: Request, res: Response): Promise<void> {
    try {
        const { jobId, module } = req.params;
        const { templateId } = req.query;

        const db = getDb();
        const jobDoc = await db.collection('jobs').doc(jobId).get();

        if (!jobDoc.exists) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        const job = jobDoc.data()!;
        if (!job.results) {
            res.status(400).json({ error: 'Job has no results yet' });
            return;
        }

        if (templateId && typeof templateId === 'string') {
            // Use custom template
            console.log(`[Download] Using template ${templateId} for job ${jobId}`);
            const { buffer, filename, mimeType } = await renderWithTemplate(
                job.results,
                templateId
            );

            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(buffer);
        } else {
            // Default JSON export
            const moduleData = job.results[module];
            if (!moduleData) {
                res.status(400).json({ error: `No data for module: ${module}` });
                return;
            }

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${module}_${jobId}.json"`);
            res.json(moduleData);
        }
    } catch (error) {
        console.error('[Download] Failed:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Download failed'
        });
    }
}
