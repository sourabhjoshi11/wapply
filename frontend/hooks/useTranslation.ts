import { useLang } from '@/i18n/LangContext';

export function useTranslation() {
  const { t, lang, setLang, toggleLang } = useLang();
  return { t, lang, setLang, toggleLang };
}
