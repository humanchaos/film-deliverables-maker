export interface GoogleUser {
    email: string;
    accessToken: string;
    expiresIn: number;
}

// Default Client ID if not in env
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '193471035724-r1ls7f68v5sjvldr0ss922bkeqr6q2ji.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/devstorage.read_write https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/cloud-platform';

class AuthService {
    private tokenClient: any;
    private accessToken: string | null = null;
    private tokenExpiration: number = 0;
    private userEmail: string | null = null;

    constructor() {
        this.initializeClient();
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

    private initializeClient() {
        if (typeof window === 'undefined' || !window.google) return;

        try {
            this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (response: any) => {
                    // This callback isn't used for promise-based flows but required by init
                    console.debug('Token callback received', response);
                },
            });
            console.log("Google Auth Client Initialized");
        } catch (error) {
            console.error("Failed to initialize Google Auth Client:", error);
        }
    }

    /**
     * Triggers the Google Sign-In popup
     * @returns Promise resolving to the access token
     */
    public async signIn(): Promise<GoogleUser> {
        return new Promise((resolve, reject) => {
            if (!this.tokenClient) {
                this.initializeClient();
                if (!this.tokenClient) {
                    return reject(new Error("Google Identity Services not loaded. Check internet connection."));
                }
            }

            // Override the callback for this specific request
            this.tokenClient.callback = async (response: any) => {
                if (response.error) {
                    reject(response);
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
                    console.error("Failed to fetch user info", error);
                    // Still return token even if email fetch fails
                    resolve({
                        email: 'Unknown User',
                        accessToken: response.access_token,
                        expiresIn: response.expires_in
                    });
                }
            };

            // Request permission directly (Popup)
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    public signOut() {
        if (this.accessToken) {
            window.google?.accounts.oauth2.revoke(this.accessToken, () => {
                console.log('Access token revoked');
            });
        }
        this.accessToken = null;
        this.userEmail = null;
        this.tokenExpiration = 0;
        localStorage.removeItem('gcs_access_token');
        localStorage.removeItem('gcs_token_expiration');
        localStorage.removeItem('gcs_user_email');
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
