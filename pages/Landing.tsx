/**
 * Landing Page
 * First step - requires cloud storage connection before proceeding
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, Upload, Lock, Globe, Loader2 } from 'lucide-react';

interface LandingPageProps {
  onConnect: (type: 'gcs' | 'drive') => Promise<void>;
}

export function LandingPage({ onConnect }: LandingPageProps) {
  const { t } = useTranslation();
  const [isConnecting, setIsConnecting] = useState<'gcs' | 'drive' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (type: 'gcs' | 'drive') => {
    setIsConnecting(type);
    setError(null);
    try {
      await onConnect(type);
    } catch (err) {
      setError(t('errors.connectionFailed'));
      setIsConnecting(null);
    }
  };

  return (
    <div className="landing-page">
      <div className="landing-container">
        {/* Background gradient effects */}
        <div className="landing-bg-gradient" />
        <div className="landing-bg-glow" />

        {/* Header */}
        <header className="landing-header">
          <div className="landing-logo">
            <div className="logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 10l-4 4l6 6l4 -16l-18 7l7 2l0 5l3 -3" />
              </svg>
            </div>
            <h1>{t('landing.title')}</h1>
          </div>
          <p className="landing-subtitle">{t('landing.subtitle')}</p>
        </header>

        {/* Connection Box */}
        <div className="connection-box">
          <div className="connection-header">
            <Cloud className="connection-icon" />
            <h2>{t('landing.connectCloud')}</h2>
          </div>
          <p className="connection-description">{t('landing.connectRequired')}</p>

          {error && (
            <div className="connection-error">
              {error}
            </div>
          )}

          <div className="connection-buttons">
            <button
              className="connect-btn primary"
              onClick={() => handleConnect('gcs')}
              disabled={isConnecting !== null}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="btn-icon spinning" />
                  {t('landing.connecting')}
                </>
              ) : (
                <>
                  <Cloud className="btn-icon" />
                  Cloud-Speicher verbinden
                </>
              )}
            </button>
          </div>

          <ul className="benefits-list">
            <li>
              <Upload className="benefit-icon" />
              <span>{t('landing.benefits.largeFiles')}</span>
            </li>
            <li>
              <Lock className="benefit-icon" />
              <span>{t('landing.benefits.secure')}</span>
            </li>
            <li>
              <Globe className="benefit-icon" />
              <span>{t('landing.benefits.anywhere')}</span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <footer className="landing-footer">
          <p>Terra Mater Studios © {new Date().getFullYear()}</p>
        </footer>
      </div>

      <style>{`
        .landing-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
          padding: 2rem;
          position: relative;
          overflow: hidden;
        }

        .landing-bg-gradient {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle at 30% 30%, rgba(139, 92, 246, 0.15) 0%, transparent 50%),
                      radial-gradient(circle at 70% 70%, rgba(59, 130, 246, 0.1) 0%, transparent 50%);
          animation: rotate 30s linear infinite;
        }

        .landing-bg-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 600px;
          height: 600px;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%);
          filter: blur(60px);
        }

        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .landing-container {
          position: relative;
          z-index: 1;
          max-width: 480px;
          width: 100%;
          text-align: center;
        }

        .landing-header {
          margin-bottom: 2.5rem;
        }

        .landing-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .logo-icon {
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 32px rgba(139, 92, 246, 0.3);
        }

        .logo-icon svg {
          width: 32px;
          height: 32px;
          color: white;
        }

        .landing-logo h1 {
          font-size: 1.75rem;
          font-weight: 700;
          color: white;
          line-height: 1.3;
        }

        .landing-subtitle {
          color: #94a3b8;
          font-size: 1.1rem;
        }

        .connection-box {
          background: rgba(30, 41, 59, 0.8);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(148, 163, 184, 0.1);
          border-radius: 24px;
          padding: 2rem;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }

        .connection-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .connection-icon {
          width: 28px;
          height: 28px;
          color: #8b5cf6;
        }

        .connection-header h2 {
          font-size: 1.25rem;
          font-weight: 600;
          color: white;
        }

        .connection-description {
          color: #94a3b8;
          font-size: 0.95rem;
          margin-bottom: 1.5rem;
        }

        .connection-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          font-size: 0.9rem;
        }

        .connection-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .connect-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          width: 100%;
          padding: 1rem 1.5rem;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }

        .connect-btn.primary {
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          color: white;
          box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4);
        }

        .connect-btn.primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.5);
        }

        .connect-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-icon {
          width: 20px;
          height: 20px;
        }

        .btn-icon.spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .connection-divider {
          display: flex;
          align-items: center;
          gap: 1rem;
          color: #64748b;
          font-size: 0.9rem;
        }

        .connection-divider::before,
        .connection-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(148, 163, 184, 0.2);
        }

        .benefits-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .benefits-list li {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: #94a3b8;
          font-size: 0.9rem;
        }

        .benefit-icon {
          width: 18px;
          height: 18px;
          color: #6366f1;
        }

        .landing-footer {
          margin-top: 2rem;
          color: #475569;
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}

export default LandingPage;
