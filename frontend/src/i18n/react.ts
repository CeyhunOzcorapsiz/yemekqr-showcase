import { useSyncExternalStore } from "react";
import { getLanguage, getLocale, setLanguage, subscribe, t } from "./core";
export function useI18n() {
  const language = useSyncExternalStore(
    subscribe,
    getLanguage,
    () => "tr" as const,
  );
  return { language, locale: getLocale(), setLanguage, t };
}
