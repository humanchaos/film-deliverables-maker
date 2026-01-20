import React, { useState } from 'react';
import { X, Send, Bug, AlertTriangle, Lightbulb, MessageSquare } from 'lucide-react';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type FeedbackType = 'bug' | 'error' | 'wish';

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
    const [type, setType] = useState<FeedbackType>('bug');
    const [comment, setComment] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const subject = `[Gemini App Feedback] - ${type.toUpperCase()}`;
        const body = `Type: ${type.toUpperCase()}\n\nComment:\n${comment}\n\n---\nSent from Gemini Super App`;

        const mailtoLink = `mailto:nvrdeliverables@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        // Open default mail client
        window.location.href = mailtoLink;

        // Optional: Close modal after sending or show success message
        onClose();
    };

    const getTypeIcon = (t: FeedbackType) => {
        switch (t) {
            case 'bug': return <Bug size={18} />;
            case 'error': return <AlertTriangle size={18} />;
            case 'wish': return <Lightbulb size={18} />;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/80 animate-fade-in p-4" onClick={onClose}>
            <div
                className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-gray-800/30">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                            <MessageSquare size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Feedback</h3>
                            <p className="text-sm text-gray-400">Help us improve the app</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">

                    {/* Feedback Type Selection */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-gray-300">What kind of feedback is this?</label>
                        <div className="grid grid-cols-3 gap-3">
                            {(['bug', 'error', 'wish'] as FeedbackType[]).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setType(t)}
                                    className={`
                    flex flex-col items-center gap-2 p-3 rounded-lg border transition-all
                    ${type === t
                                            ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                                            : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800 hover:border-gray-600'}
                  `}
                                >
                                    {getTypeIcon(t)}
                                    <span className="text-xs font-medium uppercase tracking-wider">{t}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Comment Area */}
                    <div className="space-y-3">
                        <label htmlFor="comment" className="text-sm font-medium text-gray-300">Your Comments</label>
                        <textarea
                            id="comment"
                            required
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Describe the issue or your idea..."
                            className="w-full h-32 bg-gray-950 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                        />
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors group"
                    >
                        <Send size={18} className="group-hover:translate-x-1 transition-transform" />
                        Send Feedback
                    </button>

                    <p className="text-center text-xs text-gray-500">
                        This will open your default email client.
                    </p>
                </form>
            </div>
        </div>
    );
};

export default FeedbackModal;
