import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
const app = createApp();
const auth = (token: string) => ({ Authorization: "Bearer " + token });
const post = (token: string, url: string, body: unknown, key = randomUUID()) =>
  request(app)
    .post("/api" + url)
    .set(auth(token))
    .set("Idempotency-Key", key)
    .send(body);
describe("kasa vardiyası", () => {
  it("tahsilat, iade ve hareketleri vardiyaya bağlar, kapanışı sabitler ve restoranları ayırır", async () => {
    async function register() {
      const id = randomUUID();
      const r = await request(app)
        .post("/api/auth/register-restaurant")
        .send({
          restaurantName: id,
          adminName: "Admin",
          email: id + "@shift.test",
          password: "Strong1234!",
        });
      expect(r.status).toBe(201);
      return r.body.token as string;
    }
    const a = await register(),
      b = await register();
    const p = await post(a, "/products", {
      name: "Test",
      category: "Test",
      price: 1000,
    });
    const body = {
      items: [{ productId: p.body.id, quantity: 1, expectedUnitPrice: 1000 }],
      paymentMethod: "cash",
    };
    expect((await post(a, "/orders", body)).status).toBe(201);
    const opened = await post(a, "/shifts", { openingCash: 5000 });
    expect(opened.status).toBe(201);
    expect((await post(a, "/shifts", { openingCash: 0 })).status).toBe(409);
    const order = await post(a, "/orders", body);
    expect(order.status).toBe(201);
    expect(
      (
        await post(a, "/orders/" + order.body.id + "/refund", {
          reason: "Test refund",
          amount: 200,
        })
      ).status,
    ).toBe(200);
    const key = randomUUID(),
      move = { kind: "out", amount: 300, reason: "Bankaya yatırma" };
    expect(
      (await post(a, "/shifts/" + opened.body.id + "/movements", move, key))
        .status,
    ).toBe(200);
    expect(
      (await post(a, "/shifts/" + opened.body.id + "/movements", move, key))
        .status,
    ).toBe(200);
    expect(
      (
        await post(
          a,
          "/shifts/" + opened.body.id + "/movements",
          { ...move, amount: 400 },
          key,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await post(b, "/shifts/" + opened.body.id + "/close", {
          countedCash: 0,
        })
      ).status,
    ).toBe(404);
    const closed = await post(a, "/shifts/" + opened.body.id + "/close", {
      countedCash: 5400,
      note: "Sayım",
    });
    expect(closed.status).toBe(200);
    expect(closed.body.expectedCash).toBe(5500);
    expect(closed.body.difference).toBe(-100);
    expect(closed.body.movements).toHaveLength(1);
    expect(
      (await post(a, "/shifts/" + opened.body.id + "/movements", move)).status,
    ).toBe(409);
    expect(
      (
        await post(a, "/shifts/" + opened.body.id + "/close", {
          countedCash: 0,
        })
      ).status,
    ).toBe(409);
    expect((await post(a, "/orders", body)).status).toBe(201);
    const history = await request(app).get("/api/shifts").set(auth(a));
    expect(history.body[0].currentExpectedCash).toBe(5500);
    expect(
      (await request(app).get("/api/shifts").set(auth(b))).body,
    ).toHaveLength(0);
    expect(
      await prisma.cashMovement.count({ where: { shiftId: opened.body.id } }),
    ).toBe(1);
  });
});
