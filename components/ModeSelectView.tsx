
import React from 'react';
import { useTranslation } from 'react-i18next';
import { AnalysisMode } from '../types';
import { History, Settings } from 'lucide-react';

interface JobStatus {
  status: 'idle' | 'configuring' | 'processing' | 'results';
  progressPercentage?: number;
}

interface ModeSelectViewProps {
  videoFile: File;
  videoPreviewUrl: string | null;
  onModeSelect: (mode: AnalysisMode) => void;
  onBack: () => void;
  onViewHistory: () => void; // New prop for history
  onViewSettings?: () => void; // Optional project settings callback
  jobs: Record<AnalysisMode, JobStatus>;
  onDownloadAll?: () => void; // New optional prop for batch export
  isUploading?: boolean;
}

const ModeCard: React.FC<{
  mode: AnalysisMode;
  job: JobStatus;
  onSelect: (mode: AnalysisMode) => void;
  title: string;
  description: string;
  icon: React.ReactNode;
  className: string;
  disabled?: boolean;
  doneLabel: string;
}> = ({ mode, job, onSelect, title, description, icon, className, disabled, doneLabel }) => {
  let statusIndicator: React.ReactNode = null;

  switch (job.status) {
    case 'configuring':
      // No indicator for configuring state
      break;
    case 'processing':
      statusIndicator = (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-gray-900/80 text-xs text-indigo-300 px-2 py-1 rounded-full">
          <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
          {job.progressPercentage?.toFixed(0)}%
        </div>
      );
      break;
    case 'results':
      statusIndicator = (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-500/20 text-xs text-green-300 px-2 py-1 rounded-full">
          <span className="w-2 h-2 bg-green-400 rounded-full"></span>
          {doneLabel}
        </div>
      );
      break;
  }

  const titleForState =
    job.status === 'results' ? `${title}: View Results` :
      title;

  return (
    <button
      onClick={() => !disabled && onSelect(mode)}
      disabled={disabled}
      className={`group relative bg-gradient-to-br border rounded-xl p-6 text-left transition-all duration-200 transform ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:scale-105'} ${className}`}
    >
      {statusIndicator}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 bg-black/20 rounded-lg flex items-center justify-center group-hover:bg-black/30 transition-colors">
          {icon}
        </div>
        <div className="flex-1">
          <h4 className="text-lg font-bold text-white mb-2 group-hover:text-purple-300 transition-colors">
            {titleForState}
          </h4>
          <p className="text-sm text-gray-400 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
};


const ModeSelectView: React.FC<ModeSelectViewProps> = ({
  videoFile,
  videoPreviewUrl,
  onModeSelect,
  onBack,
  onViewHistory,
  onViewSettings,
  jobs,
  onDownloadAll, // New prop
  isUploading = false,
}) => {
  const { t } = useTranslation();

  const modes: { mode: AnalysisMode; titleKey: string; descriptionKey: string; icon: React.ReactNode; className: string; isDeprecated?: boolean }[] = [

    {
      mode: 'full_analysis',
      titleKey: 'modeSelect.fullAnalysis',
      descriptionKey: 'modeSelect.fullAnalysisDesc',
      icon: <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>,
      className: "col-span-1 md:col-span-2 bg-gradient-to-r from-pink-600 to-purple-800 border-2 border-white/20 hover:border-white/50 shadow-2xl"
    },
    {
      mode: 'synopsis',
      titleKey: 'modeSelect.synopsis',
      descriptionKey: '',
      icon: <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2-2z" /></svg>,
      className: "from-purple-600/20 to-indigo-600/20 hover:from-purple-600/30 hover:to-indigo-600/30 border-purple-500/30 hover:border-purple-400",
      isDeprecated: true
    },
    {
      mode: 'bio',
      titleKey: 'modeSelect.bio',
      descriptionKey: '',
      icon: <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
      className: "from-indigo-600/20 to-blue-600/20 hover:from-indigo-600/30 hover:to-blue-600/30 border-indigo-500/30 hover:border-indigo-400",
      isDeprecated: true
    },
    {
      mode: 'graphics',
      titleKey: 'modeSelect.graphics',
      descriptionKey: '',
      icon: <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>,
      className: "from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 border-emerald-500/30 hover:border-emerald-400",
      isDeprecated: true
    },
    {
      mode: 'fauna',
      titleKey: 'modeSelect.fauna',
      descriptionKey: '',
      icon: <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /></svg>,
      className: "from-amber-600/20 to-orange-600/20 hover:from-amber-600/30 hover:to-orange-600/30 border-amber-500/30 hover:border-amber-400",
      isDeprecated: true
    },
    {
      mode: 'transcribe',
      titleKey: 'modeSelect.transcribe',
      descriptionKey: '',
      icon: <svg className="w-6 h-6 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2-2z" /></svg>,
      className: "from-pink-600/20 to-rose-600/20 hover:from-pink-600/30 hover:to-rose-600/30 border-pink-500/30 hover:border-pink-400",
      isDeprecated: true
    },
    {
      mode: 'shotlist',
      titleKey: 'modeSelect.shotlist',
      descriptionKey: '',
      icon: <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
      className: "from-cyan-600/20 to-sky-600/20 hover:from-cyan-600/30 hover:to-sky-600/30 border-cyan-500/30 hover:border-cyan-400",
      isDeprecated: true
    },
    {
      mode: 'template_converter',
      titleKey: 'modeSelect.templateConverter',
      descriptionKey: 'modeSelect.templateConverterDesc',
      icon: <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>,
      className: "from-orange-600/20 to-burnt-orange-600/20 hover:from-orange-600/30 hover:to-burnt-orange-600/30 border-orange-500/30 hover:border-orange-400"
    },
    {
      mode: 'techspecs',
      titleKey: 'modeSelect.techspecs',
      descriptionKey: 'modeSelect.techspecsDesc',
      icon: <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2-2z" /></svg>,
      className: "from-gray-600/20 to-slate-600/20 hover:from-gray-600/30 hover:to-slate-600/30 border-gray-500/30 hover:border-gray-400"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          {videoPreviewUrl && <video src={videoPreviewUrl} className="w-32 h-20 object-cover rounded bg-black" muted />}
          <div className="flex-1 min-w-0">
            <p className="text-gray-300 font-medium truncate">{videoFile.name}</p>
            <p className="text-sm text-gray-500">{(videoFile.size / (1024 * 1024)).toFixed(2)} MB</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-center md:justify-end w-full md:w-auto">
          {Object.values(jobs).some(j => j.status === 'results') && (
            <button
              onClick={onDownloadAll}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg flex items-center gap-2 transition-all shadow-lg hover:shadow-blue-500/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              {t('modeSelect.downloadAll', 'Download All')}
            </button>
          )}

          <button
            onClick={onViewSettings}
            className="px-4 py-2 border border-blue-500/50 hover:bg-blue-500/10 text-blue-300 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Settings size={18} />
            {t('nav.settings', 'Settings')}
          </button>
          <button
            onClick={onViewHistory}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg flex items-center gap-2 transition-colors"
          >
            <History size={18} />
            {t('modeSelect.library', 'Library')}
          </button>
          <button onClick={onBack} className="px-4 py-2 border border-gray-600 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors whitespace-nowrap">
            {t('modeSelect.newUpload', 'New Upload')}
          </button>

          <button
            onClick={() => {
              // Trigger feedback modal via custom event since we don't have direct prop
              // This is a quick fix to avoid prop drilling through App.tsx -> ModeSelectView
              // Ideally we would pass onFeedback open prop
              const event = new CustomEvent('openFeedback');
              window.dispatchEvent(event);
            }}
            className="md:hidden px-4 py-2 border border-blue-500/30 text-blue-400 rounded-lg hover:bg-blue-500/10 transition-colors"
          >
            {t('modeSelect.feedback', 'Feedback')}
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-gray-200 mb-4 text-center">
          {isUploading ? t('modeSelect.uploadingDisabled', 'Video Uploading... (Analysis Disabled)') : t('modeSelect.chooseType', 'Choose Analysis Type')}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modes
            // Filter: During full_analysis processing, only show full_analysis card
            // After completion or when not running, show: full_analysis + any modules with results
            .filter(modeInfo => {
              const fullAnalysisJob = jobs['full_analysis'];
              const isFullAnalysisRunning = fullAnalysisJob?.status === 'processing';
              const hasAnyResults = Object.values(jobs).some(j => j.status === 'results');

              // Always show full_analysis card
              if (modeInfo.mode === 'full_analysis') return true;

              // During full_analysis processing, hide all individual modules
              if (isFullAnalysisRunning) return false;

              // After processing is done, show modules that have results
              const job = jobs[modeInfo.mode];
              if (job?.status === 'results') return true;

              // If no full analysis has been run yet (no results anywhere), show template_converter and techspecs
              if (!hasAnyResults && (modeInfo.mode === 'template_converter' || modeInfo.mode === 'techspecs')) {
                return true;
              }

              // Hide deprecated modules that don't have results
              return false;
            })
            .map(modeInfo => {
              const job = jobs[modeInfo.mode];
              const hasResults = job.status === 'results';
              // Enable deprecated modules if they have results from Full Analysis
              const isDisabled = isUploading || (modeInfo.isDeprecated && !hasResults);
              // Update description: show "View Results" prompt when results exist
              const description = hasResults
                ? t('modeSelect.resultsAvailable', '✓ Results available - Click to view')
                : modeInfo.descriptionKey ? t(modeInfo.descriptionKey) : '';

              return (
                <ModeCard
                  key={modeInfo.mode}
                  mode={modeInfo.mode}
                  job={job}
                  onSelect={onModeSelect}
                  title={t(modeInfo.titleKey)}
                  description={description}
                  icon={modeInfo.icon}
                  className={modeInfo.className}
                  disabled={isDisabled}
                  doneLabel={t('modeSelect.done', 'Done')}
                />
              );
            })}
        </div>
      </div>
    </div >
  );
};

export default ModeSelectView;

