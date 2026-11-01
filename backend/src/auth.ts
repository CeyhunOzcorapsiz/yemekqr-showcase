import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { config } from "./config";
import { prisma } from "./db";
import type { Response } from "express";
export interface TokenPayload {
  userId: string;
  restaurantId: string;
  role: string;
  sessionId: string;
}
export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const comparePassword = (password: string, hash: string) =>
  bcrypt.compare(password, hash);
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.secret, {
    algorithms: ["HS256"],
    issuer: "yemekqr",
    audience: "yemekqr",
  }) as TokenPayload;
}
export async function createSession(
  user: { id: string; restaurantId: string; role: string },
  res: Response,
) {
  const sessionId = randomUUID();
  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      expiresAt: new Date(Date.now() + config.sessionMs),
    },
  });
  const token = jwt.sign(
    {
      userId: user.id,
      restaurantId: user.restaurantId,
      role: user.role,
      sessionId,
    },
    config.secret,
    { expiresIn: "8h", issuer: "yemekqr", audience: "yemekqr" },
  );
  res.cookie("yemekqr_session", token, {
    httpOnly: true,
    secure: config.production,
    sameSite: "strict",
    maxAge: config.sessionMs,
    path: "/",
  });
  res.setHeader("Cache-Control", "no-store");
  return token;
}
export function clearSession(res: Response) {
  res.clearCookie("yemekqr_session", {
    httpOnly: true,
    secure: config.production,
    sameSite: "strict",
    path: "/",
  });
}
