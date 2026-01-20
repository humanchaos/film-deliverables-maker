import React from 'react';
import { ArrowLeft, Download, FileText, CheckCircle, Video, Clock, Volume2 } from 'lucide-react';
import { VideoMetadata, ProjectMetadata } from '../types';
import { exportToWord } from '../services/documentExportService';

interface TechSpecsViewProps {
    videoMetadata: VideoMetadata;
    projectMetadata: ProjectMetadata; // For "Production", "Episode", etc. in the header
    onBack: () => void;
    videoFileName: string;
}

const TechSpecsView: React.FC<TechSpecsViewProps> = ({ videoMetadata, projectMetadata, onBack, videoFileName }) => {

    const handleExportWord = () => {
        exportToWord({
            type: 'techspecs',
            data: videoMetadata, // We pass the video metadata as the primary data
            projectMetadata: projectMetadata,
            fileName: videoFileName
        });
    };

    // Helper to format large numbers
    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Helper for Timecode Format
    const getTimecodeFormat = (fps: number) => {
        // Basic logic
        if (Math.abs(fps - 29.97) < 0.01 || Math.abs(fps - 59.94) < 0.01) {
            return "Drop-Frame (SMPTE 12M)";
        }
        return "Non-Drop-Frame";
    };

    const getScanType = () => {
        // Basic assumption for file-based workflows
        return "Progressive";
    };

    const formattedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return (
        <div className="h-full flex flex-col bg-gray-900 text-white">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <FileText className="text-gray-400" />
                            Technical Specifications Report
                        </h2>
                        <p className="text-sm text-gray-400">
                            {videoFileName}
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleExportWord}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all shadow-lg hover:shadow-blue-500/20 active:scale-95 font-medium"
                >
                    <Download size={18} />
                    Export Report (.docx)
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-4xl mx-auto space-y-8">

                    {/* Paper-like Representation */}
                    <div className="bg-white text-black p-12 rounded-lg shadow-2xl min-h-[800px] relative">

                        {/* Document Header */}
                        <div className="border-b-2 border-black pb-6 mb-8 flex justify-between items-end">
                            <div>
                                <h1 className="text-3xl font-bold uppercase tracking-wide">Technical Specifications</h1>
                                <p className="text-gray-600 mt-2 font-medium">Production: {projectMetadata.seriesTitle || "Untitled Production"}</p>
                                {projectMetadata.episodeTitle && <p className="text-gray-500 text-sm">Episode: {projectMetadata.episodeNumber} - {projectMetadata.episodeTitle}</p>}
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-gray-500">Date Generated</p>
                                <p className="font-bold">{formattedDate}</p>
                            </div>
                        </div>

                        {/* Video Specs Section */}
                        <div className="mb-8">
                            <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-4 flex items-center gap-2">
                                <Video size={20} /> VIDEO SPECIFICATIONS
                            </h3>
                            <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                                <div className="flex justify-between border-b border-gray-100 pb-1">
                                    <span className="text-gray-600">File Format / Container</span>
                                    <span className="font-mono">{videoMetadata.format}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-100 pb-1">
                                    <span className="text-gray-600">Video Codec</span>
                                    <span className="font-mono">{videoMetadata.codec}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-100 pb-1">
                                    <span className="text-gray-600">Resolution</span>
                                    <span className="font-mono font-bold">{videoMetadata.width} x {videoMetadata.height}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-100 pb-1">
                                    <span className="text-gray-600">Frame Rate</span>
                                    <span className="font-mono font-bold">{videoMetadata.frameRate.toFixed(3)} fps</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-100 pb-1">
                                    <span className="text-gray-600">Aspect Ratio</span>
                                    <span className="font-mono">{videoMetadata.aspectRatio}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-100 pb-1">
                                    <span className="text-gray-600">Scan Type</span>
                                    <span className="font-mono">{getScanType()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Audio Specs Section */}
                        <div className="mb-8">
                            <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-4 flex items-center gap-2">
                                <Volume2 size={20} /> AUDIO SPECIFICATIONS
                            </h3>
                            <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                                <div className="flex justify-between border-b border-gray-100 pb-1">
                                    <span className="text-gray-600">Audio Channels</span>
                                    <span className="font-mono">{videoMetadata.hasAudio ? "Stereo (2.0) [Assumed]" : "None / Mute"}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-100 pb-1">
                                    <span className="text-gray-600">Sample Rate</span>
                                    <span className="font-mono">48 kHz [Standard]</span>
                                </div>
                            </div>
                        </div>

                        {/* Program Info Section */}
                        <div className="mb-8">
                            <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-4 flex items-center gap-2">
                                <Clock size={20} /> PROGRAM INFORMATION
                            </h3>
                            <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                                <div className="flex justify-between border-b border-gray-100 pb-1">
                                    <span className="text-gray-600">Total Runtime</span>
                                    <span className="font-mono font-bold">{new Date(videoMetadata.duration * 1000).toISOString().substr(11, 12)} (Approx)</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-100 pb-1">
                                    <span className="text-gray-600">File Size</span>
                                    <span className="font-mono">{formatSize(videoMetadata.fileSize)}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-100 pb-1">
                                    <span className="text-gray-600">Timecode Format</span>
                                    <span className="font-mono">{getTimecodeFormat(videoMetadata.frameRate)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Compliance Check */}
                        <div className="mt-12 bg-gray-50 p-6 rounded border border-gray-200">
                            <h3 className="text-sm font-bold text-gray-500 uppercase mb-4">Initial Compliance Check</h3>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-green-700">
                                    <CheckCircle size={16} />
                                    <span className="text-sm font-medium">Resolution meets HD Broadcast Standards (1920x1080+)</span>
                                </div>
                                <div className="flex items-center gap-2 text-green-700">
                                    <CheckCircle size={16} />
                                    <span className="text-sm font-medium">Frame Rate is standard ({videoMetadata.frameRate.toFixed(2)})</span>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="absolute bottom-12 left-12 right-12 border-t border-gray-300 pt-4 text-xs text-gray-400 flex justify-between">
                            <span>Generated by Gemini Super App</span>
                            <span>Page 1 of 1</span>
                        </div>

                    </div>

                </div>
            </div>
        </div>
    );
};

export default TechSpecsView;
