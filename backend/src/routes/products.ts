import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { prisma } from "../db";
import { text, price, fail } from "../domain";
const router = Router();
router.use(requireAuth);
const translatedText = z
  .string()
  .trim()
  .max(120)
  .transform((value) => value || null)
  .nullable()
  .optional();
const createSchema = z.object({
  nameEn: translatedText,
  categoryEn: translatedText,
  name: text,
  category: text,
  price,
});
const updateSchema = createSchema
  .partial()
  .extend({ active: z.boolean().optional() });
router.get("/", async (req, res) => {
  const all = req.query.active === "all";
  if (all && req.user!.role !== "admin")
    fail(403, "FORBIDDEN", "Tüm ürünleri yalnızca yönetici görebilir.");
  res.json(
    await prisma.product.findMany({
      where: {
        restaurantId: req.user!.restaurantId,
        ...(all ? {} : { active: true }),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 2000,
    }),
  );
});
router.post(
  "/",
  requireRole("admin"),
  validateBody(createSchema),
  async (req, res) => {
    const product = await prisma.$transaction(async (tx) => {
      if (
        (await tx.product.count({
          where: { restaurantId: req.user!.restaurantId },
        })) >= 2000
      )
        fail(
          409,
          "MENU_LIMIT",
          "Bir restoranda en fazla 2000 ürün tanımlanabilir.",
        );
      const product = await tx.product.create({
        data: {
          ...createSchema.parse(req.body),
          restaurantId: req.user!.restaurantId,
        },
      });
      await tx.auditLog.create({
        data: {
          restaurantId: req.user!.restaurantId,
          userId: req.user!.userId,
          action: "product.created",
          entityId: product.id,
          detail: JSON.stringify({ name: product.name, price: product.price }),
        },
      });
      return product;
    });
    res.status(201).json(product);
  },
);
router.put(
  "/:id",
  requireRole("admin"),
  validateBody(updateSchema),
  async (req, res) => {
    const product = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findFirst({
        where: { id: req.params.id, restaurantId: req.user!.restaurantId },
      });
      if (!current) fail(404, "NOT_FOUND", "Ürün bulunamadı.");
      const product = await tx.product.update({
        where: { id: current.id },
        data: updateSchema.parse(req.body),
      });
      await tx.auditLog.create({
        data: {
          restaurantId: req.user!.restaurantId,
          userId: req.user!.userId,
          action: "product.updated",
          entityId: product.id,
          detail: JSON.stringify({
            before: {
              name: current.name,
              price: current.price,
              active: current.active,
            },
            after: {
              name: product.name,
              price: product.price,
              active: product.active,
            },
          }),
        },
      });
      return product;
    });
    res.json(product);
  },
);
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const product = await prisma.$transaction(async (tx) => {
    const current = await tx.product.findFirst({
      where: { id: req.params.id, restaurantId: req.user!.restaurantId },
    });
    if (!current) fail(404, "NOT_FOUND", "Ürün bulunamadı.");
    const result = await tx.product.update({
      where: { id: current.id },
      data: { active: false },
    });
    await tx.auditLog.create({
      data: {
        restaurantId: req.user!.restaurantId,
        userId: req.user!.userId,
        action: "product.hidden",
        entityId: current.id,
        detail: "{}",
      },
    });
    return result;
  });
  res.json(product);
});
export default router;
