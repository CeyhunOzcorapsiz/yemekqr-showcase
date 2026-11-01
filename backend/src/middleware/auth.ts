import { NextFunction, Request, Response } from "express";
import { TokenPayload, verifyToken } from "../auth";
import { prisma } from "../db";
import { config } from "../config";
import { fail } from "../domain";
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      requestId?: string;
    }
  }
}
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;
  const cookie = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("yemekqr_session="))
    ?.slice("yemekqr_session=".length);
  if (!bearer && !cookie)
    fail(401, "UNAUTHORIZED", "Oturum açmanız gerekiyor.");
  let payload: TokenPayload;
  try {
    payload = verifyToken(bearer || cookie!);
  } catch {
    return fail(401, "UNAUTHORIZED", "Oturumunuz sona erdi.");
  }
  const session = await prisma.session.findUnique({
    where: { id: payload.sessionId || "" },
    include: { user: true },
  });
  if (
    !session ||
    session.expiresAt.getTime() <= Date.now() ||
    !session.user.active ||
    session.userId !== payload.userId ||
    session.user.restaurantId !== payload.restaurantId
  )
    fail(401, "UNAUTHORIZED", "Oturumunuz sona erdi.");
  if (!bearer && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const ownOrigin = req.protocol + "://" + req.get("host");
    if (
      (origin && origin !== ownOrigin && !config.origins.includes(origin)) ||
      req.get("sec-fetch-site") === "cross-site"
    )
      fail(403, "ORIGIN_REJECTED", "İstek kaynağına izin verilmiyor.");
  }
  req.user = {
    userId: session.userId,
    restaurantId: session.user.restaurantId,
    role: session.user.role,
    sessionId: session.id,
  };
  next();
}
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role))
      fail(403, "FORBIDDEN", "Bu işlem için yetkiniz yok.");
    next();
  };
}
