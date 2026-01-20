import React, { useCallback, useState } from 'react';
import { Bio, ProjectMetadata } from '../types';
import { downloadFile } from '../utils/tableUtils';
import { exportToWord } from '../services/documentExportService';
import { exportToJSON } from '../services/exportService';
import { ArrowLeft, Download, Save, RefreshCw, Check, Database } from 'lucide-react';

interface BioResultViewProps {
  bios: Bio[];
  videoFileName: string;
  projectMetadata: ProjectMetadata; // New prop
  onReset: () => void;
  onBack: () => void;
  onSave: (data: Bio[]) => Promise<void>;
}

const BioResultView: React.FC<BioResultViewProps> = ({ bios, videoFileName, projectMetadata, onReset, onBack, onSave }) => {
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleDownload = useCallback(() => {
    const fileContent = bios.map(bio => {
      if (bio.isLoading) {
        return `${bio.name.toUpperCase()} \n\nBiography generation in progress...\n\n${'-'.repeat(50)} \n\n`;
      }
      if (bio.error) {
        return `${bio.name.toUpperCase()} \n\nFailed to generate biography: ${bio.error} \n\n${'-'.repeat(50)} \n\n`;
      }

      const bioText = bio.biography.split('\n').filter(p => p.trim() !== '').join('\n\n');
      return `${bio.fullName.toUpperCase()} \n${bio.title} \n\n${bioText} \n\n${'-'.repeat(50)} \n\n`;
    }).join('');

    const baseFilename = videoFileName.replace(/\.[^/.]+$/, "") || 'talent';
    downloadFile(fileContent, `${baseFilename} _bios.txt`, 'text/plain');
  }, [bios, videoFileName]);

  const handleExportJSON = () => {
    exportToJSON(bios, 'bio', videoFileName);
  };

  const handleExportWord = () => {
    exportToWord({
      type: 'bio',
      data: bios,
      projectMetadata: projectMetadata,
      fileName: videoFileName
    });
  };

  const handleSaveToDatabase = async () => {
    setIsSaving(true);
    await onSave(bios);
    setIsSaved(true);
    setIsSaving(false);
  };

  const successCount = bios.filter(b => !b.isLoading && !b.error).length;
  const failureCount = bios.filter(b => b.error).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center pb-4 border-b border-gray-700">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-gray-200">Biographies Generated!</h3>
        <p className="text-gray-400 mt-2">
          {successCount} successful • {failureCount > 0 ? `${failureCount} failed` : 'All completed'}
        </p>
      </div>

      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
        {bios.map((bio, index) => (
          <div
            key={index}
            className="bg-gray-900/50 rounded-lg p-5 border border-gray-700 hover:border-gray-600 transition-colors"
          >
            {bio.isLoading ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-400">Generating biography for {bio.name}...</p>
              </div>
            ) : bio.error ? (
              <div>
                <div className="flex items-start gap-3 mb-2">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-red-400">{bio.name}</h4>
                    <p className="text-sm text-gray-400 mt-1">{bio.error}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-3 pb-3 border-b border-gray-700">
                  <h4 className="text-xl font-bold text-white">{bio.fullName}</h4>
                  <p className="text-sm text-indigo-400 font-medium mt-1">{bio.title}</p>
                </div>
                <div className="text-gray-300 leading-relaxed whitespace-pre-line mb-4">
                  {bio.biography}
                </div>

                {bio.sources && bio.sources.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-700/50">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Verified Sources</p>
                    <div className="flex flex-wrap gap-2">
                      {bio.sources.map((source, i) => (
                        <a
                          key={i}
                          href={source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded transition-colors truncate max-w-[200px]"
                          title={source}
                        >
                          {new URL(source).hostname.replace('www.', '')}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
        <button
          onClick={handleDownload}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg transform hover:scale-105 flex items-center justify-center gap-2"
        >
          <Download size={20} />
          Download TXT
        </button>
        <button
          onClick={handleExportWord}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg transform hover:scale-105 flex items-center justify-center gap-2"
        >
          <Download size={20} />
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

export default BioResultView;
