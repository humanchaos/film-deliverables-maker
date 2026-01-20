import React from 'react';
import { Server, Construction } from 'lucide-react';

/**
 * ModelRouterSettings - Placeholder Component
 * 
 * The LLM provider switching feature has been temporarily disabled during
 * Phase 1 consolidation. All analysis now routes through the backend.
 */
export const ModelRouterSettings: React.FC = () => {
    return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-2xl mx-auto my-8">
            <div className="flex items-center gap-3 mb-6">
                <div className="bg-gray-500/20 p-3 rounded-full">
                    <Server className="text-gray-400" size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white">Model Router</h2>
                    <p className="text-gray-400 text-sm">Provider switching for AI models</p>
                </div>
            </div>

            <div className="bg-amber-900/30 border border-amber-500/30 rounded p-6 flex flex-col items-center gap-4">
                <Construction className="text-amber-500" size={48} />
                <div className="text-center">
                    <h3 className="text-amber-400 font-bold text-lg">Feature Temporarily Disabled</h3>
                    <p className="text-amber-200/70 text-sm mt-2 max-w-md">
                        The Model Router is being migrated to the backend as part of the Phase 1 architecture consolidation.
                        All analysis currently uses <strong>Google Gemini</strong> via the Cloud Run backend.
                    </p>
                </div>
            </div>
        </div>
    );
};
