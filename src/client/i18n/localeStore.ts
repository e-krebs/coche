import { useEffect, useState } from "react";
import { type Locale, detectLocale, isLocale } from ".";

const KEY = "shopping:locale";
const EVENT = "shopping:localechange";

export const getStoredLocale = (): Locale | null => {
  try {
    const v = localStorage.getItem(KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
};

/**
 * Mirror the locale to localStorage so it's readable synchronously above StoreProvider, where
 * ClerkProvider lives and the synced TinyBase value can't reach.
 */
export const storeLocale = (locale: Locale): void => {
  try {
    localStorage.setItem(KEY, locale);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
};

export const effectiveLocale = (): Locale => getStoredLocale() ?? detectLocale();

export const usePersistedLocale = (): Locale => {
  const [locale, setLocale] = useState<Locale>(effectiveLocale);
  useEffect(() => {
    const onChange = () => {
      setLocale(effectiveLocale());
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange); // cross-tab
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return locale;
};
