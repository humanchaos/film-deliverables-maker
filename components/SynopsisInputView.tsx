import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SynopsisConfig } from '../types';

interface SynopsisInputViewProps {
  onGenerate: (writer: string, director: string, keywords: string, language: string) => void;
  synopsisConfig: SynopsisConfig;
  onConfigChange: (config: SynopsisConfig) => void;
  onBack: () => void;
}

const SynopsisInputView: React.FC<SynopsisInputViewProps> = ({
  onGenerate,
  synopsisConfig,
  onConfigChange,
  onBack,
}) => {
  const { t } = useTranslation();
  const [writer, setWriter] = useState('');
  const [director, setDirector] = useState('');
  const [keywords, setKeywords] = useState('');
  const [language, setLanguage] = useState('English');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const writerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    writerInputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (writer.trim() && director.trim()) {
      onGenerate(writer, director, keywords, language);
    }
  };

  const isSubmitDisabled = !writer.trim() || !director.trim();

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
          {t('common.back', 'Back')}
        </button>
        <h2 className="text-2xl font-bold text-gray-200">{t('input.synopsis.title', 'Synopsis Configuration')}</h2>
        <div className="w-20"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-300">Basic Information</h3>

          <div>
            <label htmlFor="writer" className="block text-sm font-medium text-gray-300 mb-1">
              Written by <span className="text-red-400">*</span>
            </label>
            <input
              ref={writerInputRef}
              type="text"
              id="writer"
              value={writer}
              onChange={(e) => setWriter(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              placeholder="e.g., Ruth Berry"
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="director" className="block text-sm font-medium text-gray-300 mb-1">
              Directed by <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="director"
              value={director}
              onChange={(e) => setDirector(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              placeholder="e.g., Wayne de Lange"
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="keywords" className="block text-sm font-medium text-gray-300 mb-1">
              Keywords (optional)
            </label>
            <input
              type="text"
              id="keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              placeholder="Drive the synopsis in a specific direction"
              maxLength={200}
            />
          </div>

          <div>
            <label htmlFor="language" className="block text-sm font-medium text-gray-300 mb-1">
              Synopsis Language
            </label>
            <select
              id="language"
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
        </div>

        {/* Advanced Settings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-300">Synopsis Length</h3>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              {showAdvanced ? '▼ Hide' : '▶ Show'} Advanced
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">
              <p className="text-xs text-gray-400 mb-3">Customize the length of each synopsis element:</p>

              <ConfigControl
                label="Title Length"
                value={synopsisConfig.titleMaxChars}
                min={30}
                max={150}
                step={10}
                unit="characters"
                onChange={(val) => onConfigChange({ ...synopsisConfig, titleMaxChars: val })}
              />

              <ConfigControl
                label="Logline"
                value={synopsisConfig.loglineMaxWords}
                min={15}
                max={50}
                step={5}
                unit="words"
                onChange={(val) => onConfigChange({ ...synopsisConfig, loglineMaxWords: val })}
              />

              <ConfigControl
                label="Summary"
                value={synopsisConfig.summaryMaxWords}
                min={50}
                max={500}
                step={25}
                unit="words"
                onChange={(val) => onConfigChange({ ...synopsisConfig, summaryMaxWords: val })}
              />

              <ConfigControl
                label="Key Themes"
                value={synopsisConfig.keyThemesMaxWords}
                min={20}
                max={150}
                step={10}
                unit="words"
                onChange={(val) => onConfigChange({ ...synopsisConfig, keyThemesMaxWords: val })}
              />

              <ConfigControl
                label="Target Audience"
                value={synopsisConfig.targetAudienceMaxWords}
                min={15}
                max={100}
                step={5}
                unit="words"
                onChange={(val) => onConfigChange({ ...synopsisConfig, targetAudienceMaxWords: val })}
              />
            </div>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <div className="text-center pt-4">
        <button
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className="px-10 py-3 font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-purple-500 transition-all duration-200 shadow-lg disabled:from-gray-600 disabled:to-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100"
        >
          {t('input.synopsis.generate', 'Generate Synopsis')}
        </button>
        {isSubmitDisabled && (
          <p className="text-sm text-gray-400 mt-3">
            Please fill in the 'Written by' and 'Directed by' fields to continue.
          </p>
        )}
      </div>
    </div>
  );
};

interface ConfigControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: 'words' | 'characters';
  onChange: (value: number) => void;
}

const ConfigControl: React.FC<ConfigControlProps> = ({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-medium text-gray-300">{label}</label>
        <span className="text-sm text-gray-400">{value} {unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
      />
    </div>
  );
};

export default SynopsisInputView;
