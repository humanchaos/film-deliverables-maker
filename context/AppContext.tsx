/**
 * App Context
 * Global state for cloud connection and menu language
 */
import { createContext, useContext, useState, ReactNode } from 'react';
import { changeLanguage } from '../i18n';

interface AppContextType {
    // Cloud connection state
    isCloudConnected: boolean;
    cloudType: 'gcs' | 'drive' | null;
    gcsAccessToken: string | null;
    gcsUserEmail: string | null;
    setCloudConnection: (type: 'gcs' | 'drive', token: string, email: string) => void;
    clearCloudConnection: () => void;

    // Menu language state
    menuLanguage: string | null;
    setMenuLanguage: (lang: string) => void;

    // Output language (film-based, set per job)
    outputLanguage: string | null;
    setOutputLanguage: (lang: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
    CLOUD_CONNECTED: 'cloudConnected',
    CLOUD_TYPE: 'cloudType',
    GCS_TOKEN: 'gcsAccessToken',
    GCS_EMAIL: 'gcsUserEmail',
    MENU_LANGUAGE: 'menuLanguage',
    OUTPUT_LANGUAGE: 'outputLanguage',
};

export function AppProvider({ children }: { children: ReactNode }) {
    // Initialize from localStorage
    const [isCloudConnected, setIsCloudConnected] = useState<boolean>(() => {
        return localStorage.getItem(STORAGE_KEYS.CLOUD_CONNECTED) === 'true';
    });

    const [cloudType, setCloudType] = useState<'gcs' | 'drive' | null>(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.CLOUD_TYPE);
        return stored as 'gcs' | 'drive' | null;
    });

    const [gcsAccessToken, setGcsAccessToken] = useState<string | null>(() => {
        return localStorage.getItem(STORAGE_KEYS.GCS_TOKEN);
    });

    const [gcsUserEmail, setGcsUserEmail] = useState<string | null>(() => {
        return localStorage.getItem(STORAGE_KEYS.GCS_EMAIL);
    });

    const [menuLanguage, setMenuLanguageState] = useState<string | null>(() => {
        return localStorage.getItem(STORAGE_KEYS.MENU_LANGUAGE);
    });

    // Output language: null means "auto-detect from video"
    const [outputLanguage, setOutputLanguageState] = useState<string | null>(() => {
        return localStorage.getItem(STORAGE_KEYS.OUTPUT_LANGUAGE);
    });

    // Set cloud connection
    const setCloudConnection = (type: 'gcs' | 'drive', token: string, email: string) => {
        setIsCloudConnected(true);
        setCloudType(type);
        setGcsAccessToken(token);
        setGcsUserEmail(email);

        localStorage.setItem(STORAGE_KEYS.CLOUD_CONNECTED, 'true');
        localStorage.setItem(STORAGE_KEYS.CLOUD_TYPE, type);
        localStorage.setItem(STORAGE_KEYS.GCS_TOKEN, token);
        localStorage.setItem(STORAGE_KEYS.GCS_EMAIL, email);
    };

    // Clear cloud connection
    const clearCloudConnection = () => {
        setIsCloudConnected(false);
        setCloudType(null);
        setGcsAccessToken(null);
        setGcsUserEmail(null);

        localStorage.removeItem(STORAGE_KEYS.CLOUD_CONNECTED);
        localStorage.removeItem(STORAGE_KEYS.CLOUD_TYPE);
        localStorage.removeItem(STORAGE_KEYS.GCS_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.GCS_EMAIL);
    };

    // Set menu language
    const setMenuLanguage = (lang: string) => {
        setMenuLanguageState(lang);
        localStorage.setItem(STORAGE_KEYS.MENU_LANGUAGE, lang);
        changeLanguage(lang);
    };

    // Set output language (null = auto-detect from video)
    const setOutputLanguage = (lang: string | null) => {
        setOutputLanguageState(lang);
        if (lang) {
            localStorage.setItem(STORAGE_KEYS.OUTPUT_LANGUAGE, lang);
        } else {
            localStorage.removeItem(STORAGE_KEYS.OUTPUT_LANGUAGE);
        }
    };

    return (
        <AppContext.Provider
            value={{
                isCloudConnected,
                cloudType,
                gcsAccessToken,
                gcsUserEmail,
                setCloudConnection,
                clearCloudConnection,
                menuLanguage,
                setMenuLanguage,
                outputLanguage,
                setOutputLanguage,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}

export function useApp(): AppContextType {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
}

export default AppContext;
