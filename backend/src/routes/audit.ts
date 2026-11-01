import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { dateRange, fail } from "../domain";
const router = Router();
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = z
    .object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      action: z.string().max(100).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .safeParse(req.query);
  if (!parsed.success) fail(400, "INVALID_QUERY", "Filtreler geçersiz.");
  const { page, action, from, to } = parsed.data;
  const range = from || to ? dateRange(from, to) : undefined;
  const where: Prisma.AuditLogWhereInput = {
    restaurantId: req.user!.restaurantId,
    ...(action ? { action } : {}),
    ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 25,
      take: 25,
    }),
  ]);
  const users = await prisma.user.findMany({
    where: {
      restaurantId: req.user!.restaurantId,
      id: { in: [...new Set(rows.map((row) => row.userId))] },
    },
    select: { id: true, name: true },
  });
  const names = new Map(users.map((u) => [u.id, u.name]));
  res.json({
    total,
    page,
    data: rows.map((row) => {
      let detail: Record<string, unknown> = {};
      try {
        const value: unknown = JSON.parse(row.detail);
        if (value && typeof value === "object" && !Array.isArray(value))
          detail = value as Record<string, unknown>;
      } catch {
        /* legacy data */
      }
      delete detail.key;
      return {
        id: row.id,
        action: row.action,
        entityId: row.entityId,
        createdAt: row.createdAt,
        userName: names.get(row.userId) ?? null,
        detail,
      };
    }),
  });
});
export default router;
