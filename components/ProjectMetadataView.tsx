import React, { useState } from 'react';
import { ProjectMetadata, ExportTemplate } from '../types';
import { Save, ArrowLeft, X, LogIn, LogOut, CheckCircle, FileSpreadsheet, PlayCircle } from 'lucide-react';
import TemplateManager from './TemplateManager';
import { authService } from '../services/authService';
import { resetOnboarding } from './OnboardingGuide';

interface ProjectMetadataViewProps {
    initialMetadata: ProjectMetadata;
    onSave: (metadata: ProjectMetadata, gcsToken?: string, gcsProjectId?: string, useProMode?: boolean) => void;
    onCheckAuth: () => void;
    onCancel: () => void;
    currentGcsToken?: string;
    currentGcsProjectId?: string;
    currentUseProMode?: boolean;
    googleUserEmail?: string;
    onGoogleSignIn: (email: string, token: string) => void;
    onGoogleSignOut: () => void;
}

const ProjectMetadataView: React.FC<ProjectMetadataViewProps> = ({
    initialMetadata,
    onSave,
    onCancel,
    currentGcsToken,
    currentGcsProjectId,
    currentUseProMode,
    googleUserEmail,
    onGoogleSignIn,
    onGoogleSignOut
}) => {
    const [metadata, setMetadata] = useState<ProjectMetadata>(initialMetadata);
    // Keep internal state for fallback/legacy token entry
    const [gcsToken, setGcsToken] = useState(currentGcsToken || '');
    const [gcsProjectId, setGcsProjectId] = useState(currentGcsProjectId || '');
    const [useProMode, setUseProMode] = useState(currentUseProMode || false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [showTemplateManager, setShowTemplateManager] = useState(false);
    // Output language: null = auto-detect from video
    const [outputLanguage, setOutputLanguage] = useState<string | null>(() => {
        return localStorage.getItem('outputLanguage');
    });

    const handleChange = (field: keyof ProjectMetadata, value: string) => {
        setMetadata(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(metadata, gcsToken, gcsProjectId, useProMode);
    };

    const handleGoogleSignIn = async () => {
        setIsAuthenticating(true);
        try {
            const user = await authService.signIn();
            onGoogleSignIn(user.email, user.accessToken);
            setGcsToken(user.accessToken); // Auto-fill the token field
            setUseProMode(true); // Auto-enable Pro Mode
        } catch (error) {
            console.error("Google Sign-In failed", error);
            alert("Sign-In failed. Please try again or use manual token entry.");
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleGoogleSignOut = () => {
        authService.signOut();
        onGoogleSignOut();
        setGcsToken(''); // Clear the token
        setUseProMode(false); // Disable Pro Mode
    };

    return (
        <div className="space-y-6 animate-fade-in relative">
            <button
                onClick={onCancel}
                className="absolute top-0 right-0 p-2 text-gray-400 hover:text-white transition-colors"
            >
                <X size={24} />
            </button>

            <div className="text-center pb-6 border-b border-gray-700">
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-500">
                    Project Settings
                </h2>
                <p className="text-gray-400 mt-2">
                    Global metadata for your document headers
                </p>
            </div>

            <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* ... (Existing Metadata Fields - Kept Compact for Brevity) ... */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Production Company</label>
                        <input
                            type="text"
                            value={metadata.productionCompany}
                            onChange={e => handleChange('productionCompany', e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                            placeholder="e.g. Discovery Channel"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Series Title</label>
                        <input type="text" value={metadata.seriesTitle} onChange={e => handleChange('seriesTitle', e.target.value)} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Episode Title</label>
                        <input type="text" value={metadata.episodeTitle} onChange={e => handleChange('episodeTitle', e.target.value)} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Episode Number</label>
                        <input type="text" value={metadata.episodeNumber} onChange={e => handleChange('episodeNumber', e.target.value)} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Director</label>
                        <input type="text" value={metadata.director} onChange={e => handleChange('director', e.target.value)} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Producer</label>
                        <input type="text" value={metadata.producer} onChange={e => handleChange('producer', e.target.value)} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Editor</label>
                        <input type="text" value={metadata.editor} onChange={e => handleChange('editor', e.target.value)} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Date</label>
                        <input type="date" value={metadata.date} onChange={e => handleChange('date', e.target.value)} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Export Template</label>
                        <select value={metadata.exportTemplate || 'Generic'} onChange={e => handleChange('exportTemplate', e.target.value as ExportTemplate)} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white">
                            <option value="Generic">Generic (Default)</option>
                            <option value="PBS">PBS (US Public TV)</option>
                            <option value="BBC">BBC (UK)</option>
                            <option value="ARTE">ARTE (Franco-German)</option>
                            <option value="ZDF">ZDF (German)</option>
                            <option value="FranceTV">France Télévisions</option>
                            <option value="ORF">ORF (Austrian)</option>
                            <option value="Custom">Custom Branding</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Output Language</label>
                        <select
                            value={outputLanguage || ''}
                            onChange={e => {
                                const value = e.target.value || null;
                                setOutputLanguage(value);
                                if (value) {
                                    localStorage.setItem('outputLanguage', value);
                                } else {
                                    localStorage.removeItem('outputLanguage');
                                }
                            }}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white"
                        >
                            <option value="">🔍 Auto-detect from video</option>
                            <option value="en">🇬🇧 English</option>
                            <option value="de">🇩🇪 German</option>
                            <option value="fr">🇫🇷 French</option>
                            <option value="es">🇪🇸 Spanish</option>
                            <option value="ja">🇯🇵 Japanese</option>
                            <option value="zh">🇨🇳 Mandarin Chinese</option>
                            <option value="ko">🇰🇷 Korean</option>
                            <option value="ru">🇷🇺 Russian</option>
                            <option value="pt">🇵🇹 Portuguese</option>
                            <option value="it">🇮🇹 Italian</option>
                            <option value="ar">🇸🇦 Arabic</option>
                        </select>
                        <p className="text-xs text-gray-500">Language for analysis results & exports (independent of UI)</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Custom Script Templates</label>
                        <button
                            type="button"
                            onClick={() => setShowTemplateManager(true)}
                            className="w-full px-4 py-2 bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/50 rounded-lg text-left flex items-center gap-3 transition-colors"
                        >
                            <FileSpreadsheet size={18} className="text-purple-400" />
                            <div>
                                <p className="font-medium text-white">Manage Templates</p>
                                <p className="text-xs text-gray-400">Upload industry-standard export layouts</p>
                            </div>
                        </button>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Onboarding</label>
                        <button
                            type="button"
                            onClick={() => {
                                resetOnboarding();
                                window.location.reload();
                            }}
                            className="w-full px-4 py-2 bg-teal-900/30 hover:bg-teal-900/50 border border-teal-700/50 rounded-lg text-left flex items-center gap-3 transition-colors"
                        >
                            <PlayCircle size={18} className="text-teal-400" />
                            <div>
                                <p className="font-medium text-white">Restart Walkthrough</p>
                                <p className="text-xs text-gray-400">New to the tool? Replay the getting started guide</p>
                            </div>
                        </button>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Start Timecode</label>
                        <input
                            type="text"
                            value={metadata.timecodeStart || '00:00:00:00'}
                            onChange={e => handleChange('timecodeStart', e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white font-mono placeholder-gray-500"
                            placeholder="00:00:00:00"
                        />
                        <p className="text-xs text-gray-500">Offset for exports (e.g. 01:00:00:00)</p>
                    </div>
                </div>

                <div className="pt-6 border-t border-gray-700">
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold text-blue-400">Cloud Connection</h3>

                        {!googleUserEmail ? (
                            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">
                                <p className="text-sm text-gray-300">
                                    Sign in with Google to unlock <strong>Pro Mode</strong> (Unlimited Upload Size, Zero Hallucinations).
                                </p>
                                <button
                                    type="button"
                                    onClick={handleGoogleSignIn}
                                    disabled={isAuthenticating}
                                    className="w-full py-2 bg-white hover:bg-gray-100 text-gray-900 font-medium rounded flex items-center justify-center gap-2 transition-colors"
                                >
                                    {isAuthenticating ? (
                                        <span className="animate-pulse">Connecting...</span>
                                    ) : (
                                        <>
                                            <LogIn size={18} />
                                            Sign In with Google
                                        </>
                                    )}
                                </button>
                                <div className="relative flex py-2 items-center">
                                    <div className="flex-grow border-t border-gray-700"></div>
                                    <span className="flex-shrink-0 mx-4 text-gray-500 text-xs">OR USE MANUAL TOKEN</span>
                                    <div className="flex-grow border-t border-gray-700"></div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-green-900/20 p-4 rounded-lg border border-green-800/50 space-y-3">
                                <div className="flex items-center gap-3">
                                    <CheckCircle className="text-green-500" size={24} />
                                    <div>
                                        <h4 className="font-semibold text-white">Connected</h4>
                                        <p className="text-xs text-green-400">{googleUserEmail}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleGoogleSignOut}
                                        className="ml-auto p-2 text-gray-400 hover:text-red-400 transition-colors"
                                        title="Disconnect"
                                    >
                                        <LogOut size={18} />
                                    </button>
                                </div>
                                <div className="text-xs text-gray-400">
                                    {currentGcsToken ? (
                                        <span className="text-green-400">Token active. Pro Mode is available.</span>
                                    ) : (
                                        <span className="text-yellow-400">Signed in, but token missing (Refresh page).</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Manual entry fallback (hidden if signed in, but still available in DOM/state) */}
                        {!googleUserEmail && (
                            <div className="space-y-2 opacity-75">
                                <label className="text-sm font-medium text-gray-300">GCS Access Token (Manual)</label>
                                <input
                                    type="password"
                                    value={gcsToken}
                                    onChange={e => setGcsToken(e.target.value)}
                                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-sm"
                                    placeholder="ya29.a0..."
                                />
                            </div>
                        )}

                        <div className="pt-4 border-t border-gray-700">
                            <label className={`flex items-center space-x-3 cursor-pointer group ${!gcsToken ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div className={`relative w-14 h-7 transition-colors rounded-full ${useProMode ? 'bg-blue-600' : 'bg-gray-600'}`}>
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={useProMode}
                                        onChange={e => setUseProMode(e.target.checked)}
                                        disabled={!gcsToken}
                                    />
                                    <div className={`absolute left-1 top-1 w-5 h-5 bg-white rounded-full transition-transform ${useProMode ? 'translate-x-7' : 'translate-x-0'}`} />
                                </div>
                                <div>
                                    <span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                                        Pro Mode (Zero Hallucination)
                                    </span>
                                    <p className="text-xs text-gray-400 mt-0.5 max-w-sm">
                                        {gcsToken ? 'Enabled by active token.' : 'Sign in or enter token to enable.'}
                                    </p>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="pt-8 flex justify-center gap-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <ArrowLeft size={20} />
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
                    >
                        <Save size={20} />
                        Save Settings
                    </button>
                </div>
            </form>

            {/* Template Manager Modal */}
            <TemplateManager
                isOpen={showTemplateManager}
                onClose={() => setShowTemplateManager(false)}
            />
        </div>
    );
};

export default ProjectMetadataView;
