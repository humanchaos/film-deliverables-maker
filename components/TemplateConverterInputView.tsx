import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, ArrowRight, RefreshCw } from 'lucide-react';

interface TemplateConverterInputViewProps {
    onConvert: (sourceFile: File, targetFile: File) => void;
    onBack: () => void;
}

const TemplateConverterInputView: React.FC<TemplateConverterInputViewProps> = ({ onConvert, onBack }) => {
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [targetFile, setTargetFile] = useState<File | null>(null);
    const { t } = useTranslation();
    const sourceInputRef = useRef<HTMLInputElement>(null);
    const targetInputRef = useRef<HTMLInputElement>(null);

    const handleSourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSourceFile(e.target.files[0]);
        }
    };

    const handleTargetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setTargetFile(e.target.files[0]);
        }
    };

    const handleStart = () => {
        if (sourceFile && targetFile) {
            onConvert(sourceFile, targetFile);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-amber-600 mb-2">
                    {t('input.templateConverter.title', 'Template Converter')}
                </h2>
                <p className="text-gray-400">
                    Upload your content source and a target template. AI will migrate the content to match the new layout.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                {/* Source File Card */}
                <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 hover:border-orange-500/50 transition-colors group">
                    <div className="text-center">
                        <div className="w-12 h-12 bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-orange-900/50 transition-colors">
                            <FileText className="text-orange-400" size={24} />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">1. Source Content</h3>
                        <p className="text-sm text-gray-500 mb-4">The document containing the text you want to use.</p>

                        <input
                            type="file"
                            ref={sourceInputRef}
                            onChange={handleSourceChange}
                            className="hidden"
                            accept=".pdf,.docx,.txt,.md"
                        />

                        {!sourceFile ? (
                            <button
                                onClick={() => sourceInputRef.current?.click()}
                                className="w-full py-4 border-2 border-dashed border-gray-600 rounded-lg hover:border-orange-500 hover:bg-gray-700/30 transition-all text-gray-400 font-medium"
                            >
                                <Upload className="mx-auto mb-2" size={20} />
                                Click to Upload Source
                            </button>
                        ) : (
                            <div className="bg-gray-700/50 p-4 rounded-lg flex items-center justify-between">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="min-w-8 min-h-8 bg-orange-500/20 rounded flex items-center justify-center">
                                        <FileText size={16} className="text-orange-400" />
                                    </div>
                                    <div className="truncate">
                                        <p className="text-sm font-medium text-white truncate">{sourceFile.name}</p>
                                        <p className="text-xs text-gray-500">{(sourceFile.size / 1024).toFixed(0)} KB</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSourceFile(null)}
                                    className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white"
                                >
                                    <RefreshCw size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Arrow for Desktop */}
                <div className="hidden md:flex justify-center">
                    <ArrowRight className="text-gray-600" size={32} />
                </div>

                {/* Target File Card */}
                <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 hover:border-amber-500/50 transition-colors group">
                    <div className="text-center">
                        <div className="w-12 h-12 bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-amber-900/50 transition-colors">
                            <Upload className="text-amber-400" size={24} />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">2. Target Template</h3>
                        <p className="text-sm text-gray-500 mb-4">The document with the layout/style you want to use.</p>

                        <input
                            type="file"
                            ref={targetInputRef}
                            onChange={handleTargetChange}
                            className="hidden"
                            accept=".pdf,.docx,.txt,.md"
                        />

                        {!targetFile ? (
                            <button
                                onClick={() => targetInputRef.current?.click()}
                                className="w-full py-4 border-2 border-dashed border-gray-600 rounded-lg hover:border-amber-500 hover:bg-gray-700/30 transition-all text-gray-400 font-medium"
                            >
                                <Upload className="mx-auto mb-2" size={20} />
                                Click to Upload Template
                            </button>
                        ) : (
                            <div className="bg-gray-700/50 p-4 rounded-lg flex items-center justify-between">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="min-w-8 min-h-8 bg-amber-500/20 rounded flex items-center justify-center">
                                        <FileText size={16} className="text-amber-400" />
                                    </div>
                                    <div className="truncate">
                                        <p className="text-sm font-medium text-white truncate">{targetFile.name}</p>
                                        <p className="text-xs text-gray-500">{(targetFile.size / 1024).toFixed(0)} KB</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setTargetFile(null)}
                                    className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white"
                                >
                                    <RefreshCw size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex gap-4 pt-8">
                <button
                    onClick={onBack}
                    className="px-6 py-3 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
                >
                    {t('common.back', 'Back')}
                </button>
                <button
                    onClick={handleStart}
                    disabled={!sourceFile || !targetFile}
                    className={`
            flex-1 px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all
            ${sourceFile && targetFile
                            ? 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 shadow-lg shadow-orange-900/30'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
          `}
                >
                    <RefreshCw className={sourceFile && targetFile ? "animate-pulse" : ""} size={20} />
                    {t('input.templateConverter.convert', 'Convert Format')}
                </button>
            </div>
        </div>
    );
};

export default TemplateConverterInputView;
