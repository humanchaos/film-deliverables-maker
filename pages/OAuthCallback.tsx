/**
 * OAuth Callback Handler
 * Handles redirect from Google OAuth and stores connection info
 */
import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

interface OAuthCallbackProps {
    onComplete: () => void;
    onError: (error: string) => void;
}

export function OAuthCallback({ onComplete, onError }: OAuthCallbackProps) {
    const { setCloudConnection } = useApp();
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
    const [message, setMessage] = useState('Processing authentication...');

    useEffect(() => {
        const handleCallback = async () => {
            try {
                // Parse URL parameters
                const urlParams = new URLSearchParams(window.location.search);
                const hashParams = new URLSearchParams(window.location.hash.substring(1));

                // Check for access token (implicit flow) or code (authorization code flow)
                const accessToken = hashParams.get('access_token') || urlParams.get('access_token');
                const code = urlParams.get('code');
                const error = urlParams.get('error');
                const state = urlParams.get('state') || hashParams.get('state');

                if (error) {
                    throw new Error(`OAuth error: ${error}`);
                }

                if (!accessToken && !code) {
                    throw new Error('No access token or authorization code received');
                }

                // Determine cloud type from state parameter
                const cloudType = state?.includes('drive') ? 'drive' : 'gcs';

                let token = accessToken;

                // If we got an authorization code, exchange it for a token
                if (code && !accessToken) {
                    setMessage('Exchanging authorization code...');
                    // In a real implementation, this would call your backend to exchange the code
                    // For now, we'll simulate this
                    const response = await fetch('/api/auth/exchange', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, type: cloudType }),
                    });

                    if (!response.ok) {
                        throw new Error('Failed to exchange authorization code');
                    }

                    const data = await response.json();
                    token = data.access_token;
                }

                if (!token) {
                    throw new Error('Failed to obtain access token');
                }

                // Get user info
                setMessage('Retrieving user information...');
                const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!userInfoResponse.ok) {
                    throw new Error('Failed to get user info');
                }

                const userInfo = await userInfoResponse.json();
                const email = userInfo.email || 'Unknown';

                // Store connection
                setCloudConnection(cloudType, token, email);

                setStatus('success');
                setMessage('Connected successfully!');

                // Redirect after a brief delay
                setTimeout(() => {
                    onComplete();
                }, 1500);

            } catch (err) {
                console.error('[OAuthCallback] Error:', err);
                setStatus('error');
                setMessage(err instanceof Error ? err.message : 'Authentication failed');

                setTimeout(() => {
                    onError(err instanceof Error ? err.message : 'Authentication failed');
                }, 2000);
            }
        };

        handleCallback();
    }, [setCloudConnection, onComplete, onError]);

    return (
        <div className="oauth-callback">
            <div className="callback-container">
                {status === 'processing' && (
                    <>
                        <Loader2 className="callback-icon spinning" />
                        <h2>Processing...</h2>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <CheckCircle className="callback-icon success" />
                        <h2>Connected!</h2>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <XCircle className="callback-icon error" />
                        <h2>Connection Failed</h2>
                    </>
                )}

                <p>{message}</p>
            </div>

            <style>{`
        .oauth-callback {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
        }

        .callback-container {
          text-align: center;
          padding: 3rem;
          background: rgba(30, 41, 59, 0.8);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          border: 1px solid rgba(148, 163, 184, 0.1);
        }

        .callback-icon {
          width: 64px;
          height: 64px;
          margin-bottom: 1.5rem;
        }

        .callback-icon.spinning {
          color: #8b5cf6;
          animation: spin 1s linear infinite;
        }

        .callback-icon.success {
          color: #22c55e;
        }

        .callback-icon.error {
          color: #ef4444;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .callback-container h2 {
          color: white;
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
        }

        .callback-container p {
          color: #94a3b8;
          font-size: 1rem;
        }
      `}</style>
        </div>
    );
}

export default OAuthCallback;
