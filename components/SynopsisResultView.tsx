import React, { useState } from 'react';
import { Synopsis, VideoMetadata, ProjectMetadata } from '../types';
import { generateCSV, downloadFile, copyToClipboard } from '../utils/tableUtils';
import { ArrowLeft, Download, Save, RefreshCw, Database, Check } from 'lucide-react';
import { exportToWord } from '../services/documentExportService';
import { exportToJSON } from '../services/exportService';

interface SynopsisResultViewProps {
  synopsis: Synopsis;
  onReset: () => void;
  onBack: () => void;
  onSave: (data: Synopsis) => Promise<void>;
  videoFileName: string;
  videoMetadata: VideoMetadata | null;
  projectMetadata: ProjectMetadata;
}

const SynopsisResultView: React.FC<SynopsisResultViewProps> = ({ synopsis, onReset, onBack, onSave, videoFileName, videoMetadata, projectMetadata }) => {
  const [copied, setCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleDownloadCSV = () => {
    const headers = ['Section', 'Content'];
    const rows = [
      ['Title', synopsis.title],
      ['Written By', synopsis.writtenBy],
      ['Directed By', synopsis.directedBy],
      ['Logline', synopsis.oneLine],
      ['Summary', synopsis.paragraph],
      ['Full Synopsis', synopsis.fullSynopsis],
      ['Key Themes', synopsis.keyThemes],
      ['Target Audience', synopsis.targetAudience],
    ];
    const csvContent = generateCSV(headers, rows);
    downloadFile(csvContent, `${synopsis.title.replace(/ /g, '_')} _synopsis.csv`, 'text/csv');
  };

  const handleCopy = async () => {
    const text = `
${synopsis.title.toUpperCase()}
Written by ${synopsis.writtenBy}
Directed by ${synopsis.directedBy}

LOGLINE
${synopsis.oneLine}

SUMMARY
${synopsis.paragraph}

FULL SYNOPSIS
${synopsis.fullSynopsis}

KEY THEMES
${synopsis.keyThemes}

TARGET AUDIENCE
${synopsis.targetAudience}
`.trim();

    if (await copyToClipboard(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveToDatabase = async () => {
    setIsSaving(true);
    await onSave(synopsis);
    setIsSaved(true);
    setIsSaving(false);
  };

  const handleExportJSON = () => {
    exportToJSON(synopsis, 'synopsis', videoFileName);
  };

  const handleExportWord = () => {
    exportToWord({
      type: 'synopsis',
      data: synopsis,
      projectMetadata: projectMetadata,
      fileName: videoFileName
    });
  };


  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center pb-4 border-b border-gray-700">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-gray-200">Synopsis Generated!</h3>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 text-center">
            {synopsis.title}
          </h2>
          <p className="text-center text-gray-400">
            Written by <span className="text-indigo-400">{synopsis.writtenBy}</span> •
            Directed by <span className="text-indigo-400">{synopsis.directedBy}</span>
          </p>
        </div>
        <div className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 rounded-lg p-4 border border-purple-500/30">
          <h4 className="text-sm font-bold text-purple-400 uppercase tracking-wide mb-2">
            Logline
          </h4>
          <p className="text-gray-200 italic">
            {synopsis.oneLine}
          </p>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-bold text-indigo-400 uppercase tracking-wide mb-2">
            Summary
          </h4>
          <p className="text-gray-300 leading-relaxed">
            {synopsis.paragraph}
          </p>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-bold text-indigo-400 uppercase tracking-wide mb-2">
            Full Synopsis
          </h4>
          <div className="text-gray-300 leading-relaxed whitespace-pre-line">
            {synopsis.fullSynopsis}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
            <h4 className="text-sm font-bold text-indigo-400 uppercase tracking-wide mb-2">
              Key Themes
            </h4>
            <p className="text-gray-300 leading-relaxed">
              {synopsis.keyThemes}
            </p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
            <h4 className="text-sm font-bold text-indigo-400 uppercase tracking-wide mb-2">
              Target Audience
            </h4>
            <p className="text-gray-300 leading-relaxed">
              {synopsis.targetAudience}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
        <button
          onClick={handleCopy}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg transform hover:scale-105 flex items-center justify-center gap-2"
        >
          {copied ? (
            <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Copied!</>
          ) : (
            <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy All</>
          )}
        </button>
        <button
          onClick={handleDownloadCSV}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg transform hover:scale-105 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2-2z" /></svg>
          Download CSV
        </button>

        <button
          onClick={handleExportWord}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg transform hover:scale-105 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Export Word
        </button>
        <button
          onClick={handleExportJSON}
          className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg transform hover:scale-105 flex items-center justify-center gap-2"
        >
          <Database size={20} />
          Export JSON
        </button>
        <button
          onClick={handleSaveToDatabase}
          disabled={isSaved || isSaving}
          className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg transform hover:scale-105 flex items-center justify-center gap-2 disabled:bg-gray-500 disabled:cursor-not-allowed"
        >
          {isSaved ? (
            <><Check size={18} />Saved</>
          ) : (
            <><Database size={18} />{isSaving ? 'Saving...' : 'Save to Database'}</>
          )}
        </button>
        <button onClick={onBack} className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg">
          Back to Dashboard
        </button>
        <button onClick={onReset} className="px-6 py-3 bg-red-800 hover:bg-red-700 text-white font-semibold rounded-lg">
          New Video
        </button>
      </div>
    </div>
  );
};

export default SynopsisResultView;
