import { randomUUID } from "crypto";
import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

// Yardımcı: yeni restoran kaydı yapıp token döner.
async function registerRestaurant(name: string, email: string) {
  const res = await request(app)
    .post("/api/auth/register-restaurant")
    .send({
      restaurantName: name,
      adminName: `${name} Yöneticisi`,
      email,
      password: "sifre123",
    });
  expect(res.status).toBe(201);
  return res.body.token as string;
}

async function createProduct(token: string, name: string, priceKurus: number) {
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send({ name, category: "Test", price: priceKurus });
  expect(res.status).toBe(201);
  return res.body as { id: string; price: number };
}

describe("YemekQR API", () => {
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    tokenA = await registerRestaurant("Restoran A", "a@test.com");
    tokenB = await registerRestaurant("Restoran B", "b@test.com");
  });

  describe("auth", () => {
    it("kayıtlı kullanıcı doğru şifreyle giriş yapabilir", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "a@test.com", password: "sifre123" });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user.role).toBe("admin");
    });

    it("yanlış şifre 401 döner", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "a@test.com", password: "yanlis" });
      expect(res.status).toBe(401);
    });

    it("personel eklerken 6 karakterden kısa şifre reddedilir", async () => {
      const res = await request(app)
        .post("/api/auth/users")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ name: "Kasiyer", email: "kisa@test.com", password: "123" });
      expect(res.status).toBe(400);
    });

    it("kasiyer rolü personel ekleyemez (403)", async () => {
      const staffRes = await request(app)
        .post("/api/auth/users")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          name: "Kasiyer",
          email: "kasiyer-a@test.com",
          password: "sifre123",
          role: "kasiyer",
        });
      expect(staffRes.status).toBe(201);

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email: "kasiyer-a@test.com", password: "sifre123" });
      const cashierToken = loginRes.body.token as string;

      const res = await request(app)
        .post("/api/auth/users")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({ name: "X", email: "x@test.com", password: "sifre123" });
      expect(res.status).toBe(403);
    });
  });

  describe("ürünler ve tenant izolasyonu", () => {
    it("bir restoran diğerinin ürünlerini listede görmez", async () => {
      await createProduct(tokenA, "A Çorbası", 6000);
      await createProduct(tokenB, "B Kebabı", 20000);

      const resA = await request(app)
        .get("/api/products")
        .set("Authorization", `Bearer ${tokenA}`);
      expect(resA.status).toBe(200);
      const namesA = resA.body.map((p: { name: string }) => p.name);
      expect(namesA).toContain("A Çorbası");
      expect(namesA).not.toContain("B Kebabı");
    });

    it("başka restoranın ürünü güncellenemez (404)", async () => {
      const productB = await createProduct(tokenB, "B Salatası", 5000);
      const res = await request(app)
        .put(`/api/products/${productB.id}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ price: 1 });
      expect(res.status).toBe(404);
    });

    it("price tam sayı (kuruş) değilse 400 döner", async () => {
      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ name: "Hatalı", category: "Test", price: 12.5 });
      expect(res.status).toBe(400);
    });
  });

  describe("siparişler", () => {
    it("toplam tutarı kuruş cinsinden doğru hesaplar", async () => {
      const corba = await createProduct(tokenA, "Sipariş Çorbası", 6050); // 60,50 TL
      const kofte = await createProduct(tokenA, "Sipariş Köftesi", 16025); // 160,25 TL

      const res = await request(app)
        .post("/api/orders")
        .set("Idempotency-Key", randomUUID())
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          items: [
            { productId: corba.id, expectedUnitPrice: 6050, quantity: 3 },
            {
              productId: kofte.id,
              expectedUnitPrice: 16025,
              quantity: 2,
              source: "ai_detected",
            },
          ],
        });
      expect(res.status).toBe(201);
      // 3 x 6050 + 2 x 16025 = 18150 + 32050 = 50200 kuruş (502,00 TL)
      expect(res.body.totalAmount).toBe(50200);
      expect(res.body.qrCodeValue).toContain(`/receipt/${res.body.id}`);
      const sources = res.body.items
        .map((i: { source: string }) => i.source)
        .sort();
      expect(sources).toEqual(["ai_detected", "manual"]);
    });

    it("başka restoranın ürünüyle sipariş oluşturulamaz", async () => {
      const productB = await createProduct(tokenB, "B Tatlısı", 7000);
      const res = await request(app)
        .post("/api/orders")
        .set("Idempotency-Key", randomUUID())
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          items: [
            { productId: productB.id, expectedUnitPrice: 7000, quantity: 1 },
          ],
        });
      expect(res.status).toBe(400);
    });

    it("public fiş endpoint'i iç alanları sızdırmaz", async () => {
      const product = await createProduct(tokenA, "Fiş Ürünü", 1000);
      const orderRes = await request(app)
        .post("/api/orders")
        .set("Idempotency-Key", randomUUID())
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          items: [
            { productId: product.id, expectedUnitPrice: 1000, quantity: 1 },
          ],
        });

      // oturumsuz erişim
      const res = await request(app).get(`/api/orders/${orderRes.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.totalAmount).toBe(1000);
      expect(res.body.restaurantId).toBeUndefined();
      expect(res.body.userId).toBeUndefined();
    });

    it("oturumsuz sipariş oluşturulamaz (401)", async () => {
      const res = await request(app)
        .post("/api/orders")
        .set("Idempotency-Key", randomUUID())
        .send({ items: [{ productId: "x", quantity: 1 }] });
      expect(res.status).toBe(401);
    });
  });
});
