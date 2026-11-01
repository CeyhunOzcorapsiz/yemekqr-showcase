import express from "express";
import "express-async-errors";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import auditRouter from "./routes/audit";
import shiftsRouter from "./routes/shifts";
import productsRouter from "./routes/products";
import ordersRouter from "./routes/orders";
import reportsRouter from "./routes/reports";
import detectRouter from "./routes/detect";
import authRouter from "./routes/auth";
import { errorHandler } from "./middleware/errorHandler";
import { config } from "./config";
import { fail, HttpError } from "./domain";
import { prisma } from "./db";
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY)
    app.set(
      "trust proxy",
      process.env.TRUST_PROXY.split(",").map((s) => s.trim()),
    );
  app.use(helmet());
  app.use(
    cors({
      origin: config.origins.length
        ? config.origins
        : config.production
          ? false
          : true,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    }),
  );
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    const start = Date.now();
    res.on("finish", () => {
      if (process.env.NODE_ENV !== "test")
        console.log(
          JSON.stringify({
            level: "info",
            requestId: req.requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Date.now() - start,
          }),
        );
    });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !req.headers.authorization
    ) {
      const origin = req.get("origin");
      if (
        (origin &&
          origin !== req.protocol + "://" + req.get("host") &&
          !config.origins.includes(origin)) ||
        req.get("sec-fetch-site") === "cross-site"
      )
        return next(
          new HttpError(
            403,
            "ORIGIN_REJECTED",
            "İstek kaynağına izin verilmiyor.",
          ),
        );
    }
    next();
  });
  app.use(express.json({ limit: "128kb" }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/ready", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready", manualOrders: true });
  });
  app.get("/api/capabilities", async (_req, res) => {
    let camera = false;
    try {
      const response = await fetch(config.mlUrl + "/health", {
        signal: AbortSignal.timeout(2000),
        headers: config.mlToken ? { "X-Service-Token": config.mlToken } : {},
      });
      const body = (await response.json()) as {
        status?: string;
        mode?: string;
      };
      camera =
        response.ok &&
        body.status === "ok" &&
        (!config.production || body.mode !== "mock");
    } catch {
      /* Manual sales remain available. */
    }
    res.json({
      camera,
      demo: !config.production && process.env.DEMO_MODE === "true",
    });
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api/audit", auditRouter);
  app.use("/api/shifts", shiftsRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/detect", detectRouter);
  app.use("/api/auth", authRouter);
  app.use("/api", () => fail(404, "NOT_FOUND", "API adresi bulunamadı."));
  const dist = path.join(__dirname, "../../frontend/dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  } else
    app.use((_req, _res, next) => {
      try {
        fail(404, "NOT_FOUND", "Adres bulunamadı.");
      } catch (err) {
        next(err);
      }
    });
  app.use(errorHandler);
  return app;
}
