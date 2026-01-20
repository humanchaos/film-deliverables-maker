import React, { useRef, useState, DragEvent } from 'react';
// Removed cached uploads feature - Gemini URIs expire and cause issues
import { ArrowRight, Settings } from 'lucide-react';

interface FileUploadViewProps {
  onFileSelect: (file: File) => void;
  onUriSelect?: (uri: string) => void;
  onOpenSettings?: () => void;
}

const FileUploadView: React.FC<FileUploadViewProps> = ({ onFileSelect, onUriSelect, onOpenSettings }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Removed recentUploads state - cached uploads feature removed

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
          title="Login & Settings"
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
          <p className="font-mono text-zinc-500 text-xl tracking-wider">Frame-accurate.</p>
          <p className="font-mono text-zinc-500 text-xl tracking-wider">Fully automatic.</p>
          <p className="font-mono text-zinc-500 text-xl tracking-wider">Industry Standard</p>
          <p className="font-mono text-zinc-500 text-xl tracking-wider">Deliverables.</p>
        </div>

        <p className="font-serif italic text-white text-4xl pt-8 pb-12 opacity-90">
          Go take a break.
        </p>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="group bg-[#ccff00] hover:bg-[#bbe600] text-black font-mono text-sm tracking-widest px-8 py-4 uppercase transition-all duration-300 transform hover:scale-105 flex items-center gap-2 mx-auto"
        >
          Start Uploading
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Drag Overlay Indicator */}
      {isDragging && (
        <div className="absolute inset-0 border-4 border-[#ccff00] bg-black/50 backdrop-blur-sm flex items-center justify-center pointer-events-none z-50">
          <p className="text-[#ccff00] font-mono text-2xl animate-pulse">DROP VIDEO FILE HERE</p>
        </div>
      )}

      {/* Recent Uploads Library REMOVED - Gemini URIs expire and cause issues */}
    </div>
  );
};

export default FileUploadView;
