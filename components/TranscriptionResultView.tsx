import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TranscriptionResult, VideoMetadata, ProjectMetadata, TranscriptionSegment, GraphicsAnalysisResult, Bio } from '../types';
import { copyToClipboard } from '../utils/tableUtils';
import { Check, FileText, Download, Save, Wand2 } from 'lucide-react';
import ExportModal from './ExportModal';
import { useVerificationState } from '../hooks/useVerificationState';
import { parseTimecode } from '../utils/tableUtils';
import VideoThumbnail from './VideoThumbnail';

interface TranscriptionResultViewProps {
  result: TranscriptionResult;
  videoPreviewUrl: string | null;
  videoFileName: string;
  videoMetadata: VideoMetadata | null;
  projectMetadata: ProjectMetadata;
  graphicsResult?: GraphicsAnalysisResult | null;
  bioResult?: Bio[] | null; // Bio module data for speaker matching
  onReset?: () => void;
  onBack: () => void;
  onSave: (data: TranscriptionResult) => Promise<void>;
  onUpdateSpeaker?: (oldName: string, newName: string) => void;
  onUpdateSegment?: (index: number, updates: Partial<TranscriptionSegment>) => void;
}

// Editable Cell Component (Duplicated for isolation)
const EditableCell: React.FC<{
  value: string;
  onChange: (val: string) => void;
  isFocused: boolean;
  onFocus: () => void;
  className?: string;
  multiline?: boolean;
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
        onClick={(e) => e.stopPropagation()}
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
      onClick={(e) => e.stopPropagation()}
      className={`w-full bg-transparent border-none text-gray-300 focus:text-white focus:ring-0 p-0 cursor-pointer hover:bg-white/5 rounded px-2 -ml-2 transition-colors ${className || ''}`}
    />
  );
};

