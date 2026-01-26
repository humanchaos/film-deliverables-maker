import React from 'react';
import { useTranslation } from 'react-i18next';

interface GraphicsInputViewProps {
  onGenerate: () => void;
  onBack: () => void;
}

const GraphicsInputView: React.FC<GraphicsInputViewProps> = ({
  onGenerate,
  onBack,
}) => {
  const { t } = useTranslation();
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
        <h2 className="text-2xl font-bold text-gray-200">{t('input.graphics.title', 'Graphics & Lower Thirds Detection')}</h2>
        <div className="w-20"></div>
      </div>

      {/* Information */}
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <svg className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">What This Analysis Does</h3>
            <p className="text-gray-300 mb-4 leading-relaxed">
              This analysis will scan your video frame-by-frame to detect and catalog:
            </p>
            <ul className="space-y-2 text-gray-300">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>On-screen graphics</strong> like title cards, maps, and animations</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>Lower thirds</strong> (text overlays identifying people or places)</span>
              </li>
            </ul>
            <p className="text-gray-300 mt-4 leading-relaxed">
              Each detected element will include a description and precise in/out timecodes, ready for post-production work.
            </p>
          </div>
        </div>
      </div>

      {/* Example Output */}
      <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">
          Example Output
        </h3>
        <div className="space-y-3 text-sm">
          <div className="bg-gray-800/50 rounded p-3 border-l-4 border-emerald-500">
            <p className="text-white font-medium">Lower Third: "Dr. Jane Smith, Marine Biologist"</p>
            <p className="text-gray-400 mt-1">In: 00:01:23:12 • Out: 00:01:28:18</p>
          </div>
          <div className="bg-gray-800/50 rounded p-3 border-l-4 border-teal-500">
            <p className="text-white font-medium">Graphic: Opening title card with production logo</p>
            <p className="text-gray-400 mt-1">In: 00:00:00:00 • Out: 00:00:05:00</p>
          </div>
        </div>
      </div>

      {/* Start Button */}
      <div className="text-center pt-4">
        <button
          onClick={onGenerate}
          className="px-10 py-3 font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 rounded-lg hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-emerald-500 transition-all duration-200 shadow-lg transform hover:scale-105"
        >
          {t('input.graphics.start', 'Start Analysis')}
        </button>
        <p className="text-sm text-gray-400 mt-3">
          Analysis time depends on video length (typically 2-5 minutes)
        </p>
      </div>
    </div>
  );
};

export default GraphicsInputView;