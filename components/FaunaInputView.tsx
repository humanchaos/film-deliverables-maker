import React from 'react';
import { FaunaConfig } from '../types';

interface FaunaInputViewProps {
  onGenerate: () => void;
  onBack: () => void;
  config: FaunaConfig;
  onConfigChange: (newConfig: FaunaConfig) => void;
}

const FaunaInputView: React.FC<FaunaInputViewProps> = ({
  onGenerate,
  onBack,
  config,
  onConfigChange,
}) => {
  
  const languages = [
    'English', 'Spanish', 'French', 'German', 'Japanese',
    'Italian', 'Portuguese', 'Chinese', 'Dutch', 'Russian',
    'Arabic', 'Hindi',
  ];

  const handleSubmit = () => {
    onGenerate();
  };

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
        <h2 className="text-2xl font-bold text-gray-200">Fauna Identification</h2>
        <div className="w-20"></div>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <svg className="w-6 h-6 text-amber-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">What This Analysis Does</h3>
            <p className="text-gray-300 mb-4 leading-relaxed">
              This analysis will identify all animal species visible in your video and provide:
            </p>
            <ul className="space-y-2 text-gray-300">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span><strong>Common names</strong> in two languages of your choice</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span><strong>Scientific (Latin) names</strong> with taxonomic classification</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                <span><strong>First appearance timecodes</strong> for each species</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="primary-language" className="block text-sm font-medium text-gray-300 mb-2">
            Primary Language <span className="text-amber-400">*</span>
          </label>
          <select
            id="primary-language"
            value={config.primaryLanguage}
            onChange={(e) => onConfigChange({ ...config, primaryLanguage: e.target.value })}
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors"
          >
            {languages.map((lang) => (<option key={lang} value={lang}>{lang}</option>))}
          </select>
          <p className="text-xs text-gray-400 mt-1">Main language for common names</p>
        </div>

        <div>
          <label htmlFor="secondary-language" className="block text-sm font-medium text-gray-300 mb-2">
            Secondary Language <span className="text-amber-400">*</span>
          </label>
          <select
            id="secondary-language"
            value={config.secondaryLanguage}
            onChange={(e) => onConfigChange({ ...config, secondaryLanguage: e.target.value })}
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors"
          >
            {languages.map((lang) => (<option key={lang} value={lang}>{lang}</option>))}
          </select>
          <p className="text-xs text-gray-400 mt-1">Alternative language for common names</p>
        </div>
      </div>

      <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Example Output</h3>
        <div className="space-y-3 text-sm">
          <div className="bg-gray-800/50 rounded p-3 border-l-4 border-amber-500">
            <p className="text-white font-medium">African Elephant / Elefante Africano</p>
            <p className="text-gray-400 italic">Loxodonta africana</p>
            <p className="text-gray-500 text-xs mt-1">First appears: 00:02:15.340</p>
          </div>
        </div>
      </div>

      {config.primaryLanguage === config.secondaryLanguage && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <p className="text-yellow-300 text-sm">
              You've selected the same language for both primary and secondary. Consider choosing different languages for more versatile results.
            </p>
          </div>
        </div>
      )}

      <div className="text-center pt-4">
        <button
          onClick={handleSubmit}
          className="px-10 py-3 font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 rounded-lg hover:from-amber-700 hover:to-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-amber-500 transition-all duration-200 shadow-lg transform hover:scale-105"
        >
          Identify Species
        </button>
      </div>
    </div>
  );
};

export default FaunaInputView;