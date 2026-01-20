import React, { useState } from 'react';

interface ShotListInputViewProps {
  onStartAnalysis: (language: string, frameRate: number) => void;
  onBack: () => void;
}

const ShotListInputView: React.FC<ShotListInputViewProps> = ({
  onStartAnalysis,
  onBack,
}) => {
  const [language, setLanguage] = useState('English');
  const [frameRate, setFrameRate] = useState(25);

  const handleStart = () => {
    onStartAnalysis(language, frameRate);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-900/50 rounded-lg p-8 border border-gray-700">
        <h3 className="text-2xl font-bold text-gray-200 mb-4">
          Shot List Generation
        </h3>
        
        <div className="space-y-6 mb-6">
          <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-4">
            <p className="text-gray-300 text-sm leading-relaxed">
              <strong className="text-cyan-400">Features:</strong>
            </p>
            <ul className="mt-2 space-y-1 text-sm text-gray-400 list-disc list-inside">
              <li>Automatic scene detection and shot breakdown</li>
              <li>AI-generated descriptions for each shot</li>
              <li>Precise timecode in/out points</li>
              <li>Shot thumbnails for visual reference</li>
              <li>Downloadable shot list in multiple formats</li>
            </ul>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="English">English</option>
                <option value="Spanish">Español</option>
                <option value="French">Français</option>
                <option value="German">Deutsch</option>
                <option value="Italian">Italiano</option>
                <option value="Portuguese">Português</option>
                <option value="Japanese">日本語</option>
                <option value="Chinese">中文</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Frame Rate (FPS)
              </label>
              <select
                value={frameRate}
                onChange={(e) => setFrameRate(Number(e.target.value))}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="24">24 fps (Film)</option>
                <option value="25">25 fps (PAL)</option>
                <option value="30">30 fps (NTSC)</option>
                <option value="50">50 fps</option>
                <option value="60">60 fps</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all duration-200"
          >
            Back
          </button>
          <button
            onClick={handleStart}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-cyan-500/50"
          >
            Generate Shot List
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShotListInputView;