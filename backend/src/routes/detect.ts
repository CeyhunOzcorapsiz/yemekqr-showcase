import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";
import { config } from "../config";
import { fail } from "../domain";
const router = Router();
router.use(requireAuth);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 },
  fileFilter: (_req, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});
const limit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  keyGenerator: (req) => req.user!.userId,
  message: {
    error: "Bir dakikada çok fazla analiz yapıldı.",
    code: "RATE_LIMITED",
  },
});
const resultSchema = z.object({
  mode: z.enum(["mock", "gemini"]),
  model: z.string().max(120),
  detections: z
    .array(
      z.object({
        id: z.string().uuid(),
        confidence: z.number().finite().min(0).max(1),
      }),
    )
    .max(100),
});
router.post("/", limit, upload.single("image"), async (req, res) => {
  if (!req.file)
    fail(400, "INVALID_IMAGE", "JPEG, PNG veya WebP görüntüsü yükleyin.");
  const products = await prisma.product.findMany({
    where: { active: true, restaurantId: req.user!.restaurantId },
    take: 2000,
  });
  if (!products.length) fail(400, "EMPTY_MENU", "Önce menüye ürün ekleyin.");
  const form = new FormData();
  form.append(
    "image",
    new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype }),
    req.file.originalname,
  );
  form.append(
    "labels",
    JSON.stringify(products.map((p) => ({ id: p.id, name: p.name }))),
  );
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(config.mlUrl + "/detect", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(config.mlTimeoutMs),
      headers: config.mlToken ? { "X-Service-Token": config.mlToken } : {},
    });
  } catch (err) {
    if (
      err instanceof Error &&
      ["TimeoutError", "AbortError"].includes(err.name)
    )
      fail(
        504,
        "ML_TIMEOUT",
        "Analiz zaman aşımına uğradı. Manuel siparişle devam edebilirsiniz.",
      );
    fail(
      502,
      "ML_UNAVAILABLE",
      "Kamera servisine ulaşılamadı. Manuel sipariş kullanabilirsiniz.",
    );
  }
  if (!response.ok)
    fail(
      response.status === 413 ? 413 : response.status === 429 ? 429 : 502,
      "ML_ERROR",
      "Görüntü analiz edilemedi. Başka bir fotoğraf veya manuel sipariş deneyin.",
    );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    fail(502, "ML_INVALID_RESPONSE", "Analiz servisi geçersiz yanıt verdi.");
  }
  const parsed = resultSchema.safeParse(body);
  if (!parsed.success)
    fail(502, "ML_INVALID_RESPONSE", "Analiz servisi geçersiz yanıt verdi.");
  const result = parsed.data;
  if (config.production && result.mode === "mock")
    fail(503, "MOCK_DISABLED", "Gerçek ortamda test analizi kapalı.");
  const lookup = new Map(products.map((p) => [p.id, p]));
  if (
    new Set(result.detections.map((d) => d.id)).size !==
      result.detections.length ||
    result.detections.some((d) => !lookup.has(d.id))
  )
    fail(502, "ML_INVALID_RESPONSE", "Analiz sonucu menüyle eşleşmiyor.");
  const detections = result.detections.map((d) => ({
    productId: d.id,
    name: lookup.get(d.id)!.name,
    nameEn: lookup.get(d.id)!.nameEn,
    price: lookup.get(d.id)!.price,
    confidence: d.confidence,
  }));
  const session = await prisma.detectionSession.create({
    data: {
      restaurantId: req.user!.restaurantId,
      userId: req.user!.userId,
      mode: result.mode,
      model: result.model,
      durationMs: Date.now() - started,
      predictions: JSON.stringify(detections),
    },
  });
  res.json({
    mode: result.mode,
    model: result.model,
    sessionId: session.id,
    detections,
  });
});
export default router;
