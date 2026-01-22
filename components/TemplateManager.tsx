import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, FileSpreadsheet, Trash2, Plus, CheckCircle, AlertCircle } from 'lucide-react';
import {
    listTemplates,
    createTemplate,
    deleteTemplate,
    TemplateSummary,
    MODULE_TYPE_LABELS
} from '../services/templateService';

interface TemplateManagerProps {
    isOpen: boolean;
    onClose: () => void;
}

const MODULE_TYPES = [
    { value: 'shotList', label: 'Shot List' },
    { value: 'transcription', label: 'Transcription' },
    { value: 'fauna', label: 'Fauna / Wildlife' },
    { value: 'graphics', label: 'Graphics' },
    { value: 'cast', label: 'Cast / Bio' }
];

const TemplateManager: React.FC<TemplateManagerProps> = ({ isOpen, onClose }) => {
    const [templates, setTemplates] = useState<TemplateSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Upload form state
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [uploadName, setUploadName] = useState('');
    const [uploadModuleType, setUploadModuleType] = useState('shotList');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load templates on open
    useEffect(() => {
        if (isOpen) {
            loadTemplates();
        }
    }, [isOpen]);

    const loadTemplates = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await listTemplates();
            setTemplates(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load templates');
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async () => {
        if (!uploadName || !uploadFile) return;

        setUploading(true);
        setError(null);
        try {
            await createTemplate(uploadName, uploadModuleType, uploadFile);
            setUploadSuccess(true);
            setTimeout(() => {
                setUploadSuccess(false);
                setShowUploadForm(false);
                resetUploadForm();
                loadTemplates();
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Delete template "${name}"?`)) return;

        try {
            await deleteTemplate(id);
            loadTemplates();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed');
        }
    };

    const resetUploadForm = () => {
        setUploadName('');
        setUploadModuleType('shotList');
        setUploadFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-gray-700 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                            <FileSpreadsheet size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Script Templates</h2>
                            <p className="text-sm text-gray-400">Upload industry-standard layouts</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)]">
                    {/* Error Banner */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg flex items-center gap-2 text-red-300">
                            <AlertCircle size={18} />
                            <span className="text-sm">{error}</span>
                            <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-800/50 rounded">
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* Upload Form */}
                    {showUploadForm && (
                        <div className="mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                            <h3 className="font-semibold mb-4">Add New Template</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Template Name</label>
                                    <input
                                        type="text"
                                        value={uploadName}
                                        onChange={(e) => setUploadName(e.target.value)}
                                        placeholder="e.g., BBC Script Format"
                                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:border-purple-500 focus:outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Module Type</label>
                                    <select
                                        value={uploadModuleType}
                                        onChange={(e) => setUploadModuleType(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:border-purple-500 focus:outline-none"
                                    >
                                        {MODULE_TYPES.map(m => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Sample File</label>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                                        className="hidden"
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full py-3 border-2 border-dashed border-gray-600 rounded-lg hover:border-purple-500 hover:bg-gray-800/50 transition-all text-gray-400 flex items-center justify-center gap-2"
                                    >
                                        <Upload size={18} />
                                        {uploadFile ? uploadFile.name : 'Upload Excel or CSV sample'}
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={() => { setShowUploadForm(false); resetUploadForm(); }}
                                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleUpload}
                                    disabled={!uploadName || !uploadFile || uploading}
                                    className={`flex-1 px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${uploadSuccess
                                            ? 'bg-green-600'
                                            : uploadName && uploadFile && !uploading
                                                ? 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500'
                                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                        }`}
                                >
                                    {uploadSuccess ? (
                                        <><CheckCircle size={18} /> Saved!</>
                                    ) : uploading ? (
                                        <>Analyzing...</>
                                    ) : (
                                        <>Save Template</>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Templates List */}
                    {loading ? (
                        <div className="text-center py-8 text-gray-400">Loading templates...</div>
                    ) : templates.length === 0 ? (
                        <div className="text-center py-12">
                            <FileSpreadsheet className="mx-auto mb-4 text-gray-600" size={48} />
                            <p className="text-gray-400 mb-2">No templates yet</p>
                            <p className="text-sm text-gray-500">Upload a sample Excel/CSV to create your first template</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {templates.map(template => (
                                <div
                                    key={template.id}
                                    className="flex items-center justify-between p-4 bg-gray-800/40 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-purple-900/30 rounded-lg flex items-center justify-center">
                                            <FileSpreadsheet className="text-purple-400" size={20} />
                                        </div>
                                        <div>
                                            <p className="font-medium">{template.name}</p>
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <span className="px-2 py-0.5 bg-gray-700 rounded">
                                                    {MODULE_TYPE_LABELS[template.moduleType] || template.moduleType}
                                                </span>
                                                <span>{template.columnCount} columns</span>
                                                <span className="uppercase">{template.format}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(template.id, template.name)}
                                        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 flex justify-between">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                        Close
                    </button>
                    {!showUploadForm && (
                        <button
                            onClick={() => setShowUploadForm(true)}
                            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 rounded-lg font-medium flex items-center gap-2 transition-all"
                        >
                            <Plus size={18} />
                            Add Template
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TemplateManager;
