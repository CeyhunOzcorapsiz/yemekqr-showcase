import { useI18n } from "../i18n/react";
export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className="language-switcher">
      {t("Dil")}
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as "tr" | "en")}
      >
        <option value="tr" lang="tr">
          Türkçe
        </option>
        <option value="en" lang="en">
          English
        </option>
      </select>
    </label>
  );
}