const TranscriptionResultView: React.FC<TranscriptionResultViewProps> = ({
  result,
  videoPreviewUrl,
  videoFileName,
  videoMetadata,
  projectMetadata,
  graphicsResult,
  bioResult,
  onBack,
  onSave,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Verification Hook
  const {
    data: segments,
    isDirty,
    cursor,
    setCursor,
    updateCell,
    navigate,
    save,
    registerFields
  } = useVerificationState<TranscriptionSegment>(result.segments, async (updatedSegments) => {
    await onSave({ ...result, segments: updatedSegments });
  });

  // Register fields
  useEffect(() => {
    registerFields(['startTime', 'endTime', 'speaker', 'transcript']);
  }, [registerFields]);

  const activeVideoUrl = videoPreviewUrl || undefined;
  const isVideoAvailable = !!videoPreviewUrl;

  const seekToSegment = useCallback((index: number) => {
    if (!videoRef.current || !segments[index]) return;
    const time = parseTimecode(segments[index].startTime, videoMetadata?.frameRate || 25);
    // Avoid micro-seeks if already close
    if (Math.abs(videoRef.current.currentTime - time) > 0.5) {
      videoRef.current.currentTime = time;
    }
  }, [segments, videoMetadata]);

  // Sync Video on Cursor (Tab)
  useEffect(() => {
    if (cursor && videoRef.current) {
      const time = parseTimecode(segments[cursor.rowIndex].startTime, videoMetadata?.frameRate || 25);
      if (Math.abs(videoRef.current.currentTime - time) > 0.5) {
        videoRef.current.currentTime = time;
      }
    }
  }, [cursor, segments, videoMetadata]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA';

      if (!isInput) {
        if (e.key === ' ') {
          e.preventDefault();
          if (videoRef.current) videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
        }
        if (e.key === 'j' || e.key === 'J') {
          if (videoRef.current) videoRef.current.currentTime -= 2;
        }
        if (e.key === 'l' || e.key === 'L') {
          if (videoRef.current) videoRef.current.currentTime += 2;
        }
        if (e.key === 'k' || e.key === 'K') {
          if (videoRef.current) videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
        }
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        navigate(e.shiftKey ? 'prev' : 'next');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const handleCopy = async () => {
    const text = segments
      .map(seg => {
        // Use the edited speaker directly
        const status = seg.isOnScreen === false ? ' [V.O.]' : '';
        return `${seg.startTime} - ${seg.endTime}\n${seg.speaker}${status}: ${seg.transcript}`;
      })
      .join('\n\n');

    if (await copyToClipboard(text)) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleAutoAssign = (silent: boolean = false) => {
    const hasLowerThirds = graphicsResult?.lowerThirds && graphicsResult.lowerThirds.length > 0;
    const hasBioData = bioResult && bioResult.length > 0;

    if (!hasLowerThirds && !hasBioData) {
      if (!silent) alert("No lower thirds or bio data found. Please run Graphics Analysis or Bio module first.");
      return;
    }

    const frameRate = videoMetadata?.frameRate || 25;
    let updatesFromLowerThirds = 0;
    let updatesFromBio = 0;

    segments.forEach((seg, index) => {
      if (seg.speaker.startsWith("SPEAKER_")) {
        let matched = false;

        // Method 1: Try lower thirds first (timecode-based matching)
        if (hasLowerThirds && !matched) {
          const segStart = parseTimecode(seg.startTime, frameRate);
          const segEnd = parseTimecode(seg.endTime, frameRate);

          const match = graphicsResult.lowerThirds.find(lt => {
            const ltStart = parseTimecode(lt.timecodeIn, frameRate);
            const ltEnd = parseTimecode(lt.timecodeOut, frameRate);
            return (ltStart < segEnd && ltEnd > segStart);
          });

          if (match && match.text) {
            updateCell(index, 'speaker', match.text);
            updatesFromLowerThirds++;
            matched = true;
          }
        }

        // Method 2: Try bio module names (transcript content matching)
        // Match if the transcript mentions a bio name
        if (hasBioData && !matched) {
          const transcriptLower = seg.transcript.toLowerCase();

          for (const bio of bioResult) {
            const fullNameLower = bio.fullName?.toLowerCase() || '';
            const nameLower = bio.name?.toLowerCase() || '';

            // Check if transcript mentions this person's name
            if (fullNameLower && transcriptLower.includes(fullNameLower)) {
              updateCell(index, 'speaker', bio.fullName);
              updatesFromBio++;
              matched = true;
              break;
            } else if (nameLower && nameLower.length > 3 && transcriptLower.includes(nameLower)) {
              updateCell(index, 'speaker', bio.fullName || bio.name);
              updatesFromBio++;
              matched = true;
              break;
            }
          }
        }
      }
    });

    const totalUpdates = updatesFromLowerThirds + updatesFromBio;

    if (!silent) {
      if (totalUpdates > 0) {
        let msg = `Auto-assigned ${totalUpdates} speakers.`;
        if (updatesFromLowerThirds > 0) msg += ` (${updatesFromLowerThirds} from lower thirds)`;
        if (updatesFromBio > 0) msg += ` (${updatesFromBio} from bio names)`;
        alert(msg);
      } else {
        alert("No matching lower thirds or bio names found for unknown speakers.");
      }
    }
  };

  // Auto-run assignment ONCE when data becomes available
  const hasAutoAssigned = useRef(false);

  useEffect(() => {
    // Only run if we haven't already, and we have data
    if (!hasAutoAssigned.current && graphicsResult?.lowerThirds && graphicsResult.lowerThirds.length > 0) {
      // Check if we have unassigned speakers
      const hasUnassigned = segments.some(s => s.speaker.startsWith("SPEAKER_"));
      if (hasUnassigned) {
        handleAutoAssign(true);
        hasAutoAssigned.current = true; // Mark as done to prevent re-runs
      }
    }
  }, [graphicsResult]); // React when graphics result loads

  return (
    <div className="space-y-6">

      {/* Verification Header */}
      <div className={`rounded-lg p-6 border transition-colors ${isDirty ? 'bg-amber-900/20 border-amber-500/50' : 'bg-gradient-to-r from-pink-900/30 to-rose-900/30 border-pink-500/30'}`}>
        <div className="flex flex-wrap items-center justify-between mb-4 gap-4">
          <div>
            <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
              Transcription Verification
              {isDirty && <span className="text-xs bg-amber-500 text-black px-2 py-0.5 rounded font-bold uppercase">Unsaved Changes</span>}
            </h3>
            <p className="text-gray-400">{segments.length} segments • Tab to Verify • J-K-L Navigation</p>
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

        {/* Buttons Grid - Flex Wrap for Responsive Layout */}
        <div className="flex flex-wrap gap-3">
          <button onClick={handleCopy} className="flex-1 min-w-[140px] px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2">
            {isCopied ? <><Check size={18} />Copied!</> : <><FileText size={18} />Copy Text</>}
          </button>

          {(graphicsResult || bioResult) && (
            <button onClick={() => handleAutoAssign(false)} className="flex-1 min-w-[200px] px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2">
              <Wand2 size={18} />
              Auto-Assign Names
            </button>
          )}

          <button
            onClick={() => setShowExportModal(true)}
            className="flex-1 min-w-[140px] px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            <Download size={20} />
            Export Options...
          </button>
        </div>
      </div>

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        type="transcription"
        data={{ ...result, segments }}
        projectMetadata={projectMetadata}
        videoFileName={videoFileName}
        frameRate={videoMetadata?.frameRate || 25}
      />

      <div className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 w-24">Preview</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 w-32">Start</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 w-32">End</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 w-48">Speaker</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300 w-24">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Transcript</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {segments.map((segment, index) => {
                const isRowSelected = cursor?.rowIndex === index;
                return (
                  <tr
                    key={index}
                    className={`${index % 2 === 0 ? 'bg-gray-800/40' : 'bg-gray-800/20'} hover:bg-gray-700/30 transition-colors ${isRowSelected ? 'bg-pink-900/30' : ''}`}
                    onClick={() => {
                      setCursor({ rowIndex: index, fieldId: 'transcript' });
                      seekToSegment(index);
                    }}
                  >
                    <td className="px-4 py-3">
                      <VideoThumbnail
                        videoUrl={activeVideoUrl || null}
                        timecode={segment.startTime || 0}
                        className="w-20 h-12 object-cover rounded shadow-sm border border-gray-700"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 font-mono whitespace-nowrap">
                      <EditableCell
                        value={segment.startTime ?? ''}
                        onChange={(v) => updateCell(index, 'startTime', v)}
                        isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'startTime'}
                        onFocus={() => setCursor({ rowIndex: index, fieldId: 'startTime' })}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 font-mono whitespace-nowrap">
                      <EditableCell
                        value={segment.endTime ?? ''}
                        onChange={(v) => updateCell(index, 'endTime', v)}
                        isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'endTime'}
                        onFocus={() => setCursor({ rowIndex: index, fieldId: 'endTime' })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <EditableCell
                        value={segment.speaker ?? ''}
                        onChange={(v) => updateCell(index, 'speaker', v)}
                        isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'speaker'}
                        onFocus={() => setCursor({ rowIndex: index, fieldId: 'speaker' })}
                        className="font-semibold text-pink-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateCell(index, 'isOnScreen', !segment.isOnScreen);
                        }}
                        className={`px-2 py-1 rounded text-xs font-bold leading-none transition-colors border ${segment.isOnScreen !== false
                          ? 'bg-green-900/40 text-green-300 border-green-700 hover:bg-green-900/60'
                          : 'bg-amber-900/40 text-amber-300 border-amber-700 hover:bg-amber-900/60'
                          }`}
                      >
                        {segment.isOnScreen !== false ? 'ON SCREEN' : 'V.O.'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 align-top">
                      <EditableCell
                        value={segment.transcript ?? ''}
                        onChange={(v) => updateCell(index, 'transcript', v)}
                        isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'transcript'}
                        onFocus={() => setCursor({ rowIndex: index, fieldId: 'transcript' })}
                        multiline
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TranscriptionResultView;

