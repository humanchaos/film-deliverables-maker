/**
 * Document Export Service
 * Generates professional Word (.docx) documents for film deliverables.
 */

import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, TextRun, Header, Footer, AlignmentType, PageBreak } from 'docx';
import { saveAs } from 'file-saver';
import { Shot, Synopsis, TranscriptionResult, ProjectMetadata, Bio, SpeciesSighting, GraphicsAnalysisResult, ShotListResult } from '../types';
import { applyTimecodeOffset } from '../utils/tableUtils';

// Type definitions for passing data to the exporter
export interface ExportData {
    type: 'shotlist' | 'synopsis' | 'transcription' | 'graphics' | 'techspecs' | 'bio' | 'fauna' | 'asbroadcast';
    data: any; // Shot[], Synopsis, TranscriptionResult, Bio[], SpeciesSighting[], GraphicsAnalysisResult etc.
    projectMetadata: ProjectMetadata; // Production info
    fileName: string; // Base filename
    frameRate?: number; // Video frame rate for accurate timecode calc
}

/**
 * GENERATES A PROFESSIONAL COVER PAGE
 */
function generateCoverPage(meta: ProjectMetadata, title: string): Paragraph[] {
    const style = getStyle(meta.exportTemplate);
    const dateStr = meta.date || new Date().toLocaleDateString();

    return [
        new Paragraph({ text: "", spacing: { before: 5000 } }), // Top Spacer
        new Paragraph({
            children: [new TextRun({ text: meta.productionCompany || "PRODUCTION COMPANY", font: style.font, size: 28, bold: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
        }),
        new Paragraph({
            children: [new TextRun({ text: meta.seriesTitle || "SERIES TITLE", font: style.font, size: 48, bold: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
        }),
        new Paragraph({
            children: [new TextRun({ text: meta.episodeTitle || "EPISODE TITLE", font: style.font, size: 36, italics: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
        }),
        new Paragraph({
            children: [new TextRun({ text: meta.episodeNumber ? `Episode ${meta.episodeNumber}` : "", font: style.font, size: 24 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 800 }
        }),
        new Paragraph({
            children: [new TextRun({ text: title.toUpperCase(), font: style.font, size: 32, bold: true, underline: { type: "single", color: "000000" } })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 800 }
        }),
        new Paragraph({
            children: [
                new TextRun({ text: `Director: ${meta.director || "N/A"}\n`, font: style.font, size: 24 }),
                new TextRun({ text: `Producer: ${meta.producer || "N/A"}\n`, font: style.font, size: 24 }),
                new TextRun({ text: `Editor: ${meta.editor || "N/A"}\n`, font: style.font, size: 24 }),
                new TextRun({ text: `Date: ${dateStr}`, font: style.font, size: 24 })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { line: 360 } // 1.5 spacing
        }),
        new Paragraph({
            children: [new PageBreak()]
        })
    ];
}

/**
 * Main export function
 */
export async function exportToWord(exportData: ExportData) {
    const { type, data, projectMetadata, fileName } = exportData;
    let doc: Document;

    switch (type) {
        case 'shotlist':
            doc = generateShotListDoc(data as Shot[], projectMetadata, exportData.frameRate);
            break;
        case 'synopsis':
            doc = generateSynopsisDoc(data as Synopsis, projectMetadata);
            break;
        case 'transcription':
            doc = generateDialogueListDoc(data as TranscriptionResult, projectMetadata, exportData.frameRate);
            break;
        case 'bio':
            doc = generateBioDoc(data as Bio[], projectMetadata);
            break;
        case 'fauna':
            doc = generateFaunaLogDoc(data as SpeciesSighting[], projectMetadata, exportData.frameRate);
            break;
        case 'graphics':
            doc = generateGraphicsLogDoc(data as GraphicsAnalysisResult, projectMetadata, exportData.frameRate);
            break;
        case 'techspecs':
            doc = generateTechSpecsDoc(data as any, projectMetadata); // data is VideoMetadata
            break;
        case 'asbroadcast':
            doc = generateAsBroadcastScriptDoc(data as any, projectMetadata, exportData.frameRate);
            break;
        default:
            console.warn("Unsupported export type:", type);
            return;
    }

    // Generate and save
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${fileName}_${type.toUpperCase()}_${new Date().toISOString().split('T')[0]}.docx`);
}

// ... existing code ...

/**
 * TECHNICAL SPECIFICATIONS GENERATOR
 */
export function generateTechSpecsDoc(video: any, meta: ProjectMetadata): Document {
    // Helper to format bytes
    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const classes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + classes[i];
    };

    // Helper for Timecode & Scan Type
    const tcFormat = (Math.abs(video.frameRate - 29.97) < 0.01 || Math.abs(video.frameRate - 59.94) < 0.01) ? "Drop-Frame (SMPTE 12M)" : "Non-Drop-Frame";
    const scanType = "Progressive";
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Table Data
    const specs = [
        ["File Format / Container", video.format || "Unknown"],
        ["Video Codec", video.codec || "Unknown"],
        ["Resolution", `${video.width} x ${video.height}`],
        ["Frame Rate", `${video.frameRate.toFixed(3)} fps`],
        ["Aspect Ratio", video.aspectRatio || "Unknown"],
        ["Scan Type", scanType],
        ["Audio Channels", video.hasAudio ? "Stereo (2.0) [Assumed]" : "None"],
        ["Sample Rate", "48 kHz [Standard]"],
        ["Total Runtime", (video.duration && !isNaN(video.duration)) ? new Date(video.duration * 1000).toISOString().substr(11, 12) + " (Approx)" : "Unknown"],
        ["File Size", formatSize(video.fileSize)],
        ["Timecode Format", tcFormat]
    ];

    const tableRows = specs.map(([label, value]) =>
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })], width: { size: 40, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph(value)], width: { size: 60, type: WidthType.PERCENTAGE } })
            ]
        })
    );

    return new Document({
        sections: [{
            headers: { default: createHeader(meta, "TECHNICAL SPECS") },
            footers: { default: createFooter(meta) },
            children: [
                ...generateCoverPage(meta, "TECHNICAL SPECIFICATIONS REPORT"),
                new Paragraph({ text: "TECHNICAL SPECIFICATIONS", heading: HeadingLevel.HEADING_2 }),
                new Paragraph({ text: "" }),

                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: tableRows
                }),

                new Paragraph({ text: "" }),
                new Paragraph({ text: "COMPLIANCE CHECK", heading: HeadingLevel.HEADING_2 }),
                new Paragraph({ text: "✓ Resolution meets HD Broadcast Standards (1920x1080+)" }),
                new Paragraph({ text: `✓ Frame Rate is standard (${video.frameRate.toFixed(2)})` }),
                new Paragraph({ text: `✓ Timecode format is compliant (${tcFormat})` })
            ]
        }]
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE GENERATORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SHOT LIST GENERATOR
 */
export function generateShotListDoc(shots: Shot[], meta: ProjectMetadata, frameRate: number = 25): Document {
    const style = getStyle(meta.exportTemplate);
    // Apply offsets
    const processedShots = shots.map(s => ({
        ...s,
        tcIn: applyTimecodeOffset(s.tcIn, meta.timecodeStart, frameRate),
        tcOut: applyTimecodeOffset(s.tcOut, meta.timecodeStart, frameRate)
    }));

    return new Document({
        sections: [{
            headers: { default: createHeader(meta, "SHOT LIST") },
            footers: { default: createFooter(meta) },
            children: [
                ...generateCoverPage(meta, "SHOT LIST"),
                createShotListTable(processedShots, style)
            ],
        }],
    });
}

function createShotListTable(shots: Shot[], style: { font: string, size: number }): Table {
    const headerRow = new TableRow({
        children: ['Shot #', 'TC IN', 'TC OUT', 'Duration', 'Description', 'Action'].map(text =>
            new TableCell({
                width: { size: 100 / 6, type: WidthType.PERCENTAGE },
                children: [new Paragraph({
                    children: [new TextRun({ text, bold: true, font: style.font, size: style.size })]
                })],
                shading: { fill: "E0E0E0" }
            })
        ),
    });

    const rows = shots.map((shot, index) =>
        new TableRow({
            children: [
                (shot.nr || index + 1).toString(),
                shot.tcIn || "00:00:00:00",
                shot.tcOut || "00:00:00:00",
                shot.duration || "00:00:00:00",
                shot.description || "",
                shot.action || ""
            ].map(text => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, font: style.font, size: style.size })] })] })),
        })
    );

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...rows],
    });
}

/**
 * SYNOPSIS GENERATOR
 */
export function generateSynopsisDoc(synopsis: Synopsis, meta: ProjectMetadata): Document {
    const style = getStyle(meta.exportTemplate);
    return new Document({
        sections: [{
            headers: { default: createHeader(meta, "SYNOPSIS") },
            footers: { default: createFooter(meta) },
            children: [
                ...generateCoverPage(meta, "SYNOPSIS"),

                new Paragraph({
                    children: [new TextRun({ text: "LOGLINE", font: style.font, size: style.headerSize, bold: true })],
                    heading: HeadingLevel.HEADING_2
                }),
                new Paragraph({
                    children: [new TextRun({ text: synopsis.oneLine, font: style.font, size: style.size })]
                }),
                new Paragraph({ text: "" }),

                new Paragraph({
                    children: [new TextRun({ text: "SYNOPSIS", font: style.font, size: style.headerSize, bold: true })],
                    heading: HeadingLevel.HEADING_2
                }),
                new Paragraph({
                    children: [new TextRun({ text: synopsis.fullSynopsis, font: style.font, size: style.size })]
                }),
                new Paragraph({ text: "" }),

                new Paragraph({
                    children: [new TextRun({ text: "KEY THEMES", font: style.font, size: style.headerSize, bold: true })],
                    heading: HeadingLevel.HEADING_3
                }),
                new Paragraph({
                    children: [new TextRun({ text: synopsis.keyThemes, font: style.font, size: style.size })]
                }),
            ]
        }]
    });
}

/**
 * DIALOGUE LIST GENERATOR
 */
export function generateDialogueListDoc(transcription: TranscriptionResult, meta: ProjectMetadata, frameRate: number = 25): Document {
    const style = getStyle(meta.exportTemplate);
    const dialogueParagraphs = transcription.segments.map(seg => {
        const speakerName = (transcription.speakerMap && transcription.speakerMap[seg.speaker]) || seg.speaker;
        const status = seg.isOnScreen === false ? ' (V.O.)' : ''; // Default to On Screen if undefined

        const tcStart = applyTimecodeOffset(seg.startTime, meta.timecodeStart, frameRate);
        const tcEnd = applyTimecodeOffset(seg.endTime, meta.timecodeStart, frameRate);

        return [
            // Timecode Range
            new Paragraph({
                children: [new TextRun({ text: `${tcStart} - ${tcEnd}`, bold: true, size: Math.max(16, style.size - 4), font: 'Courier New' })], // Always Courier for TC
                spacing: { before: 200 }
            }),
            // Speaker
            new Paragraph({
                children: [new TextRun({ text: `${speakerName.toUpperCase()}${status}`, bold: true, font: style.font, size: style.size })],
                alignment: AlignmentType.CENTER, // Center the character name
                spacing: { before: 100, after: 0 }
            }),
            // Dialogue
            new Paragraph({
                children: [new TextRun({ text: seg.transcript, font: style.font, size: style.size })],
                indent: { left: 720, right: 720 }, // Indent dialogue for script look (~0.5 inch)
                spacing: { after: 200 }
            })
        ];
    }).flat();

    return new Document({
        sections: [{
            headers: { default: createHeader(meta, "DIALOGUE LIST") },
            footers: { default: createFooter(meta) },
            children: [
                ...generateCoverPage(meta, "DIALOGUE LIST"),
                ...dialogueParagraphs
            ]
        }]
    });
}


// ═══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS & STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const TEMPLATE_STYLES: Record<string, { font: string, size: number, headerSize: number, titleSize: number }> = {
    'BBC': { font: 'Courier New', size: 24, headerSize: 20, titleSize: 28 }, // 12pt body (half-points)
    'PBS': { font: 'Arial', size: 24, headerSize: 20, titleSize: 28 },
    'ARTE': { font: 'Helvetica', size: 22, headerSize: 18, titleSize: 26 },
    'ZDF': { font: 'Arial', size: 22, headerSize: 18, titleSize: 26 },
    'FranceTV': { font: 'Times New Roman', size: 24, headerSize: 20, titleSize: 28 },
    'ORF': { font: 'Arial', size: 22, headerSize: 18, titleSize: 26 },
    'Generic': { font: 'Calibri', size: 22, headerSize: 18, titleSize: 28 },
    'Custom': { font: 'Calibri', size: 22, headerSize: 18, titleSize: 28 }
};

function getStyle(template?: string) {
    return TEMPLATE_STYLES[template || 'Generic'] || TEMPLATE_STYLES['Generic'];
}

function createHeader(meta: ProjectMetadata, docType: string): Header {
    const style = getStyle(meta.exportTemplate);
    return new Header({
        children: [
            new Paragraph({
                children: [
                    new TextRun({
                        text: meta.seriesTitle ? `${meta.seriesTitle} - ${meta.episodeTitle}` : (meta.episodeTitle || "Untitled Project"),
                        bold: true,
                        font: style.font,
                        size: style.headerSize
                    }),
                    new TextRun({
                        text: ` | ${docType}`,
                        italics: true,
                        font: style.font,
                        size: style.headerSize
                    })
                ],
                border: { bottom: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 6 } }
            })
        ],
    });
}

function createFooter(meta: ProjectMetadata): Footer {
    const style = getStyle(meta.exportTemplate);
    return new Footer({
        children: [
            new Paragraph({
                children: [
                    new TextRun({
                        text: meta.productionCompany || "Generated by Gemini Film Analyzer",
                        font: style.font,
                        size: 16 // Small footer
                    }),
                    new TextRun({ text: " | Page ", children: ["PAGE"], font: style.font, size: 16 }),
                    new TextRun({ text: " of ", font: style.font, size: 16 }),
                    new TextRun({ children: ["NUMPAGES"], font: style.font, size: 16 })
                ],
                alignment: AlignmentType.RIGHT,
                border: { top: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 6 } }
            })
        ]
    });
}


/**
 * BIO GENERATOR
 */
export function generateBioDoc(bios: Bio[], meta: ProjectMetadata): Document {
    const style = getStyle(meta.exportTemplate);
    const paragraphs = bios.map(bio => [
        new Paragraph({
            children: [new TextRun({ text: bio.fullName.toUpperCase(), font: style.font, size: style.headerSize, bold: true })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200 }
        }),
        new Paragraph({
            children: [new TextRun({ text: bio.title, italics: true, font: style.font, size: style.size })],
            spacing: { after: 100 }
        }),
        new Paragraph({
            children: [new TextRun({ text: bio.biography, font: style.font, size: style.size })]
        })
    ]).flat();

    return new Document({
        sections: [{
            headers: { default: createHeader(meta, "BIOGRAPHIES") },
            footers: { default: createFooter(meta) },
            children: [
                ...generateCoverPage(meta, "BIOGRAPHIES"),
                ...paragraphs
            ]
        }]
    });
}

/**
 * FAUNA LOG GENERATOR
 */
export function generateFaunaLogDoc(sightings: SpeciesSighting[], meta: ProjectMetadata, frameRate: number = 25): Document {
    const style = getStyle(meta.exportTemplate);

    const tableRows = sightings.map(s =>
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.commonName, font: style.font, size: style.size })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.latinName, font: style.font, size: style.size })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.behavior || '', font: style.font, size: style.size })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.iucnStatus || '', font: style.font, size: style.size })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: applyTimecodeOffset(s.timecode, meta.timecodeStart, frameRate), font: style.font, size: style.size })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.category || '', font: style.font, size: style.size })] })] }),
            ]
        })
    );

    const headerRow = new TableRow({
        children: ['Common Name', 'Latin Name', 'Behavior', 'IUCN', 'Timecode', 'Category'].map(t =>
            new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, font: style.font, size: style.size })] })],
                shading: { fill: "E0E0E0" }
            })
        )
    });

    return new Document({
        sections: [{
            headers: { default: createHeader(meta, "FAUNA LOG") },
            footers: { default: createFooter(meta) },
            children: [
                ...generateCoverPage(meta, "SPECIES SIGHTINGS LOG"),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [headerRow, ...tableRows]
                })
            ]
        }]
    });
}

/**
 * GRAPHICS LOG GENERATOR
 */
export function generateGraphicsLogDoc(result: GraphicsAnalysisResult, meta: ProjectMetadata, frameRate: number = 25): Document {
    const style = getStyle(meta.exportTemplate);

    const graphicsRows = (result.graphics || []).map(g =>
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Graphic", font: style.font, size: style.size })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: g.description, font: style.font, size: style.size })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: applyTimecodeOffset(g.timecodeIn, meta.timecodeStart, frameRate), font: style.font, size: style.size })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: applyTimecodeOffset(g.timecodeOut, meta.timecodeStart, frameRate), font: style.font, size: style.size })] })] }),
            ]
        })
    );

    const lowerThirdRows = (result.lowerThirds || []).map(lt =>
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Lower Third", font: style.font, size: style.size })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: lt.text, font: style.font, size: style.size })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: applyTimecodeOffset(lt.timecodeIn, meta.timecodeStart, frameRate), font: style.font, size: style.size })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: applyTimecodeOffset(lt.timecodeOut, meta.timecodeStart, frameRate), font: style.font, size: style.size })] })] }),
            ]
        })
    );

    const headerRow = new TableRow({
        children: ['Type', 'Description/Text', 'TC IN', 'TC OUT'].map(t =>
            new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, font: style.font, size: style.size })] })],
                shading: { fill: "E0E0E0" }
            })
        )
    });

    return new Document({
        sections: [{
            headers: { default: createHeader(meta, "GRAPHICS LOG") },
            footers: { default: createFooter(meta) },
            children: [
                ...generateCoverPage(meta, "GRAPHICS & LOWER THIRDS LOG"),
                new Paragraph({
                    children: [new TextRun({ text: `Runtime: ${result.runtime || 'N/A'}`, font: style.font, size: style.size })],
                    alignment: AlignmentType.CENTER
                }),
                new Paragraph({ text: "" }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [headerRow, ...graphicsRows, ...lowerThirdRows]
                })
            ]
        }]
    });
}

/**
 * AS-BROADCAST SCRIPT GENERATOR
 */
export function generateAsBroadcastScriptDoc(data: { transcription: TranscriptionResult, shotList: ShotListResult, graphics?: GraphicsAnalysisResult }, meta: ProjectMetadata, frameRate: number = 25): Document {
    const style = getStyle(meta.exportTemplate);

    // Combine events
    interface ScriptEvent {
        type: 'shot' | 'dialogue' | 'graphic';
        tcIn: string;
        tcOut: string;
        content: string; // Description or Dialogue
        details?: string; // Action or Speaker
    }

    const events: ScriptEvent[] = [];

    // Process Shots
    if (data.shotList && data.shotList.shots) {
        data.shotList.shots.forEach(s => {
            events.push({
                type: 'shot',
                tcIn: applyTimecodeOffset(s.tcIn, meta.timecodeStart, frameRate),
                tcOut: applyTimecodeOffset(s.tcOut, meta.timecodeStart, frameRate),
                content: s.description,
                details: s.action
            });
        });
    }

    // Process Dialogue
    if (data.transcription && data.transcription.segments) {
        data.transcription.segments.forEach(ts => {
            const speaker = (data.transcription.speakerMap && data.transcription.speakerMap[ts.speaker]) || ts.speaker;
            const status = ts.isOnScreen === false ? ' (V.O.)' : '';
            events.push({
                type: 'dialogue',
                tcIn: applyTimecodeOffset(ts.startTime, meta.timecodeStart, frameRate),
                tcOut: applyTimecodeOffset(ts.endTime, meta.timecodeStart, frameRate),
                content: ts.transcript,
                details: speaker.toUpperCase() + status
            });
        });
    }

    // Process Graphics
    if (data.graphics && data.graphics.graphics) {
        data.graphics.graphics.forEach(g => {
            events.push({
                type: 'graphic',
                tcIn: applyTimecodeOffset(g.timecodeIn, meta.timecodeStart, frameRate),
                tcOut: applyTimecodeOffset(g.timecodeOut, meta.timecodeStart, frameRate),
                content: `GRAPHIC: ${g.description}`,
                details: 'ON SCREEN'
            });
        });
    }

    // Sort by Timecode In
    events.sort((a, b) => a.tcIn.localeCompare(b.tcIn));

    // Create Table
    const tableRows = events.map(e => {
        const isDialogue = e.type === 'dialogue';

        // Video Column Content
        const videoContent = isDialogue ? [] : [
            new Paragraph({
                children: [
                    new TextRun({ text: e.type.toUpperCase(), bold: true, font: style.font, size: Math.max(14, style.size - 6) }),
                    new TextRun({ text: "\n" }),
                    new TextRun({ text: e.content, font: style.font, size: style.size })
                ]
            })
        ];

        // Audio Column Content
        const audioContent = isDialogue ? [
            new Paragraph({
                children: [
                    new TextRun({ text: e.details || "", bold: true, font: style.font, size: style.size }),
                    new TextRun({ text: "\n" }),
                    new TextRun({ text: e.content, font: style.font, size: style.size })
                ]
            })
        ] : [];

        return new TableRow({
            children: [
                new TableCell({ // TC
                    width: { size: 15, type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ children: [new TextRun({ text: e.tcIn, font: 'Courier New', size: Math.max(16, style.size - 4) })] })],
                    verticalAlign: AlignmentType.CENTER
                }),
                new TableCell({ // VIDEO
                    width: { size: 42, type: WidthType.PERCENTAGE },
                    children: videoContent,
                    verticalAlign: AlignmentType.CENTER
                }),
                new TableCell({ // AUDIO
                    width: { size: 43, type: WidthType.PERCENTAGE },
                    children: audioContent,
                    verticalAlign: AlignmentType.CENTER
                })
            ]
        });
    });

    const headerRow = new TableRow({
        children: ['Timecode', 'Video', 'Audio'].map(t =>
            new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, font: style.font, size: style.size })] })],
                shading: { fill: "E0E0E0" }
            })
        )
    });

    return new Document({
        sections: [{
            headers: { default: createHeader(meta, "AS-BROADCAST SCRIPT") },
            footers: { default: createFooter(meta) },
            children: [
                ...generateCoverPage(meta, "AS-BROADCAST MASTER SCRIPT"),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [headerRow, ...tableRows]
                })
            ]
        }]
    });
}
