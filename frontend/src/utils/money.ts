import { getLocale } from "../i18n/core.ts";
export function formatTL(kurus: number): string {
  return new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency: "TRY",
    currencyDisplay: "narrowSymbol",
  }).format(kurus / 100);
}
export function parseTLToKurus(input: string, maxKurus = 100_000_000): number {
  const value = input.trim();
  if (!/^\d{1,8}(?:[.,]\d{1,2})?$/.test(value)) return NaN;
  const [whole, decimals = ""] = value.replace(",", ".").split(".");
  const result = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result <= maxKurus ? result : NaN;
}
export function turkeyToday() {
  return new Date(Date.now() + 10800000).toISOString().slice(0, 10);
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Istanbul",
  }).format(new Date(value));
}

export function formatDecimal(value: number) {
  return new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}
