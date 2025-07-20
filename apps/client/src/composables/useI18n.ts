import { ref, computed, readonly } from 'vue';
import en from '../locales/en';
import ko from '../locales/ko';

type Translations = typeof en;

const translations: { [key: string]: Translations } = { en, ko };
const lang = ref<'en' | 'ko'>('en');

const setLanguage = async () => {
  try {
    const response = await fetch('http://localhost:4000/api/language');
    if (response.ok) {
      const data = await response.json();
      if (data.language === 'ko') {
        lang.value = 'ko';
      } else {
        lang.value = 'en';
      }
    }
  } catch (e) {
    console.error('Failed to fetch language setting', e);
    // Fallback to browser language if API fails
    const browserLang = navigator.language.split('-')[0];
    if (browserLang === 'ko') {
      lang.value = 'ko';
    }
  }
};

export function useI18n() {
  const t = (key: string, params: Record<string, string | number> = {}): string => {
    const keys = key.split('.');
    let current = translations[lang.value] as any;
    for (const k of keys) {
      if (current[k] !== undefined) {
        current = current[k];
      } else {
        // Fallback to English if key not found in current language
        current = translations['en'] as any;
        for (const k_en of keys) {
          if (current[k_en] !== undefined) {
            current = current[k_en];
          } else {
            return key; // Key not found in any language
          }
        }
        break;
      }
    }

    if (typeof current === 'string') {
      return Object.entries(params).reduce((acc, [paramKey, paramValue]) => {
        return acc.replace(`{${paramKey}}`, String(paramValue));
      }, current);
    }
    
    return current;
  };

  return {
    t,
    setLanguage,
    lang: readonly(lang)
  };
}