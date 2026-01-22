import React, { useState, useMemo } from 'react';
import { SpeciesSighting, FaunaConfig, VideoMetadata, ProjectMetadata } from '../types';
import { useVerificationState } from '../hooks/useVerificationState';

import { Download, ArrowLeft, Copy, Check, Filter, Database } from 'lucide-react';
import { copyToClipboard, parseTimecode } from '../utils/tableUtils';
import VideoThumbnail from './VideoThumbnail';
import ExportModal from './ExportModal';



interface FaunaResultViewProps {
  sightings: SpeciesSighting[];
  videoFileName: string;
  videoPreviewUrl: string | null; // Added prop
  videoMetadata: VideoMetadata | null;
  projectMetadata: ProjectMetadata;
  onReset: () => void;
  onBack: () => void;
  config: FaunaConfig;
  onSave: (data: SpeciesSighting[]) => Promise<void>;
}

// Editable Cell Component (Duplicated for isolation to avoid prop drilling complex types)
const EditableCell: React.FC<{
  value: string;
  onChange: (val: string) => void;
  isFocused: boolean;
  onFocus: () => void;
  className?: string;
}> = ({ value, onChange, isFocused, onFocus, className }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isFocused && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onClick={(e) => e.stopPropagation()}
      className={`w-full bg-transparent border-none text-gray-300 focus:text-white focus:ring-0 p-0 cursor-pointer hover:bg-white/5 rounded px-2 -ml-2 transition-colors ${className || ''}`}
    />
  );
};

interface SpeciesEntry {
  commonName: string;
  latinName: string;
  germanName: string;
  firstTimecode: string;
  thumbnail?: string;
  allSightings: SpeciesSighting[];
  behaviors: string[]; // Aggregated unique behaviors
  iucnStatus?: string; // Should be consistent for the species
}

const FaunaResultView: React.FC<FaunaResultViewProps> = ({
  sightings,
  videoFileName,
  videoPreviewUrl,
  videoMetadata,
  projectMetadata,
  onReset,
  onBack,
  config,
  onSave,
}) => {
  const [copied, setCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const [showExportModal, setShowExportModal] = useState(false);

  const programTitle = videoFileName.replace(/\.[^/.]+$/, '');

  // Group sightings by species and get first appearance
  // Note: We are now working with 'sightings' state which will be managed by useVerificationState
  // However, useVerificationState manages flat list. We need to sync our species view.

  // Actually, we need to make the list editable. 
  // The 'sightings' prop is the initial data.

  const {
    data: localSightings,
    isDirty,
    cursor,
    setCursor,
    updateCell,
    save
  } = useVerificationState<SpeciesSighting>(sightings, async (updatedData) => {
    await onSave(updatedData);
  });

  const speciesList = useMemo((): SpeciesEntry[] => {
    const speciesMap = new Map<string, SpeciesEntry>();
    const safeSightings = Array.isArray(localSightings) ? localSightings : [];

    safeSightings.forEach(sighting => {
      // Key must be unique to the logical species. 
      // If user renames "Dog" to "Cat", we want it to move groups.
      // But we need a stable ID to update the source list. 
      // For now, we grouping by current names.
      const key = sighting.latinName || sighting.commonName;

      if (!speciesMap.has(key)) {
        speciesMap.set(key, {
          commonName: sighting.commonName,
          latinName: sighting.latinName,
          germanName: sighting.germanName || '',
          firstTimecode: sighting.timecode,
          thumbnail: sighting.thumbnail,
          allSightings: [sighting],
          behaviors: sighting.behavior ? [sighting.behavior] : [],
          iucnStatus: sighting.iucnStatus,
        });
      } else {
        const entry = speciesMap.get(key)!;
        entry.allSightings.push(sighting);
        if (sighting.behavior && !entry.behaviors.includes(sighting.behavior)) {
          entry.behaviors.push(sighting.behavior);
        }
        if (sighting.iucnStatus && !entry.iucnStatus) {
          entry.iucnStatus = sighting.iucnStatus;
        }

        // @ts-ignore
        if (parseTimecode(sighting.timecode) < parseTimecode(entry.firstTimecode)) {
          entry.firstTimecode = sighting.timecode;
          entry.thumbnail = sighting.thumbnail;
        }
      }
    });

    // @ts-ignore
    return Array.from(speciesMap.values()).sort((a, b) => parseTimecode(a.firstTimecode) - parseTimecode(b.firstTimecode));
  }, [localSightings]);

  const categories = useMemo(() => Array.from(new Set(sightings.map(s => s.category).filter(Boolean))).sort() as string[], [sightings]);

  const filteredSpeciesList = useMemo(() => {
    if (filterCategory === 'all') return speciesList;
    return speciesList.filter(species =>
      species.allSightings.some(s => s.category === filterCategory)
    );
  }, [speciesList, filterCategory]);

  const generateTableText = (): string => {
    let output = `SPECIES LIST / ARTENLISTE\n${programTitle.toUpperCase()}\n\n`;
    output += `┌───────────────────┬──────────────────────────┬──────────────────────────┬──────────────────────┬──────────┬──────────────────┐\n`;
    output += `│ COMMON NAME       │ LATIN NAME               │ ${config.secondaryLanguage.toUpperCase().substring(0, 15).padEnd(15)} │ BEHAVIOR             │ IUCN     │ 1st APPEARANCE   │\n`;
    output += `├───────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────┼──────────┼──────────────────┤\n`;
    filteredSpeciesList.forEach(s => {
      output += `│ ${s.commonName.substring(0, 17).padEnd(17)} │ ${s.latinName.substring(0, 24).padEnd(24)} │ ${(s.germanName || '').substring(0, 24).padEnd(24)} │ ${s.behaviors.join(', ').substring(0, 20).padEnd(20)} │ ${(s.iucnStatus || '-').substring(0, 8).padEnd(8)} │ ${s.firstTimecode.padEnd(16)} │\n`;
    });
    output += `└───────────────────┴──────────────────────────┴──────────────────────────┴──────────────────────┴──────────┴──────────────────┘\n`;
    return output;
  };

  const handleCopyTable = async () => {
    if (await copyToClipboard(generateTableText())) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveToDatabase = async () => {
    setIsSaving(true);
    await save(); // Use useVerificationState save
    setIsSaved(true);
    setIsSaving(false);
  };

  const handleBulkRename = (oldName: string, newCommon: string, newLatin: string) => {
    // Find all sightings that match the "Species Entry" we are editing
    // We identify them by their OLD name (before edit)
    // This is tricky because we are rendering the Aggregated View.
    // If we edit the Common Name in the row, we want to update ALL sightings that contributed to this row.

    // We will loop through the FLAT list (localSightings) and update matches.

    localSightings.forEach((s, index) => {
      // Check if this sighting belongs to the group we are editing.
      // We use the 'oldName' passed from the cell (which is effectively the key of the group)
      const key = s.commonName; // Or latin. 

      if (s.commonName === oldName || s.latinName === oldName) {
        if (newCommon !== s.commonName) updateCell(index, 'commonName', newCommon);
        if (newLatin !== s.latinName) updateCell(index, 'latinName', newLatin);
      }
    });
  };


  const videoRef = React.useRef<HTMLVideoElement>(null);

  const handleSeek = (timecode: string) => {
    if (videoMetadata && videoRef.current) {
      const seconds = parseTimecode(timecode, videoMetadata.frameRate || 25);

      // Always pause to satisfy "show the PAUSED frame"
      videoRef.current.pause();

      // Avoid micro-seeks if already close - matching TranscriptionView behavior
      if (Math.abs(videoRef.current.currentTime - seconds) > 0.5) {
        videoRef.current.currentTime = seconds;
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"><ArrowLeft size={20} />Back</button>
        <div className="flex gap-2">
          <button onClick={handleCopyTable} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg">{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? 'Copied!' : 'Copy Table'}</button>

          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold"
          >
            <Download size={18} />Export Options...
          </button>

          <ExportModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            type="fauna"
            data={sightings}
            projectMetadata={projectMetadata}
            videoFileName={videoFileName}
            frameRate={videoMetadata?.frameRate || 25}
          />

          <button onClick={handleSaveToDatabase} disabled={isSaved || isSaving} className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 rounded-lg disabled:bg-gray-500 disabled:cursor-not-allowed">{isSaved ? <Check size={18} /> : <Database size={18} />}{isSaved ? 'Saved' : isSaving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500">Species List / Artenliste</h2>
        <p className="text-gray-400 mt-2 font-semibold">{programTitle.toUpperCase()}</p>
      </div>

      {videoPreviewUrl && (
        <div className="mb-6 bg-black rounded-lg overflow-hidden border border-gray-700 shadow-xl relative aspect-video max-h-[400px] mx-auto">
          <video
            ref={videoRef}
            src={videoPreviewUrl}
            controls
            className="w-full h-full"
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-700/50 p-4 rounded-lg text-center"><div className="text-3xl font-bold text-green-400">{filteredSpeciesList.length}</div><div className="text-gray-400 text-sm mt-1">Unique Species</div></div>
        <div className="bg-gray-700/50 p-4 rounded-lg text-center"><div className="text-3xl font-bold text-emerald-400">{sightings.length}</div><div className="text-gray-400 text-sm mt-1">Total Sightings</div></div>
        <div className="bg-gray-700/50 p-4 rounded-lg text-center"><div className="text-3xl font-bold text-teal-400">{categories.length}</div><div className="text-gray-400 text-sm mt-1">Categories</div></div>
      </div>

      {categories.length > 0 && <div className="flex items-center gap-3"><Filter size={18} className="text-gray-400" /><select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"><option value="all">All Categories ({speciesList.length})</option>{categories.map(cat => { const count = speciesList.filter(s => s.allSightings.some(sight => sight.category === cat)).length; return <option key={cat} value={cat}>{cat} ({count})</option>; })}</select></div>}

      <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800/20">
        {/* Table Header - Static */}
        <div className="grid grid-cols-[120px_1fr_1fr_1.5fr_100px_120px_100px] bg-gray-700/50 border-b border-gray-600 text-sm font-semibold text-gray-300">
          <div className="px-4 py-3 border-r border-gray-700">Preview</div>
          <div className="px-4 py-3 border-r border-gray-700">COMMON NAME</div>
          <div className="px-4 py-3 border-r border-gray-700">LATIN NAME</div>
          <div className="px-4 py-3 border-r border-gray-700">BEHAVIORS</div>
          <div className="px-4 py-3 border-r border-gray-700">IUCN</div>
          <div className="px-4 py-3 border-r border-gray-700 text-center">1st</div>
          <div className="px-4 py-3 text-center">COUNT</div>
        </div>

        {/* Standard List */}
        <div className="divide-y divide-gray-700">
          {filteredSpeciesList.map((species, index) => {
            const isRowSelected = cursor?.rowIndex === index;
            return (
              <div
                key={`${species.commonName}-${index}`}
                onClick={(e) => {
                  // Only seek if clicking outside inputs
                  if ((e.target as HTMLElement).tagName !== 'INPUT') {
                    handleSeek(species.firstTimecode);
                  }
                }}
                className={`grid grid-cols-[120px_1fr_1fr_1.5fr_100px_120px_100px] items-center 
                  ${index % 2 === 0 ? 'bg-gray-800/40' : 'bg-gray-800/20'} 
                  hover:bg-gray-700/30 transition-colors cursor-pointer group
                  ${isRowSelected ? 'bg-teal-900/30' : ''}`}
              >
                <div className="px-4 py-2 border-r border-gray-700 relative h-20 flex items-center justify-center p-2">
                  <VideoThumbnail
                    videoUrl={videoPreviewUrl}
                    timecode={parseTimecode(species.firstTimecode, videoMetadata?.frameRate || 25)}
                    frameRate={videoMetadata?.frameRate || 25}
                    className="w-full h-full rounded-md pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity object-cover bg-black"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                    <span className="bg-black/60 text-white rounded-full p-1"><ArrowLeft size={16} className="rotate-180" /></span>
                  </div>
                </div>
                <div className="px-4 py-2 border-r border-gray-700 text-sm text-gray-300 group-hover:text-white truncate" title={species.commonName}>
                  <EditableCell
                    value={species.commonName}
                    onChange={(val) => {
                      localSightings.forEach((s, flatIndex) => {
                        if (s.commonName === species.commonName && s.latinName === species.latinName) {
                          updateCell(flatIndex, 'commonName', val);
                        }
                      });
                    }}
                    isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'commonName'}
                    onFocus={() => setCursor({ rowIndex: index, fieldId: 'commonName' })}
                  />
                </div>
                <div className="px-4 py-2 border-r border-gray-700 text-sm text-gray-400 italic truncate" title={species.latinName}>
                  <EditableCell
                    value={species.latinName}
                    onChange={(val) => {
                      localSightings.forEach((s, flatIndex) => {
                        if (s.commonName === species.commonName && s.latinName === species.latinName) {
                          updateCell(flatIndex, 'latinName', val);
                        }
                      });
                    }}
                    isFocused={cursor?.rowIndex === index && cursor?.fieldId === 'latinName'}
                    onFocus={() => setCursor({ rowIndex: index, fieldId: 'latinName' })}
                  />
                </div>
                <div className="px-4 py-2 border-r border-gray-700 text-sm text-gray-400 truncate" title={species.behaviors.join(', ')}>{species.behaviors.join(', ') || '-'}</div>
                <div className="px-4 py-2 border-r border-gray-700 text-sm text-gray-400 truncate">{species.iucnStatus || '-'}</div>
                <div className="px-4 py-2 border-r border-gray-700 text-sm font-mono text-center text-gray-400 group-hover:text-indigo-400 font-bold">{species.firstTimecode || species.allSightings[0]?.timecode || '-'}</div>
                <div className="px-4 py-2 text-center text-sm"><span className="inline-block px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs font-medium">{species.allSightings.length}</span></div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-center gap-4 pt-6 border-t border-gray-700/50">
        <button onClick={onReset} className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors font-medium">
          Analyze Another Video
        </button>
      </div>
    </div >
  );
};

export default FaunaResultView;
