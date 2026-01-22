import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, X, Upload, Film, FileText, Settings, CheckCircle, Download, LayoutTemplate } from 'lucide-react';

const ONBOARDING_KEY = 'never_onboarding_completed_v1';

interface OnboardingGuideProps {
    onComplete: () => void;
    forceShow?: boolean;
}

interface Step {
    title: string;
    description: string;
    icon: React.ReactNode;
    tips?: string[];
}

const steps: Step[] = [
    {
        title: 'Welcome to NEVER. Video Analysis',
        description: 'This tool uses AI to analyze videos and generate professional deliverables for broadcast and film production. Let\'s walk through the key features.',
        icon: <Film className="w-12 h-12 text-purple-400" />,
        tips: [
            'Supports videos up to 2GB',
            'Works with MP4, MOV, AVI, WebM formats',
            'Analysis takes 5-15 minutes depending on video length'
        ]
    },
    {
        title: 'Step 1: Upload Your Video',
        description: 'Start by uploading a video file. The system will upload to Google Cloud Storage and then begin AI analysis automatically.',
        icon: <Upload className="w-12 h-12 text-blue-400" />,
        tips: [
            'Click "New Upload" to select a video',
            'Progress bar shows upload and analysis status',
            'You can cancel anytime if needed'
        ]
    },
    {
        title: 'Step 2: Full Analysis',
        description: 'The AI analyzes your video across multiple modules: Shot List, Transcription, Synopsis, Fauna (wildlife), Graphics/Lower Thirds, and Cast/Bios.',
        icon: <FileText className="w-12 h-12 text-green-400" />,
        tips: [
            'All modules run automatically',
            'Results appear as each module completes',
            'You can verify and edit all AI-generated content'
        ]
    },
    {
        title: 'Step 3: Verification Station',
        description: 'Review and correct AI-generated content. Use Tab to navigate between fields, and J-K-L keys to control video playback.',
        icon: <CheckCircle className="w-12 h-12 text-teal-400" />,
        tips: [
            'Tab / Shift+Tab: Navigate fields',
            'J/L: Rewind/Forward 1 second',
            'K or Spacebar: Play/Pause',
            'All edits are auto-tracked'
        ]
    },
    {
        title: 'Step 4: Export Deliverables',
        description: 'Export your verified content in industry-standard formats. Choose from Word documents, Excel spreadsheets, or plain text.',
        icon: <Download className="w-12 h-12 text-indigo-400" />,
        tips: [
            'Each module has its own export options',
            'Use "Export Options" button in each view',
            'Supports custom templates (see Settings)'
        ]
    },
    {
        title: 'Pro Tip: Custom Templates',
        description: 'In Settings (⚙️), you can upload custom Word/Excel templates. The system will merge your analysis data into your branded layouts.',
        icon: <LayoutTemplate className="w-12 h-12 text-amber-400" />,
        tips: [
            'Go to Settings → Template Manager',
            'Upload .docx or .xlsx files',
            'Templates use placeholder tags for data',
            'Perfect for branded deliverables'
        ]
    },
    {
        title: 'You\'re Ready!',
        description: 'That\'s everything you need to get started. Upload a video and let the AI do the heavy lifting!',
        icon: <CheckCircle className="w-12 h-12 text-green-500" />,
        tips: [
            'Access this guide anytime from Settings',
            'Use the Library to view past analyses',
            'Questions? Use the Feedback button'
        ]
    }
];

const OnboardingGuide: React.FC<OnboardingGuideProps> = ({ onComplete, forceShow = false }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        // Check if onboarding has been completed
        const completed = localStorage.getItem(ONBOARDING_KEY);
        if (!completed || forceShow) {
            setIsVisible(true);
        }
    }, [forceShow]);

    const handleComplete = () => {
        localStorage.setItem(ONBOARDING_KEY, 'true');
        setIsVisible(false);
        onComplete();
    };

    const handleSkip = () => {
        localStorage.setItem(ONBOARDING_KEY, 'true');
        setIsVisible(false);
        onComplete();
    };

    const nextStep = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            handleComplete();
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    if (!isVisible) return null;

    const step = steps[currentStep];
    const isLastStep = currentStep === steps.length - 1;
    const isFirstStep = currentStep === 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="relative w-full max-w-2xl mx-4 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
                {/* Progress bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gray-700">
                    <div
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300"
                        style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                    />
                </div>

                {/* Close button */}
                <button
                    onClick={handleSkip}
                    className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
                    title="Skip onboarding"
                >
                    <X size={20} />
                </button>

                {/* Content */}
                <div className="p-8 pt-10">
                    {/* Step indicator */}
                    <div className="flex justify-center gap-2 mb-6">
                        {steps.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentStep(idx)}
                                className={`w-2 h-2 rounded-full transition-all ${idx === currentStep
                                        ? 'w-6 bg-purple-500'
                                        : idx < currentStep
                                            ? 'bg-purple-400/50'
                                            : 'bg-gray-600'
                                    }`}
                            />
                        ))}
                    </div>

                    {/* Icon */}
                    <div className="flex justify-center mb-6">
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                            {step.icon}
                        </div>
                    </div>

                    {/* Title & Description */}
                    <h2 className="text-2xl font-bold text-white text-center mb-4">
                        {step.title}
                    </h2>
                    <p className="text-gray-300 text-center mb-6 leading-relaxed">
                        {step.description}
                    </p>

                    {/* Tips */}
                    {step.tips && (
                        <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
                            <ul className="space-y-2">
                                {step.tips.map((tip, idx) => (
                                    <li key={idx} className="flex items-start gap-3 text-sm text-gray-300">
                                        <span className="text-purple-400 mt-0.5">•</span>
                                        {tip}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Navigation */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                        <button
                            onClick={prevStep}
                            disabled={isFirstStep}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isFirstStep
                                    ? 'text-gray-600 cursor-not-allowed'
                                    : 'text-gray-300 hover:text-white hover:bg-white/10'
                                }`}
                        >
                            <ChevronLeft size={18} />
                            Back
                        </button>

                        <span className="text-sm text-gray-500">
                            {currentStep + 1} of {steps.length}
                        </span>

                        <button
                            onClick={nextStep}
                            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-lg transition-all shadow-lg shadow-purple-500/20"
                        >
                            {isLastStep ? 'Get Started' : 'Next'}
                            {!isLastStep && <ChevronRight size={18} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Export utility to reset onboarding (for Settings page)
export const resetOnboarding = () => {
    localStorage.removeItem(ONBOARDING_KEY);
};

// Export utility to check if onboarding was completed
export const isOnboardingCompleted = () => {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
};

export default OnboardingGuide;
