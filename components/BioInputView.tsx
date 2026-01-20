import React, { useState } from 'react';

interface BioInputViewProps {
  onGenerate: (
    talents: { name: string; context: string }[],
    language: string,
    autoDetect: boolean
  ) => void;
  onBack: () => void;
}

const BioInputView: React.FC<BioInputViewProps> = ({ onGenerate, onBack }) => {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [language, setLanguage] = useState('English');
  const [videoTopic, setVideoTopic] = useState('');
  const [talents, setTalents] = useState<{ name: string; context: string }[]>([
    { name: '', context: '' },
  ]);

  const handleAddTalent = () => {
    setTalents([...talents, { name: '', context: '' }]);
  };

  const handleRemoveTalent = (index: number) => {
    setTalents(talents.filter((_, i) => i !== index));
  };

  const handleTalentChange = (index: number, field: 'name' | 'context', value: string) => {
    const updated = [...talents];
    updated[index][field] = value;
    setTalents(updated);
  };

  const handleSubmit = () => {
    if (mode === 'auto') {
      onGenerate([], language, true);
    } else {
      const validTalents = talents.filter(t => t.name.trim() !== '');
      if (validTalents.length > 0) {
        onGenerate(validTalents, language, false);
      }
    }
  };

  const isSubmitDisabled = mode === 'manual' && talents.every(t => t.name.trim() === '');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h2 className="text-2xl font-bold text-gray-200">Bio Generation</h2>
        <div className="w-20"></div>
      </div>

      {/* Mode Selection */}
      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
        <label className="block text-sm font-medium text-gray-300 mb-3">Detection Mode</label>
        <div className="flex gap-3">
          <button
            onClick={() => setMode('auto')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
              mode === 'auto'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Auto-Detect Talent
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
              mode === 'manual'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Enter Manually
          </button>
        </div>
      </div>

      {/* Language Selection */}
      <div>
        <label htmlFor="bio-language" className="block text-sm font-medium text-gray-300 mb-1">
          Biography Language
        </label>
        <select
          id="bio-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
        >
          <option>English</option>
          <option>Spanish</option>
          <option>French</option>
          <option>German</option>
          <option>Japanese</option>
          <option>Italian</option>
          <option>Portuguese</option>
          <option>Chinese</option>
        </select>
      </div>

      {/* Auto Mode Options */}
      {mode === 'auto' && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-gray-300 mb-3">
                The system will automatically scan the video for on-screen talent introductions (lower thirds) and generate biographies for each person found.
              </p>
              <div>
                <label htmlFor="video-topic" className="block text-sm font-medium text-gray-300 mb-1">
                  Video Topic (optional)
                </label>
                <input
                  type="text"
                  id="video-topic"
                  value={videoTopic}
                  onChange={(e) => setVideoTopic(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  placeholder="e.g., Marine biology experts, Tech entrepreneurs"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Helps provide context for better biographies
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Mode Options */}
      {mode === 'manual' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Talent List</label>
            <button
              onClick={handleAddTalent}
              className="text-sm text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Person
            </button>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {talents.map((talent, index) => (
              <div key={index} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={talent.name}
                        onChange={(e) => handleTalentChange(index, 'name', e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                        placeholder="e.g., Dr. Jane Smith"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Context (optional)
                      </label>
                      <input
                        type="text"
                        value={talent.context}
                        onChange={(e) => handleTalentChange(index, 'context', e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                        placeholder="e.g., Marine biologist, Professor at MIT"
                      />
                    </div>
                  </div>
                  {talents.length > 1 && (
                    <button
                      onClick={() => handleRemoveTalent(index)}
                      className="flex-shrink-0 text-red-400 hover:text-red-300 p-1"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="text-center pt-4">
        <button
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className="px-10 py-3 font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 rounded-lg hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 transition-all duration-200 shadow-lg disabled:from-gray-600 disabled:to-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
        >
          Generate Biographies
        </button>
        {isSubmitDisabled && (
          <p className="text-sm text-gray-400 mt-3">
            Please enter at least one talent name to continue.
          </p>
        )}
      </div>
    </div>
  );
};

export default BioInputView;
