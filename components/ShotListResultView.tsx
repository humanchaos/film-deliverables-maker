import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ShotListResult, VideoMetadata, ProjectMetadata, Shot } from '../types';
import { parseTimecode } from '../utils/tableUtils';
import { Download, Save } from 'lucide-react';
import ExportModal from './ExportModal';
import { useVerificationState } from '../hooks/useVerificationState';
import VideoThumbnail from './VideoThumbnail';

interface ShotListResultViewProps {
  result: ShotListResult;
  onReset?: () => void;
  onBack: () => void;
  onSave: (data: ShotListResult) => Promise<void>;
  videoPreviewUrl: string | null;
  videoFileName: string;
  videoMetadata?: VideoMetadata | null;
  projectMetadata: ProjectMetadata;
}

// Editable Cell Component
const EditableCell: React.FC<{
  value: string;
  onChange: (val: string) => void;
  isFocused: boolean;
  onFocus: () => void;
  className?: string; // Allow passing classes
  multiline?: boolean; // New prop for multiline support
}> = ({ value, onChange, isFocused, onFocus, className, multiline }) => {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isFocused && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  if (multiline) {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        className={`w-full bg-transparent border-none text-gray-300 focus:text-white focus:ring-0 p-0 resize-y min-h-[60px] leading-relaxed ${className || ''}`}
        rows={3}
      />
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      className={`w-full bg-transparent border-none text-gray-300 focus:text-white focus:ring-0 p-0 ${className || ''}`}
    />
  );
};

