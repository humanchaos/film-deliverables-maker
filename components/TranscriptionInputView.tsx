import React from 'react';

interface TranscriptionInputViewProps {
  onStartTranscription: () => void;
  onBack: () => void;
}

const TranscriptionInputView: React.FC<TranscriptionInputViewProps> = ({
  onStartTranscription,
  onBack,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-gray-900/50 rounded-lg p-8 border border-gray-700">
        <h3 className="text-2xl font-bold text-gray-200 mb-4">
          Audio/Video Transcription
        </h3>
        
        <div className="space-y-4 mb-6">
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <p className="text-gray-300 text-sm leading-relaxed">
              <strong className="text-blue-400">Features:</strong>
            </p>
            <ul className="mt-2 space-y-1 text-sm text-gray-400 list-disc list-inside">
              <li>Complete time-coded transcription with speaker identification</li>
              <li>Downloadable CSV format for easy editing</li>
              <li>Copy all text to clipboard</li>
              <li>Click on segments to jump to specific timestamps</li>
              <li>Edit speaker names inline</li>
            </ul>
          </div>

          <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
            <p className="text-gray-300 text-sm leading-relaxed">
              <strong className="text-purple-400">Supported Formats:</strong>
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Audio: MP3, WAV, M4A, OGG, WebM
            </p>
            <p className="text-sm text-gray-400">
              Video: MP4, MOV, WebM, AVI, MKV
            </p>
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
            onClick={onStartTranscription}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-pink-500/50"
          >
            Start Transcription
          </button>
        </div>
      </div>
    </div>
  );
};

export default TranscriptionInputView;