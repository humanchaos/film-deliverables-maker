/**
 * Speaker Manager Component
 * Allows renaming speakers globally across all transcript segments
 */
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Check, X } from 'lucide-react';
import { TranscriptionSegment } from '../types';

interface SpeakerManagerProps {
    segments: TranscriptionSegment[];
    onUpdate: (segments: TranscriptionSegment[]) => void;
}

export function SpeakerManager({ segments, onUpdate }: SpeakerManagerProps) {
    const { t } = useTranslation();
    const [renames, setRenames] = useState<Record<string, string>>({});
    const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);

    // Get unique speakers with segment counts
    const speakers = useMemo(() => {
        const counts: Record<string, number> = {};
        segments.forEach((s) => {
            const speaker = s.speaker || 'Unknown';
            counts[speaker] = (counts[speaker] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [segments]);

    const handleRenameChange = (oldName: string, newName: string) => {
        setRenames((prev) => ({ ...prev, [oldName]: newName }));
    };

    const applyRename = (oldName: string) => {
        const newName = renames[oldName]?.trim();
        if (!newName || newName === oldName) {
            setEditingSpeaker(null);
            setRenames((prev) => ({ ...prev, [oldName]: '' }));
            return;
        }

        // Apply to ALL segments with this speaker
        const updated = segments.map((seg) =>
            seg.speaker === oldName ? { ...seg, speaker: newName } : seg
        );
        onUpdate(updated);

        // Clear the input
        setRenames((prev) => ({ ...prev, [oldName]: '' }));
        setEditingSpeaker(null);
    };

    const cancelRename = (oldName: string) => {
        setRenames((prev) => ({ ...prev, [oldName]: '' }));
        setEditingSpeaker(null);
    };

    return (
        <div className="speaker-manager">
            <div className="speaker-header">
                <Users className="speaker-icon" />
                <h3>{t('speakers.title')}</h3>
            </div>
            <p className="speaker-hint">{t('speakers.hint')}</p>

            <div className="speaker-table">
                <div className="speaker-table-header">
                    <span>Speaker</span>
                    <span>{t('speakers.segments')}</span>
                    <span>{t('speakers.rename')}</span>
                </div>

                {speakers.map(({ name, count }) => (
                    <div key={name} className="speaker-row">
                        <div className="speaker-name">
                            <strong>{name}</strong>
                        </div>
                        <div className="speaker-count">{count}</div>
                        <div className="speaker-rename">
                            {editingSpeaker === name ? (
                                <div className="rename-input-group">
                                    <input
                                        type="text"
                                        placeholder={t('speakers.newName')}
                                        value={renames[name] || ''}
                                        onChange={(e) => handleRenameChange(name, e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') applyRename(name);
                                            if (e.key === 'Escape') cancelRename(name);
                                        }}
                                        autoFocus
                                    />
                                    <button
                                        className="rename-action apply"
                                        onClick={() => applyRename(name)}
                                        disabled={!renames[name]?.trim()}
                                        title={t('speakers.applyToAll')}
                                    >
                                        <Check />
                                    </button>
                                    <button
                                        className="rename-action cancel"
                                        onClick={() => cancelRename(name)}
                                        title={t('common.cancel')}
                                    >
                                        <X />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    className="rename-btn"
                                    onClick={() => setEditingSpeaker(name)}
                                >
                                    {t('speakers.rename')}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
        .speaker-manager {
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(148, 163, 184, 0.1);
          border-radius: 12px;
          padding: 1.25rem;
          margin-bottom: 1.5rem;
        }

        .speaker-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .speaker-icon {
          width: 20px;
          height: 20px;
          color: #8b5cf6;
        }

        .speaker-header h3 {
          font-size: 1rem;
          font-weight: 600;
          color: white;
          margin: 0;
        }

        .speaker-hint {
          color: #94a3b8;
          font-size: 0.85rem;
          margin-bottom: 1rem;
        }

        .speaker-table {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .speaker-table-header {
          display: grid;
          grid-template-columns: 1fr 80px 200px;
          gap: 1rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .speaker-row {
          display: grid;
          grid-template-columns: 1fr 80px 200px;
          gap: 1rem;
          align-items: center;
          padding: 0.75rem;
          background: rgba(15, 23, 42, 0.5);
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.05);
        }

        .speaker-name {
          color: white;
          font-size: 0.9rem;
        }

        .speaker-count {
          color: #94a3b8;
          font-size: 0.9rem;
          text-align: center;
        }

        .speaker-rename {
          display: flex;
          justify-content: flex-end;
        }

        .rename-btn {
          padding: 0.375rem 0.75rem;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 6px;
          color: #a78bfa;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.15s;
        }

        .rename-btn:hover {
          background: rgba(139, 92, 246, 0.2);
          border-color: rgba(139, 92, 246, 0.5);
        }

        .rename-input-group {
          display: flex;
          gap: 0.5rem;
          width: 100%;
        }

        .rename-input-group input {
          flex: 1;
          padding: 0.375rem 0.5rem;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 6px;
          color: white;
          font-size: 0.85rem;
        }

        .rename-input-group input:focus {
          outline: none;
          border-color: #8b5cf6;
        }

        .rename-action {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          transition: all 0.15s;
        }

        .rename-action svg {
          width: 16px;
          height: 16px;
        }

        .rename-action.apply {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .rename-action.apply:hover:not(:disabled) {
          background: rgba(34, 197, 94, 0.3);
        }

        .rename-action.apply:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .rename-action.cancel {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }

        .rename-action.cancel:hover {
          background: rgba(239, 68, 68, 0.3);
        }
      `}</style>
        </div>
    );
}

export default SpeakerManager;
