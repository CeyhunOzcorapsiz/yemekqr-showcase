import { english } from "./catalog.ts";
export type Language = "tr" | "en";
export const LANGUAGE_STORAGE_KEY = "yemekqr.language";
let language: Language = "tr";
try {
  if (
    typeof localStorage !== "undefined" &&
    localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en"
  )
    language = "en";
} catch {
  /* Storage is optional. */
}
const listeners = new Set<() => void>();
const reverse = new Map<string, string>(
  Object.entries(english).map(([tr, en]) => [en, tr]),
);
export function getLanguage(): Language {
  return language;
}
export function getLocale(): string {
  return language === "en" ? "en-GB" : "tr-TR";
}
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function t(
  message: string,
  values: Record<string, string | number> = {},
): string {
  const key = Object.hasOwn(english, message)
    ? message
    : reverse.get(message) || message;
  const result =
    language === "en"
      ? (english as Record<string, string>)[key] || message
      : key;
  return result.replace(/\{(\w+)\}/g, (match, key: string) =>
    values[key] === undefined ? match : String(values[key]),
  );
}
function updateDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.title = t("YemekQR | Kasa ve Sipariş");
  document
    .querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input,select,textarea")
    .forEach((el) => el.setCustomValidity(""));
}
export function setLanguage(next: Language) {
  if (next !== "tr" && next !== "en") return;
  language = next;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    /* In-memory selection remains available. */
  }
  updateDocument();
  listeners.forEach((listener) => listener());
}
updateDocument();
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (
      event.key === LANGUAGE_STORAGE_KEY &&
      (event.newValue === "tr" || event.newValue === "en")
    ) {
      language = event.newValue;
      updateDocument();
      listeners.forEach((listener) => listener());
    }
  });
  document.addEventListener(
    "invalid",
    (event) => {
      const field = event.target;
      if (!(
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      ))
        return;
      const validity = field.validity;
      const message = validity.valueMissing
        ? t("Bu alanı doldurun.")
        : validity.typeMismatch &&
            field instanceof HTMLInputElement &&
            field.type === "email"
          ? t("Geçerli bir e-posta adresi girin.")
          : validity.tooShort && "minLength" in field
            ? t("En az {count} karakter girin.", { count: field.minLength })
            : validity.tooLong && "maxLength" in field
              ? t("En fazla {count} karakter girin.", {
                  count: field.maxLength,
                })
              : t("Geçerli bir değer girin.");
      field.setCustomValidity(message);
    },
    true,
  );
  document.addEventListener(
    "input",
    (event) => {
      const field = event.target;
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      )
        field.setCustomValidity("");
    },
    true,
  );
}
