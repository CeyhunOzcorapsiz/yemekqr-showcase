import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { createApp } from "../src/app";
const app = createApp();
const auth = (token: string) => ({ Authorization: "Bearer " + token });
describe("hesap ve denetim", () => {
  it("şifre değişikliği doğrulama ister, diğer oturumları kapatır ve denetimi restorana ve yöneticiye sınırlar", async () => {
    const email = randomUUID() + "@account.test",
      original = "Strong1234!",
      updated = "Different1234!";
    const reg = await request(app).post("/api/auth/register-restaurant").send({
      restaurantName: "Test",
      adminName: "Admin",
      email,
      password: original,
    });
    expect(reg.status).toBe(201);
    const a = reg.body.token as string;
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: original });
    const b = login.body.token as string;
    expect(
      (
        await request(app)
          .post("/api/auth/change-password")
          .set(auth(a))
          .send({ currentPassword: "Wrong1234!", newPassword: updated })
      ).body.code,
    ).toBe("INCORRECT_PASSWORD");
    expect(
      (
        await request(app)
          .post("/api/auth/change-password")
          .set(auth(a))
          .send({ currentPassword: original, newPassword: original })
      ).body.code,
    ).toBe("PASSWORD_UNCHANGED");
    expect(
      (
        await request(app)
          .post("/api/auth/change-password")
          .set(auth(a))
          .send({ currentPassword: original, newPassword: updated })
      ).status,
    ).toBe(200);
    expect((await request(app).get("/api/auth/me").set(auth(a))).status).toBe(
      200,
    );
    expect((await request(app).get("/api/auth/me").set(auth(b))).status).toBe(
      401,
    );
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email, password: original })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email, password: updated })
      ).status,
    ).toBe(200);
    const list = await request(app)
      .get("/api/audit?action=account.password_changed")
      .set(auth(a));
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0].userName).toBe("Admin");
    expect(JSON.stringify(list.body)).not.toContain(original);
    expect(JSON.stringify(list.body)).not.toContain(updated);
    const other = await request(app)
      .post("/api/auth/register-restaurant")
      .send({
        restaurantName: "Other",
        adminName: "Admin",
        email: randomUUID() + "@account.test",
        password: original,
      });
    expect(
      (await request(app).get("/api/audit").set(auth(other.body.token))).body
        .total,
    ).toBe(0);
    const staffEmail = randomUUID() + "@account.test";
    expect(
      (
        await request(app).post("/api/auth/users").set(auth(a)).send({
          name: "Cashier",
          email: staffEmail,
          password: original,
          role: "kasiyer",
        })
      ).status,
    ).toBe(201);
    const staff = await request(app)
      .post("/api/auth/login")
      .send({ email: staffEmail, password: original });
    expect(
      (await request(app).get("/api/audit").set(auth(staff.body.token))).status,
    ).toBe(403);
  });
});
