import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { Download, ArrowLeft, Check, Copy } from 'lucide-react';
import { TemplateConverterResult } from '../types';

interface TemplateConverterResultViewProps {
    result: TemplateConverterResult;
    onReset: () => void;
    onBack: () => void;
}

const TemplateConverterResultView: React.FC<TemplateConverterResultViewProps> = ({ result, onReset, onBack }) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(result.convertedContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const blob = new Blob([result.convertedContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${result.originalFileName.split('.')[0]}_converted.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <span className="w-2 h-8 bg-green-500 rounded-full"></span>
                        {t('templateConverter.conversionComplete', 'Conversion Complete')}
                    </h2>
                    <p className="text-gray-400 mt-1 pl-5">
                        Content from <span className="text-gray-300 font-mono text-sm">{result.originalFileName}</span> adapted to <span className="text-gray-300 font-mono text-sm">{result.targetTemplateName}</span>
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
                    >
                        <ArrowLeft size={18} />
                        {t('common.back', 'Back')}
                    </button>
                    <button
                        onClick={onReset}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
                    >
                        {t('templateConverter.newConversion', 'New Conversion')}
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="bg-gray-800 rounded-t-xl border-b border-gray-700 p-4 flex justify-between items-center">
                <span className="text-sm font-medium text-gray-400 uppercase tracking-wider">{t('table.preview', 'Preview')}</span>
                <div className="flex gap-2">
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-sm transition-colors text-white"
                    >
                        {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                        {copied ? t('actions.copied', 'Copied') : t('actions.copyText', 'Copy Text')}
                    </button>
                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-sm transition-colors text-white shadow-lg shadow-indigo-900/20"
                    >
                        <Download size={14} />
                        {t('templateConverter.downloadMarkdown', 'Download Markdown')}
                    </button>
                </div>
            </div>

            {/* Content Preview */}
            <div className="bg-gray-900 rounded-b-xl border border-t-0 border-gray-700 p-8 min-h-[500px] prose prose-invert max-w-none">
                <ReactMarkdown>{result.convertedContent}</ReactMarkdown>
            </div>
        </div>
    );
};

export default TemplateConverterResultView;