const ShotListResultView: React.FC<ShotListResultViewProps> = ({
  result,
  onBack,
  onSave,
  videoPreviewUrl,
  videoFileName,
  projectMetadata,
}) => {
  const [showExportModal, setShowExportModal] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Verification Hook
  const {
    data: shots,
    isDirty,
    cursor,
    setCursor,
    updateCell,
    navigate,
    save,
    registerFields
  } = useVerificationState<Shot>(result.shots, async (updatedShots) => {
    await onSave({ ...result, shots: updatedShots });
  });

  // Register editable fields
  useEffect(() => {
    registerFields(['nr', 'tcIn', 'tcOut', 'duration', 'description', 'action', 'audio']);
  }, [registerFields]);

  const activeVideoUrl = videoPreviewUrl || result.videoUrl;
  const isVideoAvailable = !!videoPreviewUrl;

  const seekToShot = useCallback((nr: number) => {
    if (!videoRef.current) return;
    const shot = shots.find(s => s.nr === nr);
    if (shot) {
      const time = parseTimecode(shot.tcIn, result.frameRate);
      videoRef.current.currentTime = time;
    }
  }, [shots, result.frameRate]);

  // Sync Video on Cursor Change (Tab Navigation)
  useEffect(() => {
    if (cursor && videoRef.current) {
      const shot = shots[cursor.rowIndex];
      const time = parseTimecode(shot.tcIn, result.frameRate);
      // Only seek if we are far away (prevent micro-stuttering if already there)
      if (Math.abs(videoRef.current.currentTime - time) > 1.0) {
        videoRef.current.currentTime = time;
      }
    }
  }, [cursor, shots, result.frameRate]);

  // Keyboard Shortcuts for Video Control & Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input (except for specific navigation keys if needed, but simple block is safer)
      const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA';

      // J-K-L & Space (Global unless handling text specifically, but we want these available during review)
      if (!isInput) {
        if (e.key === ' ') {
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
          }
        }
        if (e.key === 'j' || e.key === 'J') {
          if (videoRef.current) videoRef.current.currentTime -= 1; // Back 1s
        }
        if (e.key === 'l' || e.key === 'L') {
          if (videoRef.current) videoRef.current.currentTime += 1; // Fwd 1s
        }
        if (e.key === 'k' || e.key === 'K') {
          if (videoRef.current) videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
        }
      }

      // Tab Navigation (Works inside inputs too)
      if (e.key === 'Tab') {
        e.preventDefault();
        navigate(e.shiftKey ? 'prev' : 'next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <div className="space-y-6">

      {/* Verification Header */}
      <div className={`rounded-lg p-6 border transition-colors ${isDirty ? 'bg-amber-900/20 border-amber-500/50' : 'bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border-purple-500/30'}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
              Verification Station
              {isDirty && <span className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded font-bold uppercase">Unsaved Changes</span>}
            </h3>
            <p className="text-gray-400">{shots.length} shots • Tab to Verify • J-K-L Navigation</p>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={!isDirty} className={`px-4 py-2 text-white rounded-lg font-semibold flex items-center gap-2 ${isDirty ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-700 opacity-50 cursor-not-allowed'}`}>
              <Save size={18} />
              {isDirty ? 'Save Changes' : 'Saved'}
            </button>
            <button onClick={onBack} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold">Exit</button>
          </div>
        </div>

        {isVideoAvailable && (
          <div className="mb-6 bg-black rounded-lg overflow-hidden border border-gray-700 shadow-xl relative aspect-video max-h-[400px] mx-auto">
            <video
              ref={videoRef}
              src={activeVideoUrl}
              controls
              className="w-full h-full"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setShowExportModal(true)}
            className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            <Download size={20} />
            Export Options...
          </button>
          <ExportModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            type="shotlist"
            data={{ ...result, shots }} // Pass verified shots
            projectMetadata={projectMetadata}
            videoFileName={videoFileName}
            frameRate={result.frameRate}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 w-24">Preview</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 w-12">Nr</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 min-w-[110px]">TC In</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 min-w-[110px]">TC Out</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 min-w-[110px]">Dur</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Description</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Action</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Audio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {shots.map((shot, index) => {
                const isRowSelected = cursor?.rowIndex === index;

                return (
                  <tr
                    key={index}
                    className={`${index % 2 === 0 ? 'bg-gray-800/40' : 'bg-gray-800/20'} hover:bg-gray-700/30 transition-colors ${isRowSelected ? 'bg-purple-900/30' : ''}`}
                    onClick={() => {
                      setCursor({ rowIndex: index, fieldId: 'description' });
                      seekToShot(shot.nr);
                    }}
                  >
                    <td className="px-4 py-3">
                      {/* Use midpoint of shot for thumbnail to better match description */}
                      {(() => {
                        const tcInSec = parseTimecode(shot.tcIn, result.frameRate);
                        const tcOutSec = parseTimecode(shot.tcOut, result.frameRate);
                        const midpointSec = tcInSec + (tcOutSec - tcInSec) / 2;
                        return (
                          <VideoThumbnail
                            videoUrl={activeVideoUrl || null}
                            timecode={midpointSec}
                            frameRate={result.frameRate}
                            className="w-20 h-12 object-cover rounded shadow-sm border border-gray-700"
                          />
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 font-mono">
                      <EditableCell
                        value={(shot.nr ?? '').toString()}
                        onChange={(v) => updateCell(index, 'nr', parseInt(v) || shot.nr)}
                        isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'nr'}
                        onFocus={() => setCursor({ rowIndex: index, fieldId: 'nr' })}
                        className="text-center"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 font-mono whitespace-nowrap">
                      <EditableCell
                        value={shot.tcIn ?? ''}
                        onChange={(v) => updateCell(index, 'tcIn', v)}
                        isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'tcIn'}
                        onFocus={() => setCursor({ rowIndex: index, fieldId: 'tcIn' })}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 font-mono whitespace-nowrap">
                      <EditableCell
                        value={shot.tcOut ?? ''}
                        onChange={(v) => updateCell(index, 'tcOut', v)}
                        isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'tcOut'}
                        onFocus={() => setCursor({ rowIndex: index, fieldId: 'tcOut' })}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                      <EditableCell
                        value={shot.duration ?? ''}
                        onChange={(v) => updateCell(index, 'duration', v)}
                        isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'duration'}
                        onFocus={() => setCursor({ rowIndex: index, fieldId: 'duration' })}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 align-top">
                      <EditableCell
                        value={shot.description ?? ''}
                        onChange={(v) => updateCell(index, 'description', v)}
                        isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'description'}
                        onFocus={() => setCursor({ rowIndex: index, fieldId: 'description' })}
                        multiline
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 align-top">
                      <EditableCell
                        value={shot.action ?? ''}
                        onChange={(v) => updateCell(index, 'action', v)}
                        isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'action'}
                        onFocus={() => setCursor({ rowIndex: index, fieldId: 'action' })}
                        multiline
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 italic align-top">
                      <EditableCell
                        value={shot.audio ?? ''}
                        onChange={(v) => updateCell(index, 'audio', v)}
                        isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'audio'}
                        onFocus={() => setCursor({ rowIndex: index, fieldId: 'audio' })}
                        multiline
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ShotListResultView;