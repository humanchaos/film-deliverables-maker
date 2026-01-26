import React from 'react';
import { useTranslation } from 'react-i18next';

interface ProcessingViewProps {
  message: string;
  percentage: number;
  onCancel: () => void;
  onBack: () => void;
}

const ProcessingView: React.FC<ProcessingViewProps> = ({
  message,
  percentage,
  onCancel,
  onBack,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="relative mb-8">
        <div className="w-24 h-24 border-8 border-gray-700 rounded-full"></div>
        <div className="absolute top-0 left-0 w-24 h-24 border-8 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
      </div>

      <h3 className="text-xl font-semibold text-gray-200 mb-2 text-center">
        {message}
      </h3>

      <div className="w-full max-w-md mb-6">
        <div className="bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full transition-all duration-300 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
          />
        </div>
        <p className="text-center text-sm text-gray-400 mt-2">
          {Math.round(percentage)}%
        </p>
      </div>

      <p className="text-sm text-gray-400 mb-6 text-center max-w-md">
        {t('processing.hint', 'This may take a few moments. You can let this run in the background.')}
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={onBack}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all"
        >
          {t('processing.runInBackground', 'Run in Background')}
        </button>
        <button
          onClick={onCancel}
          className="px-6 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 hover:border-red-500 text-red-400 hover:text-red-300 rounded-lg transition-all font-medium"
        >
          {t('processing.cancel', 'Cancel (ESC)')}
        </button>
      </div>
    </div>
  );
};

export default ProcessingView;