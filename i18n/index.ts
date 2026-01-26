/**
 * i18n Configuration
 * Internationalization setup for menu language (UI)
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import de from './locales/de.json';
import en from './locales/en.json';
import fr from './locales/fr.json';

// Get stored menu language or default to German
const storedLanguage = typeof window !== 'undefined' 
  ? localStorage.getItem('menuLanguage') 
  : null;

i18n
  .use(initReactI18next)
  .init({
    resources: {
      de: { translation: de },
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: storedLanguage || 'de', // Default German for TMS
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false, // Disable suspense for SSR compatibility
    },
  });

export default i18n;

/**
 * Change the current menu language
 */
export function changeLanguage(langCode: string): void {
  i18n.changeLanguage(langCode);
  localStorage.setItem('menuLanguage', langCode);
}

/**
 * Get the current menu language code
 */
export function getCurrentLanguage(): string {
  return i18n.language;
}
