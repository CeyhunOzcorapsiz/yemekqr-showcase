import { randomBytes } from "crypto";
const production = process.env.NODE_ENV === "production";
const origins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const secret = process.env.JWT_SECRET;
if (production) {
  if (
    !secret ||
    secret.length < 32 ||
    /change|replace|degistir|dev-secret|demo|example|test-secret/i.test(secret)
  )
    throw new Error(
      "Production JWT_SECRET en az 32 karakterlik rastgele bir anahtar olmalı.",
    );
  if (!process.env.DATABASE_URL || !process.env.FRONTEND_URL)
    throw new Error("DATABASE_URL ve FRONTEND_URL zorunlu.");
  if (new URL(process.env.FRONTEND_URL).protocol !== "https:")
    throw new Error("Production FRONTEND_URL HTTPS olmalı.");
  if (process.env.DEMO_MODE === "true")
    throw new Error("Production ortamında demo modu açılamaz.");
}
if (process.env.FRONTEND_URL)
  origins.push(new URL(process.env.FRONTEND_URL).origin);
export const config = {
  production,
  origins: [...new Set(origins)],
  secret: secret || randomBytes(48).toString("hex"),
  frontendUrl: process.env.FRONTEND_URL?.replace(/\/$/, ""),
  mlUrl: process.env.ML_SERVICE_URL || "http://127.0.0.1:8000",
  mlToken: process.env.ML_SERVICE_TOKEN || "",
  mlTimeoutMs: 35000,
  sessionMs: 8 * 60 * 60 * 1000,
};
