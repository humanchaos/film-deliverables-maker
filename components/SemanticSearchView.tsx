import React, { useState } from 'react';
import { indexingService } from '../services/indexingService';
import { embeddingService, SearchResult } from '../services/embeddingService';
import { Search, Database, Play, Loader } from 'lucide-react';
import { secondsToTimecode } from '../utils/tableUtils';

interface SemanticSearchViewProps {
    videoFile: File | null;
    onSeek: (time: number) => void;
    isIndexing: boolean;
    indexProgress: number;
    progressMsg: string;
    isIndexed: boolean;
    onStartIndexing: () => void;
}

export const SemanticSearchView: React.FC<SemanticSearchViewProps> = ({
    videoFile,
    onSeek,
    isIndexing,
    indexProgress,
    progressMsg,
    isIndexed,
    onStartIndexing
}) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [playingFile, setPlayingFile] = useState<File | null>(null);
    const [seekTime, setSeekTime] = useState(0);

    const handleSeek = (time: number) => {
        // If parent `onSeek` is provided it might be used, but here we want local playback
        setPlayingFile(videoFile);
        setSeekTime(time);
        onSeek(time); // Call parent just in case
    };

    const closePlayer = () => {
        setPlayingFile(null);
    };

    // Removed local handleIndex - usage delegated to parent

    const handleSearch = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!query.trim()) return;

        setIsSearching(true);
        try {
            const hits = await embeddingService.search(query, 6);
            setResults(hits);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-black text-white p-6 overflow-y-auto w-full max-w-4xl mx-auto">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent flex justify-center items-center gap-2">
                    <Search className="text-pink-500" />
                    Semantic Video Search
                </h1>
                <p className="text-gray-400 mt-2">
                    "Chat with your Video" - Find moments using natural language.
                </p>
            </div>

            {!isIndexed ? (
                <div className="flex flex-col items-center justify-center p-12 bg-gray-900 rounded-lg border border-gray-800 border-dashed">
                    <Database size={48} className="text-gray-600 mb-4" />
                    <h3 className="text-xl font-bold mb-2">Index Required</h3>
                    <p className="text-gray-400 mb-6 text-center max-w-md">
                        To enable search, we need to analyze the video structure (`WASM`) and describe every scene (`Gemini Flash`).
                        <br /><span className="text-xs text-gray-500 mt-2 block">Note: This happens locally + via API. It may take 30-60s.</span>
                    </p>

                    {isIndexing ? (
                        <div className="w-full max-w-md">
                            <div className="flex justify-between text-xs text-pink-400 mb-1 font-mono">
                                <span>{progressMsg}</span>
                                <span>{Math.round(indexProgress)}%</span>
                            </div>
                            <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-pink-500 h-full transition-all duration-300"
                                    style={{ width: `${indexProgress}%` }}
                                />
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={onStartIndexing}
                            disabled={!videoFile}
                            className="bg-pink-600 hover:bg-pink-700 text-white px-8 py-3 rounded-full font-bold transition-all shadow-lg hover:shadow-pink-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {videoFile ? 'Start Indexing' : 'Upload Video First'}
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Search Bar */}
                    <form onSubmit={handleSearch} className="relative">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Describe a moment (e.g. 'Red car turning', 'Two people arguing')..."
                            className="w-full bg-gray-900 border border-gray-700 rounded-full px-6 py-4 text-lg focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 transition-all placeholder-gray-600"
                        />
                        <button
                            type="submit"
                            className="absolute right-2 top-2 bottom-2 bg-pink-600 hover:bg-pink-700 text-white px-6 rounded-full font-bold transition-colors"
                            disabled={isSearching}
                        >
                            {isSearching ? <Loader className="animate-spin" /> : 'Search'}
                        </button>
                    </form>

                    {/* Results */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {results.map((hit) => (
                            <div
                                key={hit.id}
                                className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800 hover:border-pink-500 transition-all group"
                            >
                                <div className="aspect-video bg-black relative">
                                    {hit.metadata.thumbnail && (
                                        <img
                                            src={hit.metadata.thumbnail}
                                            alt="Scene"
                                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                        />
                                    )}
                                    <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-mono text-pink-400 border border-pink-900">
                                        {Math.round(hit.similarity * 100)}% Match
                                    </div>

                                    <button
                                        onClick={() => handleSeek(hit.metadata.timestamp)}
                                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40"
                                    >
                                        <div className="bg-pink-600 rounded-full p-3 shadow-xl transform scale-75 group-hover:scale-100 transition-transform">
                                            <Play fill="white" className="ml-1" />
                                        </div>
                                    </button>
                                </div>

                                <div className="p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-gray-500 text-xs font-mono">
                                            ID: {hit.id}
                                        </span>
                                        <span className="text-gray-300 font-bold font-mono text-sm">
                                            {secondsToTimecode(hit.metadata.timestamp)}
                                        </span>
                                    </div>
                                    <p className="text-gray-400 text-sm line-clamp-3 group-hover:text-gray-200 transition-colors">
                                        {hit.text}
                                    </p>
                                </div>
                            </div>
                        ))}

                        {results.length === 0 && query && !isSearching && (
                            <div className="col-span-full text-center py-12 text-gray-500">
                                No matches found. Try a different description.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Simple Player Overlay */}
            {playingFile && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8 backdrop-blur-sm">
                    <div className="relative w-full max-w-5xl bg-black rounded-lg border border-gray-800 shadow-2xl overflow-hidden">
                        <button
                            onClick={closePlayer}
                            className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/80 text-white p-2 rounded-full transition-colors"
                        >
                            ✕
                        </button>
                        <video
                            src={URL.createObjectURL(playingFile)}
                            className="w-full h-auto max-h-[80vh]"
                            controls
                            autoPlay
                            ref={(v) => {
                                if (v && seekTime > 0) {
                                    // Avoid infinite seek loop
                                    if (Math.abs(v.currentTime - seekTime) > 0.5) {
                                        v.currentTime = seekTime;
                                    }
                                }
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
