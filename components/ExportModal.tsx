import React from 'react';
import { X, FileText, FileJson, FileSpreadsheet, Film, Clapperboard, MessageSquare, Download } from 'lucide-react';
import { Shot, TranscriptionResult, ProjectMetadata, ShotListResult, GraphicsAnalysisResult, SpeciesSighting } from '../types';
import { generateEDL, generateFCPXML, generateResolveCSV, downloadNLEFile } from '../services/nleExportService';
import { generateSubtitles, downloadSubtitle } from '../services/subtitleService';
import { exportToWord } from '../services/documentExportService';
import { exportToJSON } from '../services/exportService';
import { generateCSV, downloadFile, applyTimecodeOffset } from '../utils/tableUtils';

export type ExportType = 'shotlist' | 'transcription' | 'graphics' | 'fauna' | 'synopsis' | 'bio' | 'asbroadcast';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: ExportType;
    data: any; // ShotListResult | TranscriptionResult | etc.
    projectMetadata: ProjectMetadata;
    videoFileName: string;
    frameRate: number;
}

const ExportModal: React.FC<ExportModalProps> = ({
    isOpen,
    onClose,
    type,
    data,
    projectMetadata,
    videoFileName,
    frameRate
}) => {
    if (!isOpen) return null;

    const exportOptions: { label: string; icon: React.ReactNode; action: () => void; description: string; color: string }[] = [];

    // Common Exports (Word, JSON)
    exportOptions.push({
        label: 'Word Document',
        icon: <FileText size={20} />,
        action: () => exportToWord({ type, data: (type === 'shotlist' ? data.shots : data), projectMetadata, fileName: videoFileName, frameRate }),
        description: 'Formatted report (.docx)',
        color: 'bg-blue-600 hover:bg-blue-700'
    });

    exportOptions.push({
        label: 'JSON Data',
        icon: <FileJson size={20} />,
        action: () => exportToJSON(data, type as any, videoFileName),
        description: 'Raw metadata (.json)',
        color: 'bg-yellow-600 hover:bg-yellow-700'
    });

    // Type Specific Exports in Priority Order

    if (type === 'shotlist') {
        const shots = (data as ShotListResult).shots;
        // CSV
        exportOptions.unshift({
            label: 'CSV Spreadsheet',
            icon: <FileSpreadsheet size={20} />,
            action: () => {
                const headers = ['Shot #', 'TC In', 'TC Out', 'Duration', 'Description', 'Action', 'Audio'];
                const rows = shots.map(s => [
                    s.nr,
                    applyTimecodeOffset(s.tcIn, projectMetadata.timecodeStart, frameRate),
                    applyTimecodeOffset(s.tcOut, projectMetadata.timecodeStart, frameRate),
                    s.duration,
                    s.description,
                    s.action,
                    s.audio
                ]);
                downloadFile(generateCSV(headers, rows), `${videoFileName}_shotlist.csv`, 'text/csv');
            },
            description: 'Excel/Sheets compatible',
            color: 'bg-green-600 hover:bg-green-700'
        });

        // Professional NLE Formats
        exportOptions.push({
            label: 'EDL (CMX 3600)',
            icon: <Film size={20} />,
            action: () => downloadNLEFile(generateEDL(shots, videoFileName, projectMetadata, frameRate), videoFileName, 'edl'),
            description: 'Avid / Premiere / Resolve',
            color: 'bg-indigo-600 hover:bg-indigo-700'
        });

        exportOptions.push({
            label: 'FCP XML (v5)',
            icon: <Clapperboard size={20} />,
            action: () => downloadNLEFile(generateFCPXML(shots, videoFileName, projectMetadata, frameRate), videoFileName, 'fcp_xml'),
            description: 'Final Cut Pro 7 / Premiere',
            color: 'bg-purple-600 hover:bg-purple-700'
        });

        exportOptions.push({
            label: 'Resolve Markers',
            icon: <MessageSquare size={20} />,
            action: () => downloadNLEFile(generateResolveCSV(shots, projectMetadata, frameRate), videoFileName, 'resolve_csv'),
            description: 'DaVinci Resolve (.csv)',
            color: 'bg-pink-600 hover:bg-pink-700'
        });
    }

    if (type === 'transcription') {
        const trans = data as TranscriptionResult;

        // CSV
        exportOptions.unshift({
            label: 'CSV Spreadsheet',
            icon: <FileSpreadsheet size={20} />,
            action: () => {
                const headers = ['Start', 'End', 'Speaker', 'Text'];
                const rows = trans.segments.map(s => [
                    applyTimecodeOffset(s.startTime, projectMetadata.timecodeStart, frameRate),
                    applyTimecodeOffset(s.endTime, projectMetadata.timecodeStart, frameRate),
                    trans.speakerMap?.[s.speaker] || s.speaker,
                    s.transcript
                ]);
                downloadFile(generateCSV(headers, rows), `${videoFileName}_transcript.csv`, 'text/csv');
            },
            description: 'Excel/Sheets compatible',
            color: 'bg-green-600 hover:bg-green-700'
        });

        // Subtitles
        exportOptions.push({
            label: 'SRT Subtitles',
            icon: <MessageSquare size={20} />,
            action: () => downloadSubtitle(generateSubtitles(trans, 'srt', projectMetadata.timecodeStart, frameRate), videoFileName, 'srt'),
            description: 'Standard Subtitles (.srt)',
            color: 'bg-orange-600 hover:bg-orange-700'
        });

        exportOptions.push({
            label: 'VTT Captions',
            icon: <MessageSquare size={20} />,
            action: () => downloadSubtitle(generateSubtitles(trans, 'vtt', projectMetadata.timecodeStart, frameRate), videoFileName, 'vtt'),
            description: 'Web & Broadcast (.vtt)',
            color: 'bg-red-600 hover:bg-red-700'
        });
    }

    if (type === 'fauna') {
        const sightings = data as SpeciesSighting[];
        exportOptions.unshift({
            label: 'CSV Spreadsheet',
            icon: <FileSpreadsheet size={20} />,
            action: () => {
                const headers = ['Common Name', 'Latin Name', 'Behavior', 'IUCN Status', 'Timecode', 'Category'];
                const rows = sightings.map(s => [
                    s.commonName,
                    s.latinName,
                    s.behavior || '',
                    s.iucnStatus || '',
                    applyTimecodeOffset(s.timecode, projectMetadata.timecodeStart, frameRate),
                    s.category
                ]);
                downloadFile(generateCSV(headers, rows), `${videoFileName}_fauna.csv`, 'text/csv');
            },
            description: 'Excel/Sheets compatible',
            color: 'bg-green-600 hover:bg-green-700'
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/80 animate-fade-in p-4" onClick={onClose}>
            <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div>
                        <h3 className="text-xl font-bold text-white">Export Options</h3>
                        <p className="text-sm text-gray-400">Select a format to download</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {exportOptions.map((opt, idx) => (
                        <button
                            key={idx}
                            onClick={() => { opt.action(); onClose(); }}
                            className={`${opt.color} p-4 rounded-lg flex items-center gap-4 transition-transform hover:scale-[1.02] text-left group`}
                        >
                            <div className="p-2 bg-black/20 rounded-full group-hover:bg-black/30 transition-colors">
                                {opt.icon}
                            </div>
                            <div>
                                <h4 className="font-bold text-white">{opt.label}</h4>
                                <p className="text-xs text-white/70">{opt.description}</p>
                            </div>
                        </button>
                    ))}
                </div>

                {projectMetadata.timecodeStart && projectMetadata.timecodeStart !== '00:00:00:00' && (
                    <div className="bg-gray-800/50 p-4 text-center border-t border-gray-800">
                        <p className="text-xs text-gray-400">
                            Timecode Offset Active: <span className="text-blue-400 font-mono">{projectMetadata.timecodeStart}</span>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExportModal;
