import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { fail, idempotency, MAX_TOTAL } from "../domain";

const router = Router();
const amount = z.number().int().min(0).max(MAX_TOTAL);
const include = {
  openedBy: { select: { name: true } },
  closedBy: { select: { name: true } },
  payments: { select: { kind: true, method: true, amount: true } },
  movements: { orderBy: { createdAt: "desc" as const } },
};
function summarize(
  shift: Prisma.CashShiftGetPayload<{ include: typeof include }>,
) {
  const sum = (kind: string, method: string) =>
    shift.payments
      .filter((p) => p.kind === kind && p.method === method)
      .reduce((n, p) => n + p.amount, 0);
  const movement = (kind: string) =>
    shift.movements
      .filter((m) => m.kind === kind)
      .reduce((n, m) => n + m.amount, 0);
  const cashIn = sum("payment", "cash"),
    cashRefund = sum("refund", "cash"),
    deposits = movement("in"),
    withdrawals = movement("out");
  return {
    ...shift,
    cashIn,
    cashRefund,
    deposits,
    withdrawals,
    cardIn: sum("payment", "card"),
    cardRefund: sum("refund", "card"),
    currentExpectedCash:
      shift.openingCash + cashIn - cashRefund + deposits - withdrawals,
  };
}
router.use(requireAuth);
router.get("/", async (req, res) => {
  const rows = await prisma.cashShift.findMany({
    where: { restaurantId: req.user!.restaurantId },
    include,
    orderBy: { openedAt: "desc" },
    take: 50,
  });
  res.json(rows.map(summarize));
});
router.post(
  "/",
  validateBody(z.object({ openingCash: amount })),
  async (req, res) => {
    const { restaurantId, userId } = req.user!;
    try {
      const result = await prisma.$transaction(async (tx) => {
        if (
          await tx.cashShift.findFirst({
            where: { restaurantId, closedAt: null },
          })
        )
          fail(409, "SHIFT_OPEN", "Açık vardiya zaten var.");
        const row = await tx.cashShift.create({
          data: {
            restaurantId,
            openedById: userId,
            openingCash: req.body.openingCash,
          },
          include,
        });
        await tx.auditLog.create({
          data: {
            restaurantId,
            userId,
            action: "shift.opened",
            entityId: row.id,
            detail: JSON.stringify({ openingCash: row.openingCash }),
          },
        });
        return row;
      });
      res.status(201).json(summarize(result));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        fail(409, "SHIFT_OPEN", "Açık vardiya zaten var.");
      throw error;
    }
  },
);
const movementSchema = z.object({
  kind: z.enum(["in", "out"]),
  amount: amount.refine((n) => n > 0),
  reason: z.string().trim().min(3).max(500),
});
router.post(
  "/:id/movements",
  validateBody(movementSchema),
  async (req, res) => {
    const key = idempotency.safeParse(req.get("Idempotency-Key"));
    if (!key.success)
      fail(400, "IDEMPOTENCY_REQUIRED", "Geçerli işlem anahtarı gerekli.");
    const data = movementSchema.parse(req.body),
      { restaurantId, userId } = req.user!;
    const result = await prisma.$transaction(async (tx) => {
      const shift = await tx.cashShift.findFirst({
        where: { id: req.params.id, restaurantId },
      });
      if (!shift) fail(404, "NOT_FOUND", "Vardiya bulunamadı.");
      const existing = await tx.cashMovement.findUnique({
        where: {
          shiftId_idempotencyKey: {
            shiftId: shift.id,
            idempotencyKey: key.data,
          },
        },
      });
      if (existing) {
        if (
          existing.kind !== data.kind ||
          existing.amount !== data.amount ||
          existing.reason !== data.reason ||
          existing.userId !== userId
        )
          fail(409, "IDEMPOTENCY_CONFLICT", "İşlem içeriği değişmiş.");
        return existing;
      }
      if (shift.closedAt) fail(409, "SHIFT_CLOSED", "Vardiya kapalı.");
      const row = await tx.cashMovement.create({
        data: { ...data, shiftId: shift.id, userId, idempotencyKey: key.data },
      });
      await tx.auditLog.create({
        data: {
          restaurantId,
          userId,
          action: "shift.movement",
          entityId: shift.id,
          detail: JSON.stringify(data),
        },
      });
      return row;
    });
    res.json(result);
  },
);
router.post(
  "/:id/close",
  validateBody(
    z.object({
      countedCash: amount,
      note: z.string().trim().max(500).optional(),
    }),
  ),
  async (req, res) => {
    const { restaurantId, userId } = req.user!;
    const result = await prisma.$transaction(async (tx) => {
      const shift = await tx.cashShift.findFirst({
        where: { id: req.params.id, restaurantId },
        include,
      });
      if (!shift) fail(404, "NOT_FOUND", "Vardiya bulunamadı.");
      if (shift.closedAt) fail(409, "SHIFT_CLOSED", "Vardiya kapalı.");
      const expectedCash = summarize(shift).currentExpectedCash,
        countedCash = req.body.countedCash;
      const updated = await tx.cashShift.updateMany({
        where: { id: shift.id, closedAt: null },
        data: {
          closedAt: new Date(),
          closedById: userId,
          countedCash,
          expectedCash,
          difference: countedCash - expectedCash,
          note: req.body.note || null,
        },
      });
      if (!updated.count) fail(409, "SHIFT_CLOSED", "Vardiya kapalı.");
      await tx.auditLog.create({
        data: {
          restaurantId,
          userId,
          action: "shift.closed",
          entityId: shift.id,
          detail: JSON.stringify({
            countedCash,
            expectedCash,
            difference: countedCash - expectedCash,
            note: req.body.note || null,
          }),
        },
      });
      return tx.cashShift.findUniqueOrThrow({
        where: { id: shift.id },
        include,
      });
    });
    res.json(summarize(result));
  },
);
export default router;
