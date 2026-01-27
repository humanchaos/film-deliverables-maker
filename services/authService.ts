export interface GoogleUser {
    email: string;
    accessToken: string;
    expiresIn: number;
}

// Default Client ID if not in env
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '193471035724-r1ls7f68v5sjvldr0ss922bkeqr6q2ji.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/devstorage.read_write https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/cloud-platform';

class AuthService {
    private tokenClient: any = null;
    private accessToken: string | null = null;
    private tokenExpiration: number = 0;
    private userEmail: string | null = null;
    private initPromise: Promise<void> | null = null;

    constructor() {
        // Don't initialize in constructor - wait until needed
        this.restoreSession();
    }

    private restoreSession() {
        const storedToken = localStorage.getItem('gcs_access_token');
        const storedExpiration = localStorage.getItem('gcs_token_expiration');
        const storedEmail = localStorage.getItem('gcs_user_email');
        const currentTime = Date.now();

        console.log('[Auth Debug] Attempting Restore - Token:', storedToken ? 'YES' : 'NO', 'Expiration:', storedExpiration, 'Email:', storedEmail);

        if (storedToken && storedExpiration) {
            const exp = parseInt(storedExpiration, 10);
            const isValid = currentTime < exp;
            console.log(`[Auth Debug] Token Check: Exp=${exp}, Now=${currentTime}, Valid=${isValid}`);

            if (isValid) {
                this.accessToken = storedToken;
                this.tokenExpiration = exp;
                this.userEmail = storedEmail;
                console.log('[Auth Debug] Session Restored Successfully');
            } else {
                console.warn('[Auth Debug] Stored token is expired. Clearing storage.');
                this.signOut(); // Clear invalid data
            }
        }
    }

    /**
     * Wait for Google Identity Services to load
     */
    private waitForGIS(timeout = 10000): Promise<void> {
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            // Check if already loaded
            if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
                console.log('[Auth] GIS already loaded');
                resolve();
                return;
            }

            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                if (window.google?.accounts?.oauth2) {
                    clearInterval(checkInterval);
                    console.log('[Auth] GIS script loaded');
                    resolve();
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    reject(new Error('Google Identity Services failed to load. Check your internet connection.'));
                }
            }, 100);
        });

        return this.initPromise;
    }

    private async initializeClient(): Promise<void> {
        // Wait for GIS to load
        await this.waitForGIS();

        if (this.tokenClient) {
            return; // Already initialized
        }

        try {
            this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: () => {
                    // Placeholder - actual callback set in signIn()
                },
            });
            console.log("[Auth] Google Auth Client Initialized");
        } catch (error) {
            console.error("[Auth] Failed to initialize Google Auth Client:", error);
            throw new Error('Failed to initialize Google authentication');
        }
    }

    /**
     * Triggers the Google Sign-In popup
     * @returns Promise resolving to the access token
     */
    public async signIn(): Promise<GoogleUser> {
        // Initialize if not already
        await this.initializeClient();

        if (!this.tokenClient) {
            throw new Error("Google Identity Services not available. Please refresh the page.");
        }

        return new Promise((resolve, reject) => {
            // Set timeout for the auth flow
            const timeout = setTimeout(() => {
                reject(new Error('Sign-in timed out. Please try again.'));
            }, 60000); // 1 minute timeout

            // Override the callback for this specific request
            this.tokenClient.callback = async (response: any) => {
                clearTimeout(timeout);

                if (response.error) {
                    console.error('[Auth] Sign-in error:', response);
                    reject(new Error(response.error_description || response.error || 'Sign-in failed'));
                    return;
                }

                this.accessToken = response.access_token;
                // Calculate expiration (usually 3599 seconds)
                this.tokenExpiration = Date.now() + (response.expires_in * 1000);

                try {
                    // Fetch user email using the token
                    const userInfo = await this.fetchUserInfo(response.access_token);
                    this.userEmail = userInfo.email;

                    // Persist session
                    localStorage.setItem('gcs_access_token', response.access_token);
                    localStorage.setItem('gcs_token_expiration', String(this.tokenExpiration));
                    localStorage.setItem('gcs_user_email', userInfo.email);

                    resolve({
                        email: userInfo.email,
                        accessToken: response.access_token,
                        expiresIn: response.expires_in
                    });
                } catch (error) {
                    console.error("[Auth] Failed to fetch user info", error);
                    // Still return token even if email fetch fails
                    resolve({
                        email: 'Unknown User',
                        accessToken: response.access_token,
                        expiresIn: response.expires_in
                    });
                }
            };

            // Error callback for popup closed
            this.tokenClient.error_callback = (error: any) => {
                clearTimeout(timeout);
                console.error('[Auth] Token client error:', error);
                reject(new Error(error.message || 'Authentication was cancelled'));
            };

            // Request permission directly (Popup)
            try {
                this.tokenClient.requestAccessToken({ prompt: 'consent' });
            } catch (error) {
                clearTimeout(timeout);
                console.error('[Auth] Failed to request access token:', error);
                reject(error);
            }
        });
    }

    public signOut() {
        if (this.accessToken) {
            window.google?.accounts.oauth2.revoke(this.accessToken, () => {
                console.log('[Auth] Access token revoked');
            });
        }
        this.accessToken = null;
        this.userEmail = null;
        this.tokenExpiration = 0;
        // Clear all auth-related localStorage keys to prevent UI state mismatch
        localStorage.removeItem('gcs_access_token');
        localStorage.removeItem('gcs_token_expiration');
        localStorage.removeItem('gcs_user_email');
        // Also clear the app-level connection flags
        localStorage.removeItem('cloudConnected');
        localStorage.removeItem('gcsAccessToken');  // Legacy key used in some places
    }

    public getAccessToken(): string | null {
        if (this.isValid()) {
            return this.accessToken;
        }
        return null;
    }

    public getUserEmail(): string | null {
        return this.userEmail;
    }

    public isValid(): boolean {
        return !!this.accessToken && Date.now() < this.tokenExpiration;
    }

    private async fetchUserInfo(accessToken: string): Promise<{ email: string }> {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) throw new Error('Failed to fetch user info');
        return await response.json();
    }
}

export const authService = new AuthService();
