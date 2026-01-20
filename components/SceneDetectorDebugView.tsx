import React, { useState, useRef } from 'react';
import { ffmpegService, VideoMetadataResult } from '../services/ffmpegService';
import { Layout, Play, Clock, Zap, Image as ImageIcon, Film, FileText } from 'lucide-react';
import { secondsToTimecode } from '../utils/tableUtils';

const SceneDetectorDebugView: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [scenes, setScenes] = useState<number[]>([]);
    const [keyframes, setKeyframes] = useState<Blob[]>([]);
    const [metadata, setMetadata] = useState<VideoMetadataResult | null>(null);
    const [activeTab, setActiveTab] = useState<'scenes' | 'keyframes' | 'metadata'>('scenes');
    const [logs, setLogs] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [threshold, setThreshold] = useState(0.4);
    const videoRef = useRef<HTMLVideoElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setScenes([]);
            setKeyframes([]);
            setMetadata(null);
            setLogs([]);
        }
    };

    const runDetection = async () => {
        if (!file) return;

        setIsProcessing(true);
        setLogs(prev => [...prev, 'Starting Scene Detection...']);

        try {
            const result = await ffmpegService.detectScenes(file, threshold, (msg) => {
                setLogs(prev => [...prev, msg]);
            });
            setScenes(result.scenes);
            setLogs(prev => [...prev, `Detection complete. Found ${result.scenes.length} scenes.`]);
        } catch (error) {
            setLogs(prev => [...prev, `Error: ${error}`]);
        } finally {
            setIsProcessing(false);
        }
    };

    const runKeyframeExtraction = async () => {
        if (!file) return;

        setIsProcessing(true);
        setLogs(prev => [...prev, 'Starting I-Frame Extraction...']);

        try {
            const result = await ffmpegService.extractKeyframes(file, (msg) => {
                setLogs(prev => [...prev, msg]);
            });
            setKeyframes(result.blobs);
            setLogs(prev => [...prev, `Extraction complete. Found ${result.blobs.length} keyframes.`]);
        } catch (error) {
            setLogs(prev => [...prev, `Error: ${error}`]);
        } finally {
            setIsProcessing(false);
        }
    };

    const runMetadataExtraction = async () => {
        if (!file) return;

        setIsProcessing(true);
        setLogs(prev => [...prev, 'Extracting Metadata...']);

        try {
            const result = await ffmpegService.getMetadata(file, (msg) => {
                setLogs(prev => [...prev, msg]);
            });
            setMetadata(result);
            setLogs(prev => [...prev, 'Metadata extraction complete.']);
        } catch (error) {
            setLogs(prev => [...prev, `Error: ${error}`]);
        } finally {
            setIsProcessing(false);
        }
    };

    const seekTo = (time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            videoRef.current.play();
        }
    };

    return (
        <div className="flex flex-col h-full bg-black text-white p-6 overflow-y-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-2">
                    <Zap className="text-green-400" />
                    WASM Scene Detector
                </h1>
                <p className="text-gray-400 mt-2">
                    "The Laws of Physics" - Client-side deterministic scene detection.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* LEFT COLUMN: Controls & Video */}
                <div className="space-y-6">
                    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                        <input
                            type="file"
                            onChange={handleFileChange}
                            accept="video/*"
                            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                        />
                        {file && <p className="mt-2 text-sm text-gray-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>}
                    </div>

                    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Threshold (0.0 - 1.0)</label>
                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={threshold}
                                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                            <span className="font-mono text-blue-400">{threshold}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Lower = More Sensitive. Higher = Only hard cuts.</p>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={() => { setActiveTab('scenes'); runDetection(); }}
                            disabled={!file || isProcessing}
                            className={`flex-1 py-4 rounded-lg font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 ${isProcessing ? 'bg-gray-700 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'}`}
                        >
                            <Film size={20} />
                            Detect Scenes
                        </button>
                        <button
                            onClick={() => { setActiveTab('keyframes'); runKeyframeExtraction(); }}
                            disabled={!file || isProcessing}
                            className={`flex-1 py-4 rounded-lg font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 ${isProcessing ? 'bg-gray-700 cursor-not-allowed' : 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700'}`}
                        >
                            <ImageIcon size={20} />
                            Extract I-Frames
                        </button>
                        <button
                            onClick={() => { setActiveTab('metadata'); runMetadataExtraction(); }}
                            disabled={!file || isProcessing}
                            className={`flex-1 py-4 rounded-lg font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 ${isProcessing ? 'bg-gray-700 cursor-not-allowed' : 'bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700'}`}
                        >
                            <FileText size={20} />
                            Get Metadata
                        </button>
                    </div>

                    {file && (
                        <div className="aspect-video bg-black rounded-lg overflow-hidden border border-gray-800 shadow-2xl relative">
                            <video
                                ref={videoRef}
                                src={URL.createObjectURL(file)}
                                controls
                                className="w-full h-full"
                            />
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: Results & Logs */}
                <div className="space-y-6">

                    {/* Logs */}
                    <div className="bg-gray-900/50 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs border border-gray-800">
                        <h3 className="text-gray-500 font-bold mb-2 uppercase tracking-wider">System Logs (WebWorker)</h3>
                        {logs.map((log, i) => (
                            <div key={i} className="text-gray-400 border-l-2 border-transparent hover:border-blue-500 pl-2">
                                {log}
                            </div>
                        ))}
                        {logs.length === 0 && <span className="text-gray-600 italic">Ready...</span>}
                    </div>

                    {/* Results */}
                    <div className="bg-gray-900 rounded-lg p-0 overflow-hidden border border-gray-800 flex-1 min-h-[400px] flex flex-col">
                        <div className="bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2">
                                {activeTab === 'scenes' && <Layout size={18} className="text-green-400" />}
                                {activeTab === 'keyframes' && <ImageIcon size={18} className="text-purple-400" />}
                                {activeTab === 'metadata' && <FileText size={18} className="text-cyan-400" />}

                                {activeTab === 'scenes' && 'Detected Scenes'}
                                {activeTab === 'keyframes' && 'Extracted Keyframes'}
                                {activeTab === 'metadata' && 'File Metadata'}
                            </h3>
                            <span className="bg-blue-900/50 text-blue-300 px-2 py-1 rounded text-xs font-mono">
                                {activeTab === 'scenes' && `${scenes.length} Cuts`}
                                {activeTab === 'keyframes' && `${keyframes.length} Frames`}
                                {activeTab === 'metadata' && (metadata ? 'Ready' : 'No Data')}
                            </span>
                        </div>

                        <div className="overflow-y-auto max-h-[500px] p-4">
                            {activeTab === 'scenes' && (
                                <div className="grid grid-cols-1 divide-y divide-gray-800">
                                    {scenes.map((time, i) => (
                                        <button
                                            key={i}
                                            onClick={() => seekTo(time)}
                                            className="flex items-center justify-between p-3 hover:bg-gray-800 transition-colors group text-left w-full rounded"
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className="text-gray-500 font-mono w-8 text-right text-xs">#{i + 1}</span>
                                                <div className="flex flex-col">
                                                    <span className="text-white font-mono font-bold flex items-center gap-2">
                                                        <Clock size={12} className="text-gray-500" />
                                                        {secondsToTimecode(time)}
                                                    </span>
                                                    <span className="text-xs text-gray-500 font-mono">
                                                        {time.toFixed(3)}s
                                                    </span>
                                                </div>
                                            </div>
                                            <Play size={16} className="text-gray-600 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all" />
                                        </button>
                                    ))}
                                    {scenes.length === 0 && !isProcessing && (
                                        <div className="p-8 text-center text-gray-500">
                                            No scenes detected yet.
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'keyframes' && (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {keyframes.map((blob, i) => (
                                        <div key={i} className="aspect-video bg-black rounded overflow-hidden border border-gray-800 relative group">
                                            <img
                                                src={URL.createObjectURL(blob)}
                                                alt={`Frame ${i}`}
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="text-white font-mono text-xs">#{i + 1}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {keyframes.length === 0 && !isProcessing && (
                                        <div className="col-span-3 p-8 text-center text-gray-500">
                                            No keyframes extracted yet.
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'metadata' && (
                                <div className="space-y-4 font-mono text-sm">
                                    {metadata ? (
                                        <>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                                    <div className="text-gray-500 text-xs uppercase mb-1">Container</div>
                                                    <div className="text-white font-bold">{metadata.container}</div>
                                                </div>
                                                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                                    <div className="text-gray-500 text-xs uppercase mb-1">Duration</div>
                                                    <div className="text-green-400 font-bold">{metadata.duration}</div>
                                                </div>
                                                <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                                    <div className="text-gray-500 text-xs uppercase mb-1">Bitrate</div>
                                                    <div className="text-blue-400 font-bold">{metadata.bitrate}</div>
                                                </div>
                                            </div>

                                            <div className="bg-gray-800 p-4 rounded border border-gray-700">
                                                <div className="text-gray-500 text-xs uppercase mb-2">Streams</div>
                                                <div className="space-y-2">
                                                    {metadata.streams.map((s, i) => (
                                                        <div key={i} className="text-xs text-gray-300 border-l-2 border-purple-500 pl-2">
                                                            {s}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="bg-gray-900 border border-gray-700 rounded p-4">
                                                <div className="text-gray-500 text-xs uppercase mb-2">Raw FFmpeg Log</div>
                                                <pre className="text-[10px] text-gray-400 whitespace-pre-wrap overflow-x-auto">
                                                    {metadata.rawLogs}
                                                </pre>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="p-8 text-center text-gray-500">
                                            No metadata extracted yet.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SceneDetectorDebugView;
