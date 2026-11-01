import { assertProductionDatabaseSafe } from "../src/production";
import { execFileSync } from "child_process";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { createServer } from "http";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { config } from "../src/config";
import { today, parseDate, dateRange } from "../src/domain";
const app = createApp();
let admin: string, other: string;
async function register(label: string) {
  const res = await request(app)
    .post("/api/auth/register-restaurant")
    .send({
      restaurantName: label,
      adminName: label,
      email: label + "@revision.test",
      password: "Strong1234!",
    });
  expect(res.status).toBe(201);
  return res.body.token as string;
}
async function product(token = admin) {
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", "Bearer " + token)
    .send({ name: "Ürün " + randomUUID(), category: "Test", price: 1250 });
  expect(res.status).toBe(201);
  return res.body as { id: string; name: string; price: number };
}
const post = (token: string, path: string, body: unknown, key = randomUUID()) =>
  request(app)
    .post("/api" + path)
    .set("Authorization", "Bearer " + token)
    .set("Idempotency-Key", key)
    .send(body);
const order = (p: { id: string; price: number }, method = "cash") => ({
  items: [{ productId: p.id, quantity: 2, expectedUnitPrice: p.price }],
  paymentMethod: method,
});
beforeAll(async () => {
  admin = await register("revision-a");
  other = await register("revision-b");
});
describe("Sipariş güvenilirliği", () => {
  it("pasif ürün reddedilir", async () => {
    const p = await product();
    await request(app)
      .put("/api/products/" + p.id)
      .set("Authorization", "Bearer " + admin)
      .send({ active: false });
    const res = await post(admin, "/orders", order(p));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PRODUCT_UNAVAILABLE");
  });
  it("eski fiş ürün adını ve fiyatını korur", async () => {
    const p = await product();
    const result = await post(admin, "/orders", order(p));
    expect(result.status).toBe(201);
    await request(app)
      .put("/api/products/" + p.id)
      .set("Authorization", "Bearer " + admin)
      .send({ name: "Yeni ad", price: 9000 });
    const receipt = await request(app).get("/api/orders/" + result.body.id);
    expect(receipt.body.items[0].productName).toBe(p.name);
    expect(receipt.body.items[0].unitPrice).toBe(1250);
    expect(receipt.body.totalAmount).toBe(2500);
  });
  it("aynı anahtar aynı kaydı döndürür; farklı içerik reddedilir", async () => {
    const p = await product();
    const key = randomUUID();
    const a = await post(admin, "/orders", order(p), key);
    const b = await post(admin, "/orders", order(p), key);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    const c = await post(
      admin,
      "/orders",
      { ...order(p), paymentMethod: "card" },
      key,
    );
    expect(c.status).toBe(409);
    expect(await prisma.order.count({ where: { id: a.body.id } })).toBe(1);
  });
  it("eşzamanlı tekrar tek sipariş oluşturur", async () => {
    const p = await product();
    const key = randomUUID();
    const results = await Promise.all([
      post(admin, "/orders", order(p), key),
      post(admin, "/orders", order(p), key),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(results[0].body.id).toBe(results[1].body.id);
  });
  it("fiyat değişimi ve aşırı miktar reddedilir", async () => {
    const p = await product();
    const body = order(p);
    body.items[0].expectedUnitPrice = 1;
    expect((await post(admin, "/orders", body)).body.code).toBe(
      "PRICE_CHANGED",
    );
    body.items[0].quantity = 1001;
    expect((await post(admin, "/orders", body)).status).toBe(400);
  });
  it("aynı ürünün iki satır gönderilmesi reddedilir", async () => {
    const p = await product();
    const data = order(p);
    data.items.push(data.items[0]);
    expect((await post(admin, "/orders", data)).status).toBe(400);
  });
  it("anahtarsız işlem reddedilir", async () => {
    const p = await product();
    expect(
      (
        await request(app)
          .post("/api/orders")
          .set("Authorization", "Bearer " + admin)
          .send(order(p))
      ).status,
    ).toBe(400);
  });
  it("sipariş listesi restoran kapsamında ve sayfalıdır", async () => {
    const p = await product();
    const created = await post(admin, "/orders", order(p));
    const own = await request(app)
      .get("/api/orders?q=" + created.body.id)
      .set("Authorization", "Bearer " + admin);
    expect(own.body.total).toBe(1);
    const alien = await request(app)
      .get("/api/orders?q=" + created.body.id)
      .set("Authorization", "Bearer " + other);
    expect(alien.body.total).toBe(0);
  });
});
describe("Tahsilat ve iadeler", () => {
  it("bekleyen sipariş tek kez tahsil edilir ve kısmi iade nete yansır", async () => {
    const owner = await register("finance");
    const p = await product(owner);
    const created = await post(owner, "/orders", order(p, "unpaid"));
    expect(created.body.paymentStatus).toBe("unpaid");
    const key = randomUUID();
    const paid = await post(
      owner,
      "/orders/" + created.body.id + "/payment",
      { method: "cash" },
      key,
    );
    expect(paid.body.paymentStatus).toBe("paid");
    expect(
      (
        await post(
          owner,
          "/orders/" + created.body.id + "/payment",
          { method: "cash" },
          key,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await post(
          owner,
          "/orders/" + created.body.id + "/payment",
          { method: "card" },
          key,
        )
      ).status,
    ).toBe(409);
    const refundKey = randomUUID();
    const refunded = await post(
      owner,
      "/orders/" + created.body.id + "/refund",
      { amount: 500, reason: "Eksik ürün" },
      refundKey,
    );
    expect(refunded.body.refundedAmount).toBe(500);
    expect(
      (
        await post(
          owner,
          "/orders/" + created.body.id + "/refund",
          { amount: 500, reason: "Eksik ürün" },
          refundKey,
        )
      ).status,
    ).toBe(200);
    const report = await request(app)
      .get("/api/reports/daily")
      .set("Authorization", "Bearer " + owner);
    expect(report.body.collected).toBe(2500);
    expect(report.body.refunds).toBe(500);
    expect(report.body.totalRevenue).toBe(2000);
    expect(
      (
        await post(owner, "/orders/" + created.body.id + "/refund", {
          amount: 9999,
          reason: "Hatalı iade",
        })
      ).status,
    ).toBe(400);
  });
  it("başka restoranın tahsilat/iptali yapılamaz", async () => {
    const p = await product();
    const created = await post(admin, "/orders", order(p, "unpaid"));
    expect(
      (
        await post(other, "/orders/" + created.body.id + "/payment", {
          method: "cash",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await post(other, "/orders/" + created.body.id + "/cancel", {
          reason: "Yanlış kayıt",
        })
      ).status,
    ).toBe(404);
  });
  it("iptal kalan tahsilatı geri alır ve tekrarı yeni iade yaratmaz", async () => {
    const p = await product();
    const created = await post(admin, "/orders", order(p));
    const key = randomUUID();
    const body = { reason: "Sipariş iptal" };
    const a = await post(
      admin,
      "/orders/" + created.body.id + "/cancel",
      body,
      key,
    );
    expect(a.body.status).toBe("cancelled");
    expect(a.body.refundedAmount).toBe(2500);
    expect(
      (await post(admin, "/orders/" + created.body.id + "/cancel", body, key))
        .status,
    ).toBe(200);
    expect(
      await prisma.payment.count({
        where: { orderId: created.body.id, kind: "refund" },
      }),
    ).toBe(1);
  });
});
describe("Oturum ve yetkiler", () => {
  it("cookie HttpOnly ve çıkış sunucuda tokenı iptal eder", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "revision-a@revision.test", password: "Strong1234!" });
    expect(res.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(res.headers["set-cookie"][0]).toContain("SameSite=Strict");
    expect((await post(res.body.token, "/auth/logout", {})).status).toBe(200);
    expect(
      (
        await request(app)
          .get("/api/auth/me")
          .set("Authorization", "Bearer " + res.body.token)
      ).status,
    ).toBe(401);
  });
  it("son aktif yönetici kapatılamaz", async () => {
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer " + admin);
    const res = await request(app)
      .put("/api/auth/users/" + me.body.user.id)
      .set("Authorization", "Bearer " + admin)
      .send({ active: false });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAST_ADMIN");
  });
  it("personel pasifleştirme mevcut oturumu kapatır", async () => {
    const address = "staff-" + randomUUID() + "@test.com";
    const created = await post(admin, "/auth/users", {
      name: "Kasiyer",
      email: address,
      password: "Strong1234!",
      role: "kasiyer",
    });
    expect(created.status).toBe(201);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: address, password: "Strong1234!" });
    expect(login.status).toBe(200);
    expect(
      (
        await request(app)
          .get("/api/reports/daily")
          .set("Authorization", "Bearer " + login.body.token)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .put("/api/auth/users/" + created.body.id)
          .set("Authorization", "Bearer " + admin)
          .send({ active: false })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get("/api/products")
          .set("Authorization", "Bearer " + login.body.token)
      ).status,
    ).toBe(401);
  });
  it("e-posta normalize edilir, tekrar kayıt restoran bırakmaz", async () => {
    const address = "case-" + randomUUID() + "@test.com";
    const body = {
      restaurantName: "Case",
      adminName: "Admin",
      email: address.toUpperCase(),
      password: "Strong1234!",
    };
    expect(
      (await request(app).post("/api/auth/register-restaurant").send(body))
        .status,
    ).toBe(201);
    const before = await prisma.restaurant.count();
    expect(
      (
        await request(app)
          .post("/api/auth/register-restaurant")
          .send({ ...body, email: address })
      ).status,
    ).toBe(409);
    expect(await prisma.restaurant.count()).toBe(before);
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email: address.toUpperCase(), password: "Strong1234!" })
      ).status,
    ).toBe(200);
  });
  it("boş ad, 72 baytı aşan parola ve çapraz kaynak reddedilir", async () => {
    expect(
      (await post(admin, "/products", { name: "  ", category: "A", price: 1 }))
        .status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/auth/register-restaurant")
          .send({
            restaurantName: "Test",
            adminName: "Admin",
            email: "long@test.com",
            password: "ş".repeat(40),
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Origin", "https://foreign.example")
          .send({ email: "a@a.com", password: "x" })
      ).status,
    ).toBe(403);
  });
});
describe("Tarih ve API sözleşmesi", () => {
  it("Türkiye günü sunucu saatinden bağımsızdır", () => {
    expect(today(new Date("2026-11-01T01:30:00+03:00"))).toBe("2026-11-01");
    expect(dateRange("2026-11-01", "2026-11-01").start.toISOString()).toBe(
      "2026-10-31T21:00:00.000Z",
    );
    expect(() => parseDate("2026-02-30")).toThrow();
  });
  it("gece sınırı doğru; geçersiz rapor tarihi 400", async () => {
    const owner = await register("date-boundary");
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer " + owner);
    for (const [id, date] of [
      [randomUUID(), "2026-10-31T21:00:00.000Z"],
      [randomUUID(), "2026-11-01T21:00:00.000Z"],
    ])
      await prisma.order.create({
        data: {
          id,
          restaurantId: me.body.restaurant.id,
          totalAmount: 100,
          qrCodeValue: "test",
          createdAt: new Date(date),
        },
      });
    const report = await request(app)
      .get("/api/reports/daily?date=2026-11-01")
      .set("Authorization", "Bearer " + owner);
    expect(report.body.totalOrders).toBe(1);
    for (const query of [
      "date=abc",
      "date=2026-02-30",
      "date[]=2026-11-01",
      "date=2026-11-01&date=2026-11-02",
    ])
      expect(
        (
          await request(app)
            .get("/api/reports/daily?" + query)
            .set("Authorization", "Bearer " + owner)
        ).status,
      ).toBe(400);
  });
  it("API 404 ve bozuk JSON doğru durumları döndürür", async () => {
    const missing = await request(app).get("/api/not-found");
    expect(missing.status).toBe(404);
    expect(missing.headers["content-type"]).toContain("application/json");
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Content-Type", "application/json")
          .send("{bad")
      ).status,
    ).toBe(400);
    expect((await request(app).get("/api/ready")).status).toBe(200);
  });
});
describe("ML servis sınırı", () => {
  let server: ReturnType<typeof createServer>;
  const original = config.mlUrl;
  let response: unknown;
  beforeAll(async () => {
    server = createServer((req, res) => {
      req.resume();
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(response));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("port");
    config.mlUrl = "http://127.0.0.1:" + address.port;
  });
  afterAll(async () => {
    config.mlUrl = original;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const detect = () =>
    request(app)
      .post("/api/detect")
      .set("Authorization", "Bearer " + admin)
      .attach("image", Buffer.from("test"), {
        filename: "test.jpg",
        contentType: "image/jpeg",
      });
  it("bozuk yanıt ve menü dışı ürün kontrollü reddedilir", async () => {
    response = { wrong: true };
    expect((await detect()).status).toBe(502);
    response = {
      mode: "gemini",
      model: "test",
      detections: [{ id: randomUUID(), confidence: 0.8 }],
    };
    expect((await detect()).status).toBe(502);
  });
  it("analiz ve son karar ilişkilendirilir", async () => {
    const p = await product();
    response = {
      mode: "gemini",
      model: "test",
      detections: [{ id: p.id, confidence: 0.8 }],
    };
    const detected = await detect();
    expect(detected.status).toBe(200);
    const created = await post(admin, "/orders", {
      ...order(p),
      detectionSessionId: detected.body.sessionId,
    });
    expect(created.status).toBe(201);
    const stored = await prisma.detectionSession.findUniqueOrThrow({
      where: { id: detected.body.sessionId },
    });
    expect(stored.finalItems).toContain(p.id);
    expect(stored.predictions).toContain(p.id);
  });
});

describe("Üretim yapılandırması ve sınırlar", () => {
  it("örnek veya eksik secret üretimde reddedilir", () => {
    for (const secret of [
      "",
      "replace-with-a-random-secret-of-at-least-32-characters",
      "short",
    ]) {
      expect(() =>
        execFileSync(process.execPath, ["-e", 'require("./src/config.ts")'], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: "production",
            JWT_SECRET: secret,
            DATABASE_URL: "file:./test.db",
            FRONTEND_URL: "https://kasa.example.com",
          },
          stdio: "pipe",
        }),
      ).toThrow();
    }
  });
  it("toplam taşması kayıt öncesi reddedilir", async () => {
    const created = await post(admin, "/products", {
      name: "Yüksek tutar",
      category: "Test",
      price: 100000000,
    });
    const result = await post(admin, "/orders", {
      items: [
        {
          productId: created.body.id,
          quantity: 1000,
          expectedUnitPrice: 100000000,
        },
      ],
    });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("TOTAL_TOO_LARGE");
  });
  it("8 MB üstü yükleme 413 döndürür", async () => {
    const res = await request(app)
      .post("/api/detect")
      .set("Authorization", "Bearer " + admin)
      .attach("image", Buffer.alloc(8 * 1024 * 1024 + 1), {
        filename: "large.jpg",
        contentType: "image/jpeg",
      });
    expect(res.status).toBe(413);
  });
});

it("demo veritabanı production başlangıcında reddedilir", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  await prisma.restaurant.create({ data: { id, name: "Demo" } });
  try {
    await expect(assertProductionDatabaseSafe()).rejects.toThrow(
      "Demo restoranı",
    );
  } finally {
    await prisma.restaurant.delete({ where: { id } });
  }
});
