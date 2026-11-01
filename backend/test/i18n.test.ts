import { it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { createApp } from "../src/app";
const app = createApp();
it("English names are snapshotted; language changes do not duplicate an order", async () => {
  const account = await request(app)
    .post("/api/auth/register-restaurant")
    .send({
      restaurantName: "Bilingual",
      adminName: "Alex",
      email: randomUUID() + "@i18n.test",
      password: "English123!",
    });
  expect(account.status).toBe(201);
  const token = account.body.token;
  const auth = { Authorization: "Bearer " + token };
  const p = await request(app).post("/api/products").set(auth).send({
    name: "Özel yemek",
    nameEn: "House special",
    category: "Ana",
    categoryEn: "Main",
    price: 1250,
  });
  expect(p.status).toBe(201);
  expect(p.body.categoryEn).toBe("Main");
  const key = randomUUID();
  const data = {
    items: [{ productId: p.body.id, quantity: 1, expectedUnitPrice: 1250 }],
    paymentMethod: "cash",
  };
  const a = await request(app)
    .post("/api/orders")
    .set(auth)
    .set("Idempotency-Key", key)
    .set("Accept-Language", "en")
    .send(data);
  expect(a.status).toBe(201);
  expect(a.body.items[0].productNameEn).toBe("House special");
  const b = await request(app)
    .post("/api/orders")
    .set(auth)
    .set("Idempotency-Key", key)
    .set("Accept-Language", "tr")
    .send(data);
  expect(b.status).toBe(200);
  expect(b.body.id).toBe(a.body.id);
  await request(app)
    .put("/api/products/" + p.body.id)
    .set(auth)
    .send({ nameEn: "Updated name" });
  const receipt = await request(app).get("/api/orders/" + a.body.id);
  expect(receipt.body.items[0].productNameEn).toBe("House special");
  expect(receipt.body.items[0].productName).toBe("Özel yemek");
  const report = await request(app).get("/api/reports/daily").set(auth);
  expect(report.body.topProducts[0].nameEn).toBe("House special");
});
