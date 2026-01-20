import React, { useState, useMemo } from 'react';
import { GraphicsAnalysisResult, VideoMetadata, ProjectMetadata } from '../types';
import { Download, ArrowLeft, Copy, Check, Database } from 'lucide-react';
import { copyToClipboard } from '../utils/tableUtils';
import VideoThumbnail from './VideoThumbnail';
import ExportModal from './ExportModal';

interface GraphicsResultViewProps {
  result: GraphicsAnalysisResult;
  videoFileName: string;
  videoPreviewUrl: string | null;
  videoMetadata: VideoMetadata | null;
  projectMetadata: ProjectMetadata;
  onReset: () => void;
  onBack: () => void;
  onSave: (data: GraphicsAnalysisResult) => Promise<void>;
}

type CombinedGraphicItem = {
  type: 'graphic' | 'lowerThird';
  description: string;
  tcIn: string;
  tcOut: string;
  cleanTcIn?: string;
  cleanTcOut?: string;
};

const GraphicsResultView: React.FC<GraphicsResultViewProps> = ({
  result,
  videoFileName,
  videoPreviewUrl,
  videoMetadata,
  projectMetadata,
  onReset,
  onBack,
  onSave,
}) => {
  const [copied, setCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const combinedItems = useMemo((): CombinedGraphicItem[] => {
    const items: CombinedGraphicItem[] = [];
    result.graphics?.forEach(g => items.push({ type: 'graphic', description: g.description, tcIn: g.timecodeIn, tcOut: g.timecodeOut, cleanTcIn: g.cleanTimecodeIn, cleanTcOut: g.cleanTimecodeOut }));
    result.lowerThirds?.forEach(lt => items.push({ type: 'lowerThird', description: lt.text, tcIn: lt.timecodeIn, tcOut: lt.timecodeOut }));
    // @ts-ignore
    return items.sort((a, b) => a.tcIn.localeCompare(b.tcIn));
  }, [result]);

  const programTitle = videoFileName.replace(/\.[^/.]+$/, '');

  const generateTableText = (): string => {
    let output = `PROGRAM GRAPHICS & CLEAN SCENES LOG\nPROGRAM: ${programTitle.toUpperCase()}\nRUNTIME: ${result.runtime || 'N/A'}\n\n`;
    output += `┌──────────────────────────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┐\n`;
    output += `│ Description                              │ Program TC In│ Program TC Out│ Clean TC In  │ Clean TC Out │\n`;
    output += `├──────────────────────────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤\n`;
    combinedItems.forEach(item => {
      output += `│ ${item.description.substring(0, 40).padEnd(40)} │ ${item.tcIn.padEnd(12)} │ ${item.tcOut.padEnd(13)} │ ${(item.cleanTcIn || '').padEnd(12)} │ ${(item.cleanTcOut || '').padEnd(12)} │\n`;
    });
    output += `└──────────────────────────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┘\n`;
    return output;
  };

  const handleCopyTable = async () => {
    if (await copyToClipboard(generateTableText())) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveToDatabase = async () => {
    setIsSaving(true);
    await onSave(result);
    setIsSaved(true);
    setIsSaving(false);
  };





  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"><ArrowLeft size={20} />Back</button>
        <div className="flex gap-2">
          <button onClick={handleCopyTable} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg">{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? 'Copied!' : 'Copy Table'}</button>

          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold"
          >
            <Download size={18} />Export Options...
          </button>

          <ExportModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            type="graphics"
            data={result}
            projectMetadata={projectMetadata}
            videoFileName={videoFileName}
            frameRate={videoMetadata?.frameRate || 25}
          />

          <button onClick={handleSaveToDatabase} disabled={isSaved || isSaving} className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 rounded-lg disabled:bg-gray-500 disabled:cursor-not-allowed">{isSaved ? <Check size={18} /> : <Database size={18} />}{isSaved ? 'Saved' : isSaving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">Graphics & Lower Thirds Log</h2>
        <p className="text-gray-400 mt-2">Program: {programTitle}</p>
        {result.runtime && <p className="text-gray-500 text-sm">Runtime: {result.runtime}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-700/50 p-4 rounded-lg text-center"><div className="text-3xl font-bold text-purple-400">{result.graphics?.length || 0}</div><div className="text-gray-400 text-sm mt-1">Graphics</div></div>
        <div className="bg-gray-700/50 p-4 rounded-lg text-center"><div className="text-3xl font-bold text-indigo-400">{result.lowerThirds?.length || 0}</div><div className="text-gray-400 text-sm mt-1">Lower Thirds</div></div>
        <div className="bg-gray-700/50 p-4 rounded-lg text-center"><div className="text-3xl font-bold text-blue-400">{combinedItems.length}</div><div className="text-gray-400 text-sm mt-1">Total Items</div></div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-700/50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 border-b border-gray-600 border-r border-gray-700 last:border-r-0">Preview</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 border-b border-gray-600 border-r border-gray-700 last:border-r-0">Type</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 border-b border-gray-600 border-r border-gray-700 last:border-r-0">Description / Text</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300 border-b border-gray-600 border-r border-gray-700 last:border-r-0">Program TC In</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300 border-b border-gray-600">Program TC Out</th>
            </tr>
          </thead>
          <tbody>
            {combinedItems.map((item, index) => (
              <tr key={index} className={`${index % 2 === 0 ? 'bg-gray-800/40' : 'bg-gray-800/20'} hover:bg-gray-700/30 transition-colors`}>
                <td className="px-4 py-2 border-b border-gray-700/50 border-r border-gray-700 last:border-r-0 w-32">
                  <VideoThumbnail videoUrl={videoPreviewUrl} timecode={item.tcIn} className="w-24 h-16 rounded-md" />
                </td>
                <td className="px-4 py-3 text-sm border-b border-gray-700/50 border-r border-gray-700 last:border-r-0">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${item.type === 'graphic' ? 'bg-purple-500/20 text-purple-300' : 'bg-indigo-500/20 text-indigo-300'}`}>
                    {item.type === 'graphic' ? 'Graphic' : 'Lower Third'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-300 border-b border-gray-700/50 border-r border-gray-700 last:border-r-0">{item.description}</td>
                <td className="px-4 py-3 text-sm text-center font-mono text-gray-400 border-b border-gray-700/50 border-r border-gray-700 last:border-r-0">{item.tcIn}</td>
                <td className="px-4 py-3 text-sm text-center font-mono text-gray-400 border-b border-gray-700/50">{item.tcOut}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center gap-4 pt-6 border-t border-gray-700/50"><button onClick={onReset} className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors font-medium">Analyze Another Video</button></div>
    </div>
  );
};
export default GraphicsResultView;
