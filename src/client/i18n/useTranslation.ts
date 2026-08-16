import { useCallback, useEffect } from "react";
import { useStore, useValue } from "client/store/store";
import { type Locale, type MessageKey, type Vars, isLocale, translate } from ".";
import { getStoredLocale, storeLocale, usePersistedLocale } from "./localeStore";

/**
 * Reads the locale from the localStorage mirror so the app UI and Clerk (above the store) resolve
 * to the same value; useSyncLocale feeds the synced TinyBase value into the mirror.
 */
export const useLocale = usePersistedLocale;

// Stable across renders: dnd-kit memoises its announcement monitor on the object built from `t`, so a
// fresh closure each render would re-subscribe it on every keystroke in the add/search field.
export const useTranslation = (): ((key: MessageKey, vars?: Vars) => string) => {
  const locale = usePersistedLocale();
  return useCallback((key: MessageKey, vars?: Vars) => translate({ locale, key, vars }), [locale]);
};

export const useSetLocale = (): ((locale: Locale) => void) => {
  const store = useStore();
  return (locale) => {
    store?.setValue("locale", locale); // synced, per-user source of truth
    storeLocale(locale); // mirror + notify: updates the UI and Clerk immediately
  };
};

/**
 * Pushes the synced value into the mirror on load and cross-device sync, so a language chosen
 * elsewhere drives this device's UI and Clerk. Must run inside StoreProvider.
 */
export const useSyncLocale = (): void => {
  const stored = useValue("locale");
  useEffect(() => {
    if (isLocale(stored) && stored !== getStoredLocale()) storeLocale(stored);
  }, [stored]);
};
