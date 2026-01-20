
import React, { useEffect, useState } from 'react';
import { dbService } from '../services/db';
import { SavedAnalysis } from '../types';
import { ArrowLeft, Trash2, Eye, FileText, Film, Users, Image, Bird, Mic } from 'lucide-react';

interface HistoryViewProps {
  onBack: () => void;
  onLoadAnalysis: (analysis: SavedAnalysis) => void;
}

const HistoryView: React.FC<HistoryViewProps> = ({ onBack, onLoadAnalysis }) => {
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await dbService.getAllAnalyses();
      setHistory(data);
    } catch (error) {
      console.error("Failed to load history", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this analysis?')) {
      await dbService.deleteAnalysis(id);
      loadHistory();
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'synopsis': return <FileText className="text-purple-400" />;
      case 'bio': return <Users className="text-indigo-400" />;
      case 'graphics': return <Image className="text-emerald-400" />;
      case 'fauna': return <Bird className="text-amber-400" />;
      case 'transcribe': return <Mic className="text-pink-400" />;
      case 'shotlist': return <Film className="text-cyan-400" />;
      default: return <FileText className="text-gray-400" />;
    }
  };

  const getLabelForType = (type: string) => {
      switch (type) {
          case 'synopsis': return 'Synopsis';
          case 'bio': return 'Talent Bios';
          case 'graphics': return 'Graphics Log';
          case 'fauna': return 'Fauna ID';
          case 'transcribe': return 'Transcription';
          case 'shotlist': return 'Shot List';
          default: return type;
      }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6 border-b border-gray-700 pb-4">
        <div className="flex items-center gap-3">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors px-3 py-2 hover:bg-gray-800 rounded-lg"
            >
                <ArrowLeft size={20} />
            </button>
            <h2 className="text-2xl font-bold text-gray-200">Analysis Library</h2>
        </div>
        <div className="text-sm text-gray-400">
          {history.length} items saved
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading your library...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-20 bg-gray-900/50 rounded-xl border border-gray-700 border-dashed">
          <p className="text-gray-400 text-lg mb-2">No saved analyses found.</p>
          <p className="text-gray-500 text-sm">Analyses you save will appear here for offline access.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {history.map((item) => (
            <div
              key={item.id}
              onClick={() => onLoadAnalysis(item)}
              className="group bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 p-4 rounded-xl transition-all cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-4 overflow-hidden">
                <div className="p-3 bg-gray-900 rounded-lg group-hover:scale-105 transition-transform">
                    {getIconForType(item.type)}
                </div>
                <div className="min-w-0">
                  <h4 className="text-white font-medium truncate pr-4">{item.fileName}</h4>
                  <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                    <span className={`px-2 py-0.5 rounded-full bg-gray-700/50 text-xs border border-gray-600/50`}>
                        {getLabelForType(item.type)}
                    </span>
                    <span>•</span>
                    <span>{item.date}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => { e.stopPropagation(); onLoadAnalysis(item); }}
                    className="p-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg transition-colors"
                    title="View Analysis"
                >
                    <Eye size={18} />
                </button>
                <button
                    onClick={(e) => handleDelete(item.id!, e)}
                    className="p-2 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white rounded-lg transition-colors"
                    title="Delete"
                >
                    <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistoryView;
