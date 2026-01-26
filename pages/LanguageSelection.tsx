/**
 * Language Selection Page
 * Second step - choose interface language after cloud connection
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Globe } from 'lucide-react';

interface Language {
  code: string;
  name: string;
  flag: string;
  nativeName: string;
}

const LANGUAGES: Language[] = [
  { code: 'de', name: 'German', flag: '🇩🇪', nativeName: 'Deutsch' },
  { code: 'en', name: 'English', flag: '🇬🇧', nativeName: 'English' },
  { code: 'fr', name: 'French', flag: '🇫🇷', nativeName: 'Français' },
  { code: 'it', name: 'Italian', flag: '🇮🇹', nativeName: 'Italiano' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', nativeName: 'Español' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹', nativeName: 'Português' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱', nativeName: 'Nederlands' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱', nativeName: 'Polski' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵', nativeName: '日本語' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳', nativeName: '中文' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷', nativeName: '한국어' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺', nativeName: 'Русский' },
];

interface LanguageSelectionProps {
  onSelect: (langCode: string) => void;
}

export function LanguageSelection({ onSelect }: LanguageSelectionProps) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);

  const handleContinue = async () => {
    if (selected) {
      console.log('[LanguageSelection] Selected:', selected);
      // Store preference first
      localStorage.setItem('menuLanguage', selected);

      // Try to change the i18n language (may fail for unsupported languages)
      try {
        await i18n.changeLanguage(selected);
        console.log('[LanguageSelection] i18n changed to:', selected);
      } catch (err) {
        console.warn('[LanguageSelection] i18n change failed, using fallback:', err);
      }

      // Navigate to next screen
      console.log('[LanguageSelection] Calling onSelect...');
      onSelect(selected);
    }
  };


  return (
    <div className="language-page">
      <div className="language-container">
        {/* Background effects */}
        <div className="language-bg-gradient" />

        {/* Header */}
        <header className="language-header">
          <div className="language-icon-wrapper">
            <Globe className="language-icon" />
          </div>
          <h1>{t('language.title')}</h1>
          <p className="language-subtitle">{t('language.subtitle')}</p>
        </header>

        {/* Language Grid */}
        <div className="language-grid">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              className={`lang-card ${selected === lang.code ? 'selected' : ''}`}
              onClick={() => setSelected(lang.code)}
            >
              <span className="lang-flag">{lang.flag}</span>
              <span className="lang-name">{lang.nativeName}</span>
              {selected === lang.code && (
                <div className="lang-check">
                  <Check />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Note about output language */}
        <div className="output-note">
          <p>{t('language.outputNote')}</p>
        </div>

        {/* Continue Button - hardcoded text as fallback */}
        <button
          className="continue-btn"
          onClick={handleContinue}
          disabled={!selected}
          style={{ cursor: selected ? 'pointer' : 'not-allowed' }}
        >
          Weiter →
        </button>
      </div>

      <style>{`
        .language-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
          padding: 2rem;
          position: relative;
          overflow: hidden;
        }

        .language-bg-gradient {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: radial-gradient(circle at 50% 30%, rgba(99, 102, 241, 0.15) 0%, transparent 50%);
          pointer-events: none;
        }

        .language-container {
          position: relative;
          z-index: 1;
          max-width: 500px;
          width: 100%;
          text-align: center;
        }

        .language-header {
          margin-bottom: 2.5rem;
        }

        .language-icon-wrapper {
          width: 72px;
          height: 72px;
          margin: 0 auto 1.5rem;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 32px rgba(99, 102, 241, 0.3);
        }

        .language-icon {
          width: 36px;
          height: 36px;
          color: white;
        }

        .language-header h1 {
          font-size: 1.75rem;
          font-weight: 700;
          color: white;
          margin-bottom: 0.5rem;
        }

        .language-subtitle {
          color: #94a3b8;
          font-size: 1rem;
        }

        .language-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
          margin-bottom: 1.5rem;
          max-height: 400px;
          overflow-y: auto;
        }

        .lang-card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1rem 0.75rem;
          background: rgba(30, 41, 59, 0.6);
          backdrop-filter: blur(10px);
          border: 2px solid rgba(148, 163, 184, 0.1);
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .lang-card:hover {
          background: rgba(30, 41, 59, 0.8);
          border-color: rgba(139, 92, 246, 0.3);
          transform: translateY(-2px);
        }

        .lang-card.selected {
          background: rgba(139, 92, 246, 0.15);
          border-color: #8b5cf6;
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.3);
        }

        .lang-flag {
          font-size: 2.5rem;
          line-height: 1;
        }

        .lang-name {
          color: white;
          font-size: 1rem;
          font-weight: 600;
        }

        .lang-check {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 28px;
          height: 28px;
          background: #8b5cf6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
        }

        .lang-check svg {
          width: 16px;
          height: 16px;
          color: white;
        }

        .output-note {
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 2rem;
        }

        .output-note p {
          color: #a5b4fc;
          font-size: 0.9rem;
          margin: 0;
        }

        .continue-btn {
          width: 100%;
          padding: 1rem 2rem;
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          color: white;
          font-size: 1.1rem;
          font-weight: 600;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4);
        }

        .continue-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.5);
        }

        .continue-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        @media (max-width: 480px) {
          .language-grid {
            grid-template-columns: 1fr;
          }

          .lang-card {
            flex-direction: row;
            justify-content: flex-start;
            padding: 1rem 1.5rem;
          }

          .lang-flag {
            font-size: 2rem;
          }
        }
      `}</style>
    </div>
  );
}

export default LanguageSelection;
