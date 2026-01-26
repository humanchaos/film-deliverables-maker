import React, { useRef, useState, DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Settings, Cloud, Loader2 } from 'lucide-react';

// Language options for inline selector - 5 main languages + custom
const LANGUAGES = [
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'custom', name: 'Custom', flag: '🌐' },
];

interface FileUploadViewProps {
  onFileSelect: (file: File) => void;
  onUriSelect?: (uri: string) => void;
  onOpenSettings?: () => void;
  // New props for unified landing
  isConnected?: boolean;
  hasLanguage?: boolean;
  isConnecting?: boolean;
  onConnect?: () => void;
  onSelectLanguage?: (langCode: string) => void;
}

const FileUploadView: React.FC<FileUploadViewProps> = ({
  onFileSelect,
  onUriSelect,
  onOpenSettings,
  isConnected = true,  // Default to true for backwards compatibility
  hasLanguage = true,  // Default to true for backwards compatibility
  isConnecting = false,
  onConnect,
  onSelectLanguage,
}) => {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleLanguageSelect = (langCode: string) => {
    // Handle custom language option
    if (langCode === 'custom') {
      const customLang = prompt('Enter your preferred output language (e.g., "Italian", "Mandarin", "Arabic"):');
      if (!customLang) return; // User cancelled

      // Use English UI but store custom language for output
      i18n.changeLanguage('en');
      localStorage.setItem('menuLanguage', 'en');
      localStorage.setItem('customOutputLanguage', customLang);
      onSelectLanguage?.('en');
      return;
    }

    // Clear custom language when selecting a standard language
    localStorage.removeItem('customOutputLanguage');

    // Change i18n language
    i18n.changeLanguage(langCode);
    localStorage.setItem('menuLanguage', langCode);
    // Notify parent
    onSelectLanguage?.(langCode);
  };

  // Render the appropriate action button based on state
  const renderActionButton = () => {
    // State 1: Not connected - show cloud connect button
    if (!isConnected) {
      return (
        <button
          onClick={onConnect}
          disabled={isConnecting}
          className="group bg-[#ccff00] hover:bg-[#bbe600] text-black font-mono text-sm tracking-widest px-8 py-4 uppercase transition-all duration-300 transform hover:scale-105 flex items-center gap-3 mx-auto disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {t('landing.connecting', 'VERBINDE...')}
            </>
          ) : (
            <>
              <Cloud className="w-5 h-5" />
              {t('landing.connectCloud', 'CLOUD VERBINDEN')}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      );
    }

    // State 2: Connected but no language - show horizontal language buttons
    if (!hasLanguage) {
      return (
        <div className="flex flex-wrap justify-center gap-3">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageSelect(lang.code)}
              className="bg-[#ccff00] hover:bg-[#bbe600] text-black font-mono text-sm px-4 py-3 transition-all duration-300 transform hover:scale-105 flex items-center gap-2 rounded-lg"
            >
              <span className="text-xl">{lang.flag}</span>
              <span>{lang.name}</span>
            </button>
          ))}
        </div>
      );
    }

    // State 3: Connected and language selected - show upload button
    return (
      <button
        onClick={() => fileInputRef.current?.click()}
        className="group bg-[#ccff00] hover:bg-[#bbe600] text-black font-mono text-sm tracking-widest px-8 py-4 uppercase transition-all duration-300 transform hover:scale-105 flex items-center gap-2 mx-auto"
      >
        {t('fileUpload.startUploading', 'UPLOAD STARTEN')}
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>
    );
  };

  return (
    <div
      className={`min-h-[80vh] flex flex-col items-center justify-center relative transition-colors duration-300 ${isDragging ? 'bg-zinc-900' : 'bg-transparent'}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Settings Access */}
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-[#ccff00] transition-colors z-50"
          title={t('nav.settings')}
        >
          <Settings className="w-6 h-6" />
        </button>
      )}
      {/* Main Content */}
      <div className="text-center space-y-2 z-10">
        <h1 className="text-[12rem] leading-none font-serif text-white tracking-tighter mix-blend-difference select-none">
          NEVER<span className="text-[#ccff00]">.</span>
          <span className="ml-4 px-4 py-2 text-3xl font-bold bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-full align-middle">V2</span>
        </h1>

        <div className="flex flex-col space-y-1 py-8">
          <p className="font-mono text-zinc-500 text-xl tracking-wider">{t('fileUpload.tagline1', 'Bildgenau.')}</p>
          <p className="font-mono text-zinc-500 text-xl tracking-wider">{t('fileUpload.tagline2', 'Vollautomatisch.')}</p>
          <p className="font-mono text-zinc-500 text-xl tracking-wider">{t('fileUpload.tagline3', 'Branchenstandard')}</p>
          <p className="font-mono text-zinc-500 text-xl tracking-wider">{t('fileUpload.tagline4', 'Deliverables.')}</p>
        </div>

        <p className="font-serif italic text-white text-4xl pt-8 pb-12 opacity-90">
          {t('fileUpload.goTakeBreak', 'Mach mal Pause.')}
        </p>

        {renderActionButton()}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Drag Overlay Indicator */}
      {isDragging && isConnected && hasLanguage && (
        <div className="absolute inset-0 border-4 border-[#ccff00] bg-black/50 backdrop-blur-sm flex items-center justify-center pointer-events-none z-50">
          <p className="text-[#ccff00] font-mono text-2xl animate-pulse">{t('fileUpload.dropHere', 'DROP VIDEO FILE HERE')}</p>
        </div>
      )}
    </div>
  );
};

export default FileUploadView;


