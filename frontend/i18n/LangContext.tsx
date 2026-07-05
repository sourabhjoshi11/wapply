'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import en from './en';
import hi from './hi';
import type { Translation } from './types';

type SupportedLang = 'en' | 'hi';

interface LangContextType {
  lang: SupportedLang;
  t: Translation;
  setLang: (lang: SupportedLang) => void;
  toggleLang: () => void;
}

const translations: Record<SupportedLang, Translation> = { en, hi };

const LangContext = createContext<LangContextType | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<SupportedLang>('en');

  // Load saved preference
  useEffect(() => {
    const saved = localStorage.getItem('weai_lang') as SupportedLang | null;
    if (saved && (saved === 'en' || saved === 'hi')) {
      setLangState(saved);
    }
  }, []);

  const setLang = useCallback((newLang: SupportedLang) => {
    setLangState(newLang);
    localStorage.setItem('weai_lang', newLang);
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'hi' ? 'en' : 'hi');
  }, [lang, setLang]);

  return (
    <LangContext.Provider
      value={{ lang, t: translations[lang], setLang, toggleLang }}
    >
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextType {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error('useLang must be used within LangProvider');
  }
  return ctx;
}
