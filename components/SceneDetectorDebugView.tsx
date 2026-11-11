import React, { useState, useRef, useEffect } from 'react';
import { ffmpegService, SceneInterval, buildSceneIntervals, VideoMetadataResult } from '../services/ffmpegService';
import { VideoFrameExtractor } from '../utils/videoFrameExtractor';
import { Layout, Play, Clock, Zap, Image as ImageIcon, Film, FileText, Layers } from 'lucide-react';
import { secondsToTimecode } from '../utils/tableUtils';

const SceneDetectorDebugView: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [scenes, setScenes] = useState<number[]>([]);       // raw cut points
    const [videoDuration, setVideoDuration] = useState(0);     // from FFmpeg header
    const [keyframes, setKeyframes] = useState<Blob[]>([]);
    const [metadata, setMetadata] = useState<VideoMetadataResult | null>(null);
    const [sceneIntervals, setSceneIntervals] = useState<SceneInterval[]>([]);
    const [middleFrames, setMiddleFrames] = useState<{ interval: SceneInterval; url: string }[]>([]);
    const [activeTab, setActiveTab] = useState<'scenes' | 'middleframes' | 'keyframes' | 'metadata'>('scenes');
    const [logs, setLogs] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [threshold, setThreshold] = useState(0.4);
    const videoRef = useRef<HTMLVideoElement>(null);
    // Single object URL for the video preview — revoked on file change to prevent leak
    const videoUrlRef = useRef<string | null>(null);
    const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

    const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

    // Revoke old URL and create a new one when file changes
    useEffect(() => {
        if (!file) return;
        if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
        const url = URL.createObjectURL(file);
        videoUrlRef.current = url;
        setVideoPreviewUrl(url);
        return () => {
            if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
        };
    }, [file]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setScenes([]);
            setVideoDuration(0);
            setKeyframes([]);
            setMetadata(null);
            setSceneIntervals([]);
            // Revoke old middle-frame URLs
            middleFrames.forEach(f => URL.revokeObjectURL(f.url));
            setMiddleFrames([]);
            setLogs([]);
        }
    };

    const runDetection = async () => {
        if (!file) return;
        setIsProcessing(true);
        addLog('Starting Scene Detection...');

        try {
            const result = await ffmpegService.detectScenes(file, threshold, addLog);
            setScenes(result.scenes);
            setVideoDuration(result.duration);

            const intervals = buildSceneIntervals(result.scenes, result.duration);
            setSceneIntervals(intervals);

            addLog(`Detection complete. ${result.scenes.length} cut points → ${intervals.length} scenes. Video duration: ${result.duration.toFixed(2)}s`);
        } catch (error) {
            addLog(`Error: ${error}`);
        } finally {
            setIsProcessing(false);
        }
    };

    /**
     * Main new feature: detect scenes → extract middle frame of each → display.
     * Only one frame per shot is extracted, which is the basis for AI analysis.
     */
    const runMiddleFrameExtraction = async () => {
        if (!file) return;
        setIsProcessing(true);
        setActiveTab('middleframes');
        // Revoke old frame URLs before resetting
        middleFrames.forEach(f => URL.revokeObjectURL(f.url));
        setMiddleFrames([]);
        addLog('Step 1/2 — Detecting scene boundaries...');

        try {
            // Step 1: detect cuts + duration via FFmpeg WASM
            const result = await ffmpegService.detectScenes(file, threshold, addLog);
            setScenes(result.scenes);
            setVideoDuration(result.duration);

            const intervals = buildSceneIntervals(result.scenes, result.duration);
            setSceneIntervals(intervals);
            addLog(`Found ${intervals.length} scene intervals. Midpoints: ${intervals.map(i => i.midpoint.toFixed(2)).join(', ')}s`);

            // Step 2: extract a single frame per scene at its midpoint using the browser canvas API
            addLog(`Step 2/2 — Extracting ${intervals.length} representative frames...`);
            const midpoints = intervals.map(i => i.midpoint);
            const blobs = await VideoFrameExtractor.extractFrames(file, midpoints);

            const frames = blobs.map((blob, i) => ({
                interval: intervals[i],
                url: URL.createObjectURL(blob),
            }));
            setMiddleFrames(frames);
            addLog(`Done. ${frames.length} representative frames extracted — ready to send to AI.`);
        } catch (error) {
            addLog(`Error: ${error}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const runKeyframeExtraction = async () => {
        if (!file) return;
        setIsProcessing(true);
        addLog('Starting I-Frame Extraction...');

        try {
            const result = await ffmpegService.extractKeyframes(file, addLog);
            setKeyframes(result.blobs);
            addLog(`Extraction complete. Found ${result.blobs.length} keyframes.`);
        } catch (error) {
            addLog(`Error: ${error}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const runMetadataExtraction = async () => {
        if (!file) return;
        setIsProcessing(true);
        addLog('Extracting Metadata...');

        try {
            const result = await ffmpegService.getMetadata(file, addLog);
            setMetadata(result);
            addLog('Metadata extraction complete.');
        } catch (error) {
            addLog(`Error: ${error}`);
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
                    "The Laws of Physics" — Client-side deterministic scene detection + representative frame extraction.
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
                        <label className="block text-sm font-medium text-gray-400 mb-2">Threshold (0.0–1.0)</label>
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
                        <p className="text-xs text-gray-500 mt-2">Lower = more sensitive. Higher = hard cuts only.</p>
                    </div>

                    {/* Primary action: extract one representative frame per scene */}
                    <button
                        onClick={runMiddleFrameExtraction}
                        disabled={!file || isProcessing}
                        className={`w-full py-4 rounded-lg font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 border-2 ${isProcessing || !file
                            ? 'bg-gray-800 border-gray-700 cursor-not-allowed text-gray-500'
                            : 'bg-gradient-to-r from-yellow-500 to-orange-500 border-yellow-400 hover:from-yellow-400 hover:to-orange-400 text-black'
                            }`}
                    >
                        <Layers size={20} />
                        Extract Scene Frames (Middle Frame per Shot)
                    </button>

                    <div className="flex gap-2">
                        <button
                            onClick={() => { setActiveTab('scenes'); runDetection(); }}
                            disabled={!file || isProcessing}
                            className={`flex-1 py-3 rounded-lg font-semibold text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${isProcessing || !file ? 'bg-gray-700 cursor-not-allowed text-gray-500' : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'}`}
                        >
                            <Film size={16} />
                            Detect Only
                        </button>
                        <button
                            onClick={() => { setActiveTab('keyframes'); runKeyframeExtraction(); }}
                            disabled={!file || isProcessing}
                            className={`flex-1 py-3 rounded-lg font-semibold text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${isProcessing || !file ? 'bg-gray-700 cursor-not-allowed text-gray-500' : 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white'}`}
                        >
                            <ImageIcon size={16} />
                            I-Frames
                        </button>
                        <button
                            onClick={() => { setActiveTab('metadata'); runMetadataExtraction(); }}
                            disabled={!file || isProcessing}
                            className={`flex-1 py-3 rounded-lg font-semibold text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${isProcessing || !file ? 'bg-gray-700 cursor-not-allowed text-gray-500' : 'bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white'}`}
                        >
                            <FileText size={16} />
                            Metadata
                        </button>
                    </div>

                    {videoPreviewUrl && (
                        <div className="aspect-video bg-black rounded-lg overflow-hidden border border-gray-800 shadow-2xl relative">
                            <video
                                ref={videoRef}
                                src={videoPreviewUrl}
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

                    {/* Tabs */}
                    <div className="flex gap-1 bg-gray-900 p-1 rounded-lg border border-gray-800">
                        {([
                            { id: 'middleframes', label: 'Scene Frames', icon: <Layers size={14} />, count: middleFrames.length, color: 'text-yellow-400' },
                            { id: 'scenes', label: 'Cut Points', icon: <Layout size={14} />, count: scenes.length, color: 'text-green-400' },
                            { id: 'keyframes', label: 'I-Frames', icon: <ImageIcon size={14} />, count: keyframes.length, color: 'text-purple-400' },
                            { id: 'metadata', label: 'Metadata', icon: <FileText size={14} />, count: null, color: 'text-cyan-400' },
                        ] as const).map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${activeTab === tab.id ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                <span className={activeTab === tab.id ? tab.color : ''}>{tab.icon}</span>
                                {tab.label}
                                {tab.count !== null && tab.count > 0 && (
                                    <span className="bg-gray-600 text-gray-300 rounded px-1 text-[10px]">{tab.count}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Results Panel */}
                    <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800 min-h-[400px]">
                        <div className="overflow-y-auto max-h-[600px] p-4">

                            {/* MIDDLE FRAMES TAB — one representative frame per shot */}
                            {activeTab === 'middleframes' && (
                                <div className="space-y-3">
                                    {middleFrames.length === 0 && !isProcessing && (
                                        <div className="p-8 text-center text-gray-500">
                                            <Layers size={32} className="mx-auto mb-3 text-gray-700" />
                                            <p>Click "Extract Scene Frames" to get one representative frame per shot.</p>
                                            <p className="text-xs mt-2 text-gray-600">These are the frames that will be sent to Gemini for shot description.</p>
                                        </div>
                                    )}
                                    {middleFrames.map(({ interval, url }) => (
                                        <div
                                            key={interval.index}
                                            className="flex gap-3 bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50 hover:border-yellow-600/40 transition-colors group cursor-pointer"
                                            onClick={() => seekTo(interval.midpoint)}
                                        >
                                            {/* Thumbnail */}
                                            <div className="w-32 h-20 flex-shrink-0 bg-black overflow-hidden">
                                                <img src={url} alt={`Scene ${interval.index}`} className="w-full h-full object-cover" />
                                            </div>
                                            {/* Metadata */}
                                            <div className="flex flex-col justify-center gap-1 py-2 pr-3 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-yellow-400 font-bold font-mono text-sm">#{interval.index}</span>
                                                    <span className="text-xs text-gray-400 font-mono bg-gray-900 px-2 py-0.5 rounded">
                                                        {interval.duration.toFixed(2)}s
                                                    </span>
                                                </div>
                                                <div className="text-xs font-mono text-gray-300 flex gap-2">
                                                    <span className="text-green-400">{secondsToTimecode(interval.start)}</span>
                                                    <span className="text-gray-600">→</span>
                                                    <span className="text-red-400">{secondsToTimecode(interval.end)}</span>
                                                </div>
                                                <div className="text-[10px] text-gray-500 font-mono">
                                                    mid: {secondsToTimecode(interval.midpoint)}
                                                </div>
                                            </div>
                                            <div className="ml-auto pr-3 flex items-center">
                                                <Play size={14} className="text-gray-600 group-hover:text-yellow-400 transition-colors" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* CUT POINTS TAB */}
                            {activeTab === 'scenes' && (
                                <div>
                                    {videoDuration > 0 && (
                                        <div className="mb-3 text-xs text-gray-500 font-mono bg-gray-800 p-2 rounded border border-gray-700">
                                            {scenes.length} cut points → {sceneIntervals.length} shots · total {videoDuration.toFixed(2)}s
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 divide-y divide-gray-800">
                                        {sceneIntervals.map((interval, i) => (
                                            <button
                                                key={i}
                                                onClick={() => seekTo(interval.start)}
                                                className="flex items-center justify-between p-3 hover:bg-gray-800 transition-colors group text-left w-full rounded"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <span className="text-gray-500 font-mono w-8 text-right text-xs">#{interval.index}</span>
                                                    <div className="flex flex-col">
                                                        <span className="text-white font-mono font-bold flex items-center gap-2 text-sm">
                                                            <Clock size={12} className="text-gray-500" />
                                                            {secondsToTimecode(interval.start)}
                                                            <span className="text-gray-600 text-xs">→</span>
                                                            <span className="text-gray-400 text-xs">{secondsToTimecode(interval.end)}</span>
                                                        </span>
                                                        <span className="text-xs text-gray-500 font-mono">
                                                            {interval.duration.toFixed(2)}s · mid: {interval.midpoint.toFixed(3)}s
                                                        </span>
                                                    </div>
                                                </div>
                                                <Play size={16} className="text-gray-600 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all" />
                                            </button>
                                        ))}
                                        {sceneIntervals.length === 0 && !isProcessing && (
                                            <div className="p-8 text-center text-gray-500">
                                                No scenes detected yet. Run detection first.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* I-FRAMES TAB */}
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

                            {/* METADATA TAB */}
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
                                                        <div key={i} className="text-xs text-gray-300 border-l-2 border-purple-500 pl-2">{s}</div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="bg-gray-900 border border-gray-700 rounded p-4">
                                                <div className="text-gray-500 text-xs uppercase mb-2">Raw FFmpeg Log</div>
                                                <pre className="text-[10px] text-gray-400 whitespace-pre-wrap overflow-x-auto">{metadata.rawLogs}</pre>
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
