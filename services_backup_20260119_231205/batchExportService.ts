
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Packer } from 'docx';
import {
    generateShotListDoc,
    generateSynopsisDoc,
    generateDialogueListDoc,
    generateBioDoc,
    generateFaunaLogDoc,
    generateGraphicsLogDoc,
    generateTechSpecsDoc,
    generateAsBroadcastScriptDoc
} from './documentExportService';
import {
    ShotListResult,
    Synopsis,
    TranscriptionResult,
    Bio,
    SpeciesSighting,
    GraphicsAnalysisResult,
    VideoMetadata,
    ProjectMetadata,
    FullAnalysisResult,
    AllJobs
} from '../types';

/**
 * Batch Export Service
 * Zips all available analysis results into a single download package.
 */

export async function exportAllDeliverables(
    jobs: AllJobs,
    projectMetadata: ProjectMetadata,
    videoFileName: string
) {
    const zip = new JSZip();
    const baseName = videoFileName.replace(/\.[^/.]+$/, "");
    const dateStr = new Date().toISOString().split('T')[0];
    const folderName = `${baseName}_Deliverables_${dateStr}`;

    const root = zip.folder(folderName);
    if (!root) throw new Error("Failed to create zip folder");

    const promises: Promise<void>[] = [];

    // 1. Technical Specs
    if (jobs.techspecs.result) {
        promises.push(addToZip(root, 'TechSpecs.docx', generateTechSpecsDoc(jobs.techspecs.result, projectMetadata)));
    }
    // Fallback: Check full_analysis? (Not strictly implemented in full analysis state yet, usually calculated in App)

    // 2. Shot List
    if (jobs.shotlist.result) {
        promises.push(addToZip(root, 'ShotList.docx', generateShotListDoc(jobs.shotlist.result.shots, projectMetadata)));
    }

    // 3. Transcription / Dialogue List
    if (jobs.transcribe.result) {
        promises.push(addToZip(root, 'DialogueList.docx', generateDialogueListDoc(jobs.transcribe.result, projectMetadata)));
    }

    // 4. Synopsis
    if (jobs.synopsis.result) {
        promises.push(addToZip(root, 'Synopsis.docx', generateSynopsisDoc(jobs.synopsis.result, projectMetadata)));
    }

    // 5. Bio
    if (jobs.bio.result) {
        promises.push(addToZip(root, 'TalentBios.docx', generateBioDoc(jobs.bio.result, projectMetadata)));
    }

    // 6. Graphics Log
    if (jobs.graphics.result) {
        promises.push(addToZip(root, 'GraphicsLog.docx', generateGraphicsLogDoc(jobs.graphics.result, projectMetadata)));
    }

    if (jobs.fauna.result) {
        promises.push(addToZip(root, 'FaunaLog.docx', generateFaunaLogDoc(jobs.fauna.result, projectMetadata)));
    }

    // 8. AS-BROADCAST SCRIPT (Combined)
    if (jobs.transcribe.result && jobs.shotlist.result) {
        const asBroadcastData = {
            transcription: jobs.transcribe.result,
            shotList: jobs.shotlist.result,
            graphics: jobs.graphics.result || undefined
        };
        promises.push(addToZip(root, 'AsBroadcastScript.docx', generateAsBroadcastScriptDoc(asBroadcastData, projectMetadata)));
    }

    // Wait for all generations
    await Promise.all(promises);

    // Generate zip
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${folderName}.zip`);
}

async function addToZip(folder: JSZip, filename: string, docCreator: any) {
    try {
        // Doc creator returns a docx Document object
        const blob = await Packer.toBlob(docCreator);
        folder.file(filename, blob);
    } catch (e) {
        console.error(`Failed to generate ${filename}`, e);
    }
}
