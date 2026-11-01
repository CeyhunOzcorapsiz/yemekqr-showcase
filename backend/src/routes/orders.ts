import { createHash, randomUUID } from "crypto";
import { Router } from "express";
import QRCode from "qrcode";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { prisma } from "../db";
import { config } from "../config";
import {
  paymentMethod,
  MAX_TOTAL,
  price,
  idempotency,
  fail,
  dateRange,
} from "../domain";
const router = Router();
const itemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1000),
  expectedUnitPrice: price,
  source: z.enum(["manual", "ai_detected"]).default("manual"),
});
const createSchema = z.object({
  items: z
    .array(itemSchema)
    .min(1)
    .max(100)
    .refine(
      (items) => new Set(items.map((i) => i.productId)).size === items.length,
      "Aynı ürün tek satırda gönderilmeli.",
    ),
  paymentMethod: paymentMethod.default("unpaid"),
  detectionSessionId: z.string().uuid().optional(),
});
const receiptSelect = {
  id: true,
  status: true,
  paymentStatus: true,
  totalAmount: true,
  refundedAmount: true,
  qrCodeValue: true,
  createdAt: true,
  restaurant: { select: { name: true } },
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      productNameEn: true,
      quantity: true,
      unitPrice: true,
      source: true,
    },
  },
} satisfies Prisma.OrderSelect;
const keyFrom = (value: unknown) => {
  const result = idempotency.safeParse(value);
  if (!result.success)
    fail(400, "IDEMPOTENCY_REQUIRED", "Geçerli bir Idempotency-Key gerekli.");
  return result.data;
};
router.post("/", requireAuth, validateBody(createSchema), async (req, res) => {
  const data = createSchema.parse(req.body);
  const key = keyFrom(req.get("Idempotency-Key"));
  const { restaurantId, userId } = req.user!;
  const canonical = {
    ...data,
    items: [...data.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    ),
    userId,
  };
  const requestHash = createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
  const existingOrder = async () =>
    prisma.order.findUnique({
      where: {
        restaurantId_idempotencyKey: { restaurantId, idempotencyKey: key },
      },
    });
  const replay = await existingOrder();
  if (replay) {
    if (replay.requestHash !== requestHash)
      fail(
        409,
        "IDEMPOTENCY_CONFLICT",
        "Bu işlem anahtarı farklı bir sepet için kullanılmış.",
      );
    return res.json(
      await prisma.order.findUniqueOrThrow({
        where: { id: replay.id },
        select: receiptSelect,
      }),
    );
  }
  try {
    const order = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: {
          id: { in: data.items.map((i) => i.productId) },
          restaurantId,
          active: true,
        },
      });
      if (products.length !== data.items.length)
        fail(
          400,
          "PRODUCT_UNAVAILABLE",
          "Sepetteki bir ürün artık satışta değil. Menüyü yenileyin.",
        );
      const lookup = new Map(products.map((p) => [p.id, p]));
      let totalAmount = 0;
      const items = data.items.map((item) => {
        const product = lookup.get(item.productId)!;
        if (item.expectedUnitPrice !== product.price)
          fail(
            409,
            "PRICE_CHANGED",
            product.name +
              " fiyatı değişti. Menüyü yenileyerek yeni tutarı onaylayın.",
          );
        totalAmount += product.price * item.quantity;
        return {
          productId: product.id,
          productName: product.name,
          productNameEn: product.nameEn,
          quantity: item.quantity,
          unitPrice: product.price,
          source: item.source,
        };
      });
      if (!Number.isSafeInteger(totalAmount) || totalAmount > MAX_TOTAL)
        fail(
          400,
          "TOTAL_TOO_LARGE",
          "Sipariş toplamı izin verilen sınırı aşıyor.",
        );
      if (data.detectionSessionId) {
        const detection = await tx.detectionSession.findFirst({
          where: { id: data.detectionSessionId, restaurantId, userId },
          include: { order: { select: { id: true } } },
        });
        if (!detection || detection.order)
          fail(
            409,
            "DETECTION_UNAVAILABLE",
            "Analiz kaydı bulunamadı veya zaten bir siparişte kullanıldı.",
          );
        if (config.production && detection.mode === "mock")
          fail(
            400,
            "MOCK_DISABLED",
            "Test analizi gerçek satışta kullanılamaz.",
          );
        await tx.detectionSession.update({
          where: { id: detection.id },
          data: { finalItems: JSON.stringify(items) },
        });
      }
      const id = randomUUID();
      const frontendUrl =
        config.frontendUrl || req.protocol + "://" + req.get("host");
      const paid = data.paymentMethod !== "unpaid";
      const shift = paid
        ? await tx.cashShift.findFirst({
            where: { restaurantId, closedAt: null },
            select: { id: true },
          })
        : null;
      const created = await tx.order.create({
        data: {
          id,
          restaurantId,
          userId,
          idempotencyKey: key,
          requestHash,
          totalAmount,
          status: paid ? "completed" : "pending",
          paymentStatus: paid ? "paid" : "unpaid",
          qrCodeValue: frontendUrl + "/receipt/" + id,
          items: { create: items },
          detectionSessionId: data.detectionSessionId,
          ...(paid
            ? {
                payments: {
                  create: {
                    kind: "payment",
                    shiftId: shift?.id,
                    method: data.paymentMethod,
                    amount: totalAmount,
                    userId,
                  },
                },
              }
            : {}),
        },
        select: receiptSelect,
      });
      await tx.auditLog.create({
        data: {
          restaurantId,
          userId,
          action: "order.created",
          entityId: id,
          detail: JSON.stringify({
            totalAmount,
            paymentMethod: data.paymentMethod,
          }),
        },
      });
      return created;
    });
    return res.status(201).json(order);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await existingOrder();
      if (existing?.requestHash === requestHash)
        return res.json(
          await prisma.order.findUniqueOrThrow({
            where: { id: existing.id },
            select: receiptSelect,
          }),
        );
      fail(
        409,
        "IDEMPOTENCY_CONFLICT",
        "İşlem zaten kaydedilmiş veya analiz başka siparişte kullanılmış.",
      );
    }
    throw err;
  }
});
router.get("/", requireAuth, async (req, res) => {
  const query = z
    .object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
      q: z.string().max(120).optional(),
      status: z
        .enum(["pending", "completed", "cancelled", "refunded"])
        .optional(),
    })
    .safeParse(req.query);
  if (!query.success) fail(400, "INVALID_QUERY", "Liste filtreleri geçersiz.");
  const { page, pageSize, q, status } = query.data;
  const range =
    req.query.from || req.query.to
      ? dateRange(req.query.from, req.query.to)
      : undefined;
  const where: Prisma.OrderWhereInput = {
    restaurantId: req.user!.restaurantId,
    ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
    ...(status ? { status } : {}),
    ...(q ? { id: { contains: q } } : {}),
  };
  const [total, data] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        ...receiptSelect,
        user: { select: { name: true } },
        payments: { select: { method: true, kind: true, amount: true } },
      },
    }),
  ]);
  res.json({ data, total, page, pageSize });
});
const actionSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  amount: z.number().int().min(1).max(MAX_TOTAL).optional(),
});
router.post(
  "/:id/payment",
  requireAuth,
  validateBody(z.object({ method: z.enum(["cash", "card"]) })),
  async (req, res) => {
    const key = keyFrom(req.get("Idempotency-Key"));
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: req.params.id, restaurantId: req.user!.restaurantId },
      });
      if (!order) fail(404, "NOT_FOUND", "Sipariş bulunamadı.");
      const existing = await tx.payment.findUnique({
        where: {
          orderId_idempotencyKey: { orderId: order.id, idempotencyKey: key },
        },
      });
      if (existing) {
        if (existing.kind !== "payment" || existing.method !== req.body.method)
          fail(409, "IDEMPOTENCY_CONFLICT", "İşlem içeriği değişmiş.");
        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          select: receiptSelect,
        });
      }
      if (order.status !== "pending" || order.paymentStatus !== "unpaid")
        fail(409, "INVALID_STATUS", "Bu sipariş tahsilat beklemiyor.");
      const shift = await tx.cashShift.findFirst({
        where: { restaurantId: req.user!.restaurantId, closedAt: null },
        select: { id: true },
      });
      await tx.payment.create({
        data: {
          shiftId: shift?.id,
          orderId: order.id,
          userId: req.user!.userId,
          kind: "payment",
          method: req.body.method,
          amount: order.totalAmount,
          idempotencyKey: key,
        },
      });
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: "completed", paymentStatus: "paid" },
        select: receiptSelect,
      });
      await tx.auditLog.create({
        data: {
          restaurantId: req.user!.restaurantId,
          userId: req.user!.userId,
          action: "order.paid",
          entityId: order.id,
          detail: JSON.stringify({ method: req.body.method }),
        },
      });
      return updated;
    });
    res.json(result);
  },
);
router.post(
  "/:id/:action(cancel|refund)",
  requireAuth,
  requireRole("admin"),
  validateBody(actionSchema),
  async (req, res) => {
    const key = keyFrom(req.get("Idempotency-Key"));
    const input = actionSchema.parse(req.body);
    const action = req.params.action;
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: req.params.id, restaurantId: req.user!.restaurantId },
        include: { payments: { where: { kind: "payment" } } },
      });
      if (!order) fail(404, "NOT_FOUND", "Sipariş bulunamadı.");
      const previousAudit = await tx.auditLog.findFirst({
        where: {
          restaurantId: req.user!.restaurantId,
          entityId: order.id,
          action: "order." + action,
          detail: JSON.stringify({
            key,
            reason: input.reason,
            amount: input.amount ?? null,
          }),
        },
      });
      if (previousAudit)
        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          select: receiptSelect,
        });
      if (
        await tx.payment.findUnique({
          where: {
            orderId_idempotencyKey: { orderId: order.id, idempotencyKey: key },
          },
        })
      )
        fail(
          409,
          "IDEMPOTENCY_CONFLICT",
          "İşlem anahtarı daha önce kullanılmış.",
        );
      if (["cancelled", "refunded"].includes(order.status))
        fail(409, "INVALID_STATUS", "Bu sipariş zaten kapatılmış.");
      const paid = order.payments.reduce((sum, p) => sum + p.amount, 0);
      const remaining = paid - order.refundedAmount;
      const amount =
        action === "cancel" ? remaining : (input.amount ?? remaining);
      if (action === "refund" && (amount <= 0 || amount > remaining))
        fail(400, "INVALID_REFUND", "İade tutarı kalan tahsilatı aşamaz.");
      const shift =
        amount > 0
          ? await tx.cashShift.findFirst({
              where: { restaurantId: req.user!.restaurantId, closedAt: null },
              select: { id: true },
            })
          : null;
      if (amount > 0)
        await tx.payment.create({
          data: {
            orderId: order.id,
            userId: req.user!.userId,
            kind: "refund",
            shiftId: shift?.id,
            method: order.payments[0]?.method || "cash",
            amount,
            reason: input.reason,
            idempotencyKey: key,
          },
        });
      const refundedAmount = order.refundedAmount + amount;
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          refundedAmount,
          status:
            action === "cancel"
              ? "cancelled"
              : refundedAmount === paid
                ? "refunded"
                : order.status,
          paymentStatus:
            refundedAmount > 0
              ? refundedAmount === paid
                ? "refunded"
                : "partial_refund"
              : order.paymentStatus,
        },
        select: receiptSelect,
      });
      await tx.auditLog.create({
        data: {
          restaurantId: req.user!.restaurantId,
          userId: req.user!.userId,
          action: "order." + action,
          entityId: order.id,
          detail: JSON.stringify({
            key,
            reason: input.reason,
            amount: input.amount ?? null,
          }),
        },
      });
      return updated;
    });
    res.json(result);
  },
);
router.get("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: receiptSelect,
  });
  if (!order) fail(404, "NOT_FOUND", "Sipariş bulunamadı.");
  res.setHeader("Cache-Control", "no-store");
  res.json(order);
});
router.get("/:id/qr", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { qrCodeValue: true },
  });
  if (!order) fail(404, "NOT_FOUND", "Sipariş bulunamadı.");
  res.json({
    qrCodeValue: order.qrCodeValue,
    qrCodeImage: await QRCode.toDataURL(order.qrCodeValue),
  });
});
export default router;
