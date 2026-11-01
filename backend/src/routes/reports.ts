import { Router } from "express";
import { Prisma } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { prisma } from "../db";
import { dateRange, fail } from "../domain";
const router = Router();
router.use(requireAuth, requireRole("admin"));
router.get("/daily", async (req, res) => {
  const range = dateRange(
    req.query.from ?? req.query.date,
    req.query.to ?? req.query.date,
  );
  const userId = req.query.userId;
  const method = req.query.method;
  if (
    (userId !== undefined && typeof userId !== "string") ||
    (method !== undefined && !["cash", "card"].includes(String(method)))
  )
    fail(400, "INVALID_QUERY", "Rapor filtreleri geçersiz.");
  const scope = { restaurantId: req.user!.restaurantId };
  const orderScope: Prisma.OrderWhereInput = {
    ...scope,
    ...(userId ? { userId: String(userId) } : {}),
  };
  const where = {
    ...orderScope,
    createdAt: { gte: range.start, lt: range.end },
  };
  const paymentWhere: Prisma.PaymentWhereInput = {
    order: orderScope,
    createdAt: { gte: range.start, lt: range.end },
    ...(method ? { method: String(method) } : {}),
  };
  const [orderSummary, cancelled, payments, products, byMethod] =
    await prisma.$transaction([
      prisma.order.aggregate({
        where: { ...where, status: { not: "cancelled" } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.order.count({ where: { ...where, status: "cancelled" } }),
      prisma.payment.groupBy({
        by: ["kind"],
        orderBy: { kind: "asc" },
        where: paymentWhere,
        _sum: { amount: true },
      }),
      prisma.orderItem.groupBy({
        by: ["productName", "productNameEn"],
        where: {
          order: { ...where, status: { notIn: ["cancelled", "refunded"] } },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 20,
      }),
      prisma.payment.groupBy({
        by: ["kind", "method"],
        orderBy: { kind: "asc" },
        where: paymentWhere,
        _sum: { amount: true },
      }),
    ]);
  const collected =
    payments.find((p) => p.kind === "payment")?._sum?.amount || 0;
  const refunds = payments.find((p) => p.kind === "refund")?._sum?.amount || 0;
  res.json({
    date: range.startDay,
    from: range.startDay,
    to: range.endDay,
    timezone: "Europe/Istanbul",
    totalOrders: orderSummary._count,
    cancelledOrders: cancelled,
    orderAmount: orderSummary._sum.totalAmount || 0,
    collected,
    refunds,
    totalRevenue: collected - refunds,
    topProducts: products.map((p) => ({
      name: p.productName,
      nameEn: p.productNameEn,
      quantity: p._sum?.quantity || 0,
    })),
    byMethod: byMethod.map((p) => ({
      method: p.method,
      kind: p.kind,
      amount: p._sum?.amount || 0,
    })),
  });
});
router.get("/ai", async (req, res) => {
  const range = dateRange(req.query.from, req.query.to);
  const records = await prisma.detectionSession.findMany({
    where: {
      restaurantId: req.user!.restaurantId,
      createdAt: { gte: range.start, lt: range.end },
    },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });
  let corrected = 0;
  let reviewed = 0;
  let removed = 0;
  let added = 0;
  for (const record of records) {
    if (!record.finalItems) continue;
    reviewed++;
    const before = JSON.parse(record.predictions) as { productId: string }[];
    const after = JSON.parse(record.finalItems) as {
      productId: string;
      quantity: number;
    }[];
    const rejected = before.filter(
      (p) => !after.some((a) => a.productId === p.productId),
    ).length;
    const inserted = after.filter(
      (a) => !before.some((p) => p.productId === a.productId),
    ).length;
    removed += rejected;
    added += inserted;
    if (rejected || inserted || after.some((a) => a.quantity !== 1))
      corrected++;
  }
  const durations = records.map((r) => r.durationMs).sort((a, b) => a - b);
  res.json({
    sampleLimit: 10000,
    analyses: records.length,
    reviewed,
    corrected,
    removed,
    added,
    correctionRate: reviewed ? corrected / reviewed : null,
    medianMs: durations.length
      ? durations[Math.floor(durations.length / 2)]
      : null,
    p95Ms: durations.length
      ? durations[
          Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)
        ]
      : null,
    modes: [...new Set(records.map((r) => r.mode))],
  });
});
export default router;
