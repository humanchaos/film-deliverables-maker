/**
 * Result Page Layout
 * Consistent layout wrapper for all result pages
 * Ensures back button is in same position on every page
 */
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

interface ResultPageLayoutProps {
    title: string;
    children: ReactNode;
    exportButtons?: ReactNode;
    onBack: () => void;
}

export function ResultPageLayout({
    title,
    children,
    exportButtons,
    onBack,
}: ResultPageLayoutProps) {
    const { t } = useTranslation();

    return (
        <div className="result-page-layout">
            <header className="result-header">
                <h1>{title}</h1>
            </header>

            <main className="result-content">{children}</main>

            {/* CONSISTENT FOOTER ON ALL PAGES */}
            <footer className="result-footer">
                <button className="back-btn" onClick={onBack}>
                    <ArrowLeft className="back-icon" />
                    {t('nav.backToDashboard')}
                </button>

                {exportButtons && <div className="export-buttons">{exportButtons}</div>}
            </footer>

            <style>{`
        .result-page-layout {
          display: flex;
          flex-direction: column;
          min-height: 100%;
        }

        .result-header {
          padding: 1.5rem 2rem;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        }

        .result-header h1 {
          font-size: 1.5rem;
          font-weight: 600;
          color: white;
          margin: 0;
        }

        .result-content {
          flex: 1;
          padding: 1.5rem 2rem;
          overflow-y: auto;
        }

        .result-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 2rem;
          border-top: 1px solid rgba(148, 163, 184, 0.1);
          background: rgba(15, 23, 42, 0.5);
        }

        .back-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1rem;
          background: rgba(148, 163, 184, 0.1);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 8px;
          color: #94a3b8;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .back-btn:hover {
          background: rgba(148, 163, 184, 0.15);
          color: white;
          border-color: rgba(148, 163, 184, 0.3);
        }

        .back-icon {
          width: 18px;
          height: 18px;
        }

        .export-buttons {
          display: flex;
          gap: 0.75rem;
        }
      `}</style>
        </div>
    );
}

export default ResultPageLayout;
