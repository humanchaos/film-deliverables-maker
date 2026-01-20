import React, { useState } from 'react';
import { FullAnalysisResult, VideoMetadata, ProjectMetadata, DEFAULT_FAUNA_CONFIG } from '../types';
import ShotListResultView from './ShotListResultView';
import TranscriptionResultView from './TranscriptionResultView';
import SynopsisResultView from './SynopsisResultView';
import BioResultView from './BioResultView';
import FaunaResultView from './FaunaResultView';
import GraphicsResultView from './GraphicsResultView';

import { Clapperboard, MessageSquare, Image, FileText, BookOpen, Users, Bug } from 'lucide-react';
import ExportModal from './ExportModal';

interface FullAnalysisResultViewProps {
    result: FullAnalysisResult;
    videoPreviewUrl: string | null;
    videoFileName: string;
    videoMetadata: VideoMetadata | null;
    projectMetadata: ProjectMetadata;
    onReset: () => void;
    onBack: () => void;
    onSave: (data: FullAnalysisResult) => Promise<void>;
    onUpdateSpeaker: (speakerId: string, newName: string) => void;
}

const FullAnalysisResultView: React.FC<FullAnalysisResultViewProps> = ({
    result,
    videoPreviewUrl,
    videoFileName,
    videoMetadata,
    projectMetadata,
    onReset,
    onBack,
    onSave,
    onUpdateSpeaker
}) => {
    if (!result) return null;

    const [activeTab, setActiveTab] = useState<'synopsis' | 'bio' | 'shots' | 'transcription' | 'graphics' | 'fauna'>('synopsis');
    const [showExportModal, setShowExportModal] = useState(false);

    const tabs = [
        { id: 'synopsis', label: 'Synopsis', icon: <BookOpen size={20} /> },
        { id: 'transcription', label: 'Transcription', icon: <MessageSquare size={20} /> },
        { id: 'shots', label: 'Shot List', icon: <Clapperboard size={20} /> },
        { id: 'bio', label: 'Bio', icon: <Users size={20} /> },
        { id: 'graphics', label: 'Graphics', icon: <Image size={20} /> },
        { id: 'fauna', label: 'Fauna', icon: <Bug size={20} /> },
    ];

    return (
        <div className="space-y-6">
            {/* Header with Back Button */}
            <div className="flex items-center justify-between bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Modules
                </button>
                <button
                    onClick={onReset}
                    className="px-4 py-2 border border-gray-600 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                >
                    New Upload
                </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-700 justify-between items-center bg-gray-900/50 rounded-t-lg overflow-x-auto">
                <div className="flex">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`
                  flex items-center gap-2 px-6 py-3 font-medium transition-colors whitespace-nowrap
                  ${activeTab === tab.id
                                    ? 'text-purple-400 border-b-2 border-purple-500 bg-gray-800/50'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'}
                `}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* As-Broadcast Export Button */}
                <div className="pr-4 hidden md:block">
                    <button
                        onClick={() => setShowExportModal(true)}
                        disabled={!result.transcription || !result.shotList}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <FileText size={16} />
                        Export Options...
                    </button>

                    <ExportModal
                        isOpen={showExportModal}
                        onClose={() => setShowExportModal(false)}
                        type="asbroadcast"
                        data={{
                            transcription: result.transcription,
                            shotList: { shots: result.shotList as any, videoUrl: '', frameRate: videoMetadata?.frameRate || 24, resolution: '1080p' },
                            graphics: result.graphics
                        }}
                        projectMetadata={projectMetadata}
                        videoFileName={videoFileName}
                        frameRate={videoMetadata?.frameRate || 24}
                    />
                </div>
            </div>

            {/* Tab Content */}
            <div className="min-h-[600px] bg-gray-900/20 p-4 rounded-b-lg">
                {activeTab === 'synopsis' && (
                    result.synopsis ? (
                        <div className="animate-fade-in">
                            <SynopsisResultView
                                synopsis={result.synopsis}
                                videoFileName={videoFileName}
                                videoMetadata={videoMetadata}
                                projectMetadata={projectMetadata}
                                onReset={onReset}
                                onBack={onBack}
                                onSave={async () => Promise.resolve()}
                            />
                        </div>
                    ) : <LoadingState label="Generating Synopsis..." />
                )}

                {activeTab === 'bio' && (
                    result.bio ? (
                        <div className="animate-fade-in">
                            <BioResultView
                                bios={result.bio}
                                videoFileName={videoFileName}
                                projectMetadata={projectMetadata}
                                onReset={onReset}
                                onBack={onBack}
                                onSave={async () => Promise.resolve()}
                            />
                        </div>
                    ) : <LoadingState label="Identifying Talent..." />
                )}

                {activeTab === 'shots' && (
                    result.shotList ? (
                        <div className="animate-fade-in">
                            <ShotListResultView
                                result={{ shots: result.shotList as any, videoUrl: videoPreviewUrl || '', frameRate: videoMetadata?.frameRate || 24 }}
                                videoPreviewUrl={videoPreviewUrl}
                                videoFileName={videoFileName}
                                videoMetadata={videoMetadata}
                                projectMetadata={projectMetadata}
                                onReset={onReset}
                                onBack={onBack}
                                onSave={async () => Promise.resolve()}
                            />
                        </div>
                    ) : <LoadingState label="Analyzing Shots..." />
                )}

                {activeTab === 'transcription' && (
                    result.transcription ? (
                        <div className="animate-fade-in">
                            <TranscriptionResultView
                                result={result.transcription}
                                videoPreviewUrl={videoPreviewUrl}
                                videoFileName={videoFileName}
                                videoMetadata={videoMetadata}
                                projectMetadata={projectMetadata}
                                graphicsResult={result.graphics}
                                onReset={onReset}
                                onBack={onBack}
                                onSave={async () => Promise.resolve()}
                                onUpdateSpeaker={onUpdateSpeaker}
                                onUpdateSegment={() => console.log('Segment update not supported in full view yet')}
                            />
                        </div>
                    ) : <LoadingState label="Transcribing Audio..." />
                )}

                {activeTab === 'graphics' && (
                    result.graphics ? (
                        <div className="animate-fade-in">
                            <GraphicsResultView
                                result={result.graphics}
                                videoPreviewUrl={videoPreviewUrl}
                                videoFileName={videoFileName}
                                videoMetadata={videoMetadata}
                                projectMetadata={projectMetadata}
                                onReset={onReset}
                                onBack={onBack}
                                onSave={async () => Promise.resolve()}
                            />
                        </div>
                    ) : <LoadingState label="Detecting Graphics..." />
                )}

                {activeTab === 'fauna' && (
                    result.fauna ? (
                        <div className="animate-fade-in">
                            <FaunaResultView
                                sightings={result.fauna}
                                videoFileName={videoFileName}
                                videoPreviewUrl={videoPreviewUrl}
                                videoMetadata={videoMetadata}
                                projectMetadata={projectMetadata}
                                onReset={onReset}
                                onBack={onBack}
                                onSave={async () => Promise.resolve()}
                                config={DEFAULT_FAUNA_CONFIG}
                            />
                        </div>
                    ) : <LoadingState label="Scanning for Fauna..." />
                )}
            </div>
        </div>
    );
};

const LoadingState: React.FC<{ label: string }> = ({ label }) => (
    <div className="flex flex-col items-center justify-center p-12 text-gray-400 h-96">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-lg font-medium">{label}</p>
        <p className="text-sm opacity-50 mt-2">This module is processing in the background.</p>
    </div>
);

export default FullAnalysisResultView;
