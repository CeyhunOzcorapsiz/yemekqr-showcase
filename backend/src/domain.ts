import type { Role, PaymentMethod } from "../../shared/contracts";
import { z } from "zod";
export const MAX_TOTAL = 2_000_000_000;
export const text = z.string().trim().min(1).max(120);
export const price = z.number().int().min(0).max(100_000_000);
export const role = z.enum(["admin", "kasiyer"] satisfies [Role, ...Role[]]);
export const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const password = z
  .string()
  .min(8, "Şifre en az 8 karakter olmalı.")
  .refine(
    (s) => Buffer.byteLength(s, "utf8") <= 72,
    "Şifre en fazla 72 bayt olabilir.",
  );
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, code: string, message: string): never {
  throw new HttpError(status, code, message);
}
export function parseDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return fail(400, "INVALID_DATE", "Tarih YYYY-MM-DD biçiminde olmalı.");
  const date = new Date(value + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return fail(400, "INVALID_DATE", "Geçersiz takvim günü.");
  return value;
}
// Current product serves Turkey (+03:00), independent of server timezone.
export function today(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}
export function dayStart(day: string): Date {
  return new Date(parseDate(day) + "T00:00:00+03:00");
}
export function dateRange(from: unknown, to: unknown) {
  const startDay = parseDate(from ?? today());
  const endDay = parseDate(to ?? startDay);
  const start = dayStart(startDay);
  const end = new Date(dayStart(endDay).getTime() + 86400_000);
  if (end <= start || end.getTime() - start.getTime() > 366 * 86400_000)
    fail(400, "INVALID_RANGE", "Tarih aralığı 1–366 gün olmalı.");
  return { startDay, endDay, start, end };
}
export const idempotency = z.string().uuid();

export const paymentMethod = z.enum(["cash", "card", "unpaid"] satisfies [
  PaymentMethod,
  ...PaymentMethod[],
]);
