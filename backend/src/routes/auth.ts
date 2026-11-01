import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  clearSession,
  comparePassword,
  createSession,
  hashPassword,
} from "../auth";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { prisma } from "../db";
import { email, password, role, text, fail } from "../domain";
const router = Router();
const limiter = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60_000,
    limit: process.env.NODE_ENV === "test" ? 1000 : limit,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Çok fazla deneme. Lütfen sonra tekrar deneyin.",
      code: "RATE_LIMITED",
    },
  });
const loginLimit = limiter(100);
const registerLimit = limiter(10);
const failures = new Map<string, { count: number; until: number }>();
const registerSchema = z.object({
  restaurantName: text,
  adminName: text,
  email,
  password,
});
const staffSchema = z.object({
  name: text,
  email,
  password,
  role: role.default("kasiyer"),
});
const staffUpdate = z.object({
  name: text.optional(),
  role: role.optional(),
  active: z.boolean().optional(),
  password: password.optional(),
});
const publicUser = (u: {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurantId: string;
  active: boolean;
}) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  restaurantId: u.restaurantId,
  active: u.active,
});
router.post(
  "/register-restaurant",
  registerLimit,
  validateBody(registerSchema),
  async (req, res) => {
    const data = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(data.password);
    const result = await prisma.$transaction(async (tx) => {
      if (await tx.user.findFirst({ where: { email: { equals: data.email } } }))
        fail(409, "EMAIL_EXISTS", "Bu e-posta ile zaten bir hesap var.");
      const restaurant = await tx.restaurant.create({
        data: { name: data.restaurantName },
      });
      const user = await tx.user.create({
        data: {
          restaurantId: restaurant.id,
          name: data.adminName,
          email: data.email,
          passwordHash,
          role: "admin",
        },
      });
      return { restaurant, user };
    });
    const token = await createSession(result.user, res);
    res.status(201).json({
      token,
      user: publicUser(result.user),
      restaurant: result.restaurant,
    });
  },
);
router.post(
  "/login",
  loginLimit,
  validateBody(z.object({ email, password: z.string().min(1).max(256) })),
  async (req, res) => {
    const { email: address, password: pwd } = req.body as {
      email: string;
      password: string;
    };
    const failed = failures.get(address);
    if (failed && failed.until > Date.now() && failed.count >= 10)
      fail(
        429,
        "RATE_LIMITED",
        "Bu hesap için çok fazla hatalı giriş denemesi yapıldı.",
      );
    const user = await prisma.user.findFirst({ where: { email: address } });
    if (
      !user ||
      !user.active ||
      !(await comparePassword(pwd, user.passwordHash))
    ) {
      if (failures.size > 10000)
        for (const [key, item] of failures)
          if (item.until < Date.now()) failures.delete(key);
      if (failures.size < 20000)
        failures.set(address, {
          count: failed && failed.until > Date.now() ? failed.count + 1 : 1,
          until:
            failed && failed.until > Date.now()
              ? failed.until
              : Date.now() + 900_000,
        });
      fail(401, "INVALID_CREDENTIALS", "E-posta veya şifre hatalı.");
    }
    failures.delete(address);
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
    });
    const token = await createSession(user, res);
    res.json({ token, user: publicUser(user), restaurant });
  },
);
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.userId },
  });
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: user.restaurantId },
  });
  res.setHeader("Cache-Control", "no-store");
  res.json({ user: publicUser(user), restaurant });
});
router.post("/logout", requireAuth, async (req, res) => {
  await prisma.session.deleteMany({ where: { id: req.user!.sessionId } });
  clearSession(res);
  res.json({ ok: true });
});
router.post(
  "/change-password",
  requireAuth,
  limiter(10),
  validateBody(
    z.object({
      currentPassword: z.string().min(1).max(256),
      newPassword: password,
    }),
  ),
  async (req, res) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };
    const { userId, restaurantId, sessionId } = req.user!;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await comparePassword(currentPassword, user.passwordHash)))
      fail(400, "INCORRECT_PASSWORD", "Mevcut şifre yanlış.");
    if (await comparePassword(newPassword, user.passwordHash))
      fail(
        400,
        "PASSWORD_UNCHANGED",
        "Yeni şifre mevcut şifreden farklı olmalı.",
      );
    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, passwordHash: user.passwordHash, active: true },
        data: { passwordHash },
      });
      if (!updated.count)
        fail(409, "CONFLICT", "Hesap değişti. Tekrar deneyin.");
      await tx.session.deleteMany({
        where: { userId, id: { not: sessionId } },
      });
      await tx.auditLog.create({
        data: {
          restaurantId,
          userId,
          action: "account.password_changed",
          entityId: userId,
          detail: "{}",
        },
      });
    });
    res.json({ ok: true });
  },
);
router.get("/users", requireAuth, requireRole("admin"), async (req, res) => {
  res.json(
    (
      await prisma.user.findMany({
        where: { restaurantId: req.user!.restaurantId },
        orderBy: { name: "asc" },
      })
    ).map(publicUser),
  );
});
router.post(
  "/users",
  requireAuth,
  requireRole("admin"),
  validateBody(staffSchema),
  async (req, res) => {
    const data = staffSchema.parse(req.body);
    const passwordHash = await hashPassword(data.password);
    const user = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          restaurantId: req.user!.restaurantId,
          name: data.name,
          email: data.email,
          role: data.role,
          passwordHash,
        },
      });
      await tx.auditLog.create({
        data: {
          restaurantId: req.user!.restaurantId,
          userId: req.user!.userId,
          action: "staff.created",
          entityId: user.id,
          detail: JSON.stringify({ role: user.role }),
        },
      });
      return user;
    });
    res.status(201).json(publicUser(user));
  },
);
router.put(
  "/users/:id",
  requireAuth,
  requireRole("admin"),
  validateBody(staffUpdate),
  async (req, res) => {
    const data = staffUpdate.parse(req.body);
    const passwordHash = data.password
      ? await hashPassword(data.password)
      : undefined;
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findFirst({
        where: { id: req.params.id, restaurantId: req.user!.restaurantId },
      });
      if (!current) fail(404, "NOT_FOUND", "Personel bulunamadı.");
      if (
        current.role === "admin" &&
        current.active &&
        (data.role === "kasiyer" || data.active === false)
      ) {
        const admins = await tx.user.count({
          where: {
            restaurantId: current.restaurantId,
            role: "admin",
            active: true,
          },
        });
        if (admins <= 1)
          fail(
            409,
            "LAST_ADMIN",
            "Son aktif yönetici kapatılamaz veya kasiyere dönüştürülemez.",
          );
      }
      const user = await tx.user.update({
        where: { id: current.id },
        data: {
          name: data.name,
          role: data.role,
          active: data.active,
          passwordHash,
        },
      });
      if (
        (data.role !== undefined && data.role !== current.role) ||
        (data.active !== undefined && data.active !== current.active) ||
        passwordHash
      )
        await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.create({
        data: {
          restaurantId: req.user!.restaurantId,
          userId: req.user!.userId,
          action: "staff.updated",
          entityId: user.id,
          detail: JSON.stringify({
            name: data.name,
            role: data.role,
            active: data.active,
            passwordChanged: !!passwordHash,
          }),
        },
      });
      return user;
    });
    res.json(publicUser(updated));
  },
);
export default router;
