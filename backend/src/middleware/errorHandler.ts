import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { MulterError } from "multer";
import { HttpError } from "../domain";
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) return next(err);
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Sunucuda beklenmeyen bir hata oluştu.";
  if (err instanceof HttpError) {
    status = err.status;
    code = err.code;
    message = err.message;
  } else if (err instanceof MulterError) {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    code = err.code;
    message = "Görüntü dosyası geçersiz veya 8 MB sınırını aşıyor.";
  } else if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    status = 409;
    code = "CONFLICT";
    message = "Bu kayıt zaten mevcut. Sayfayı yenileyip tekrar deneyin.";
  } else if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err.status === 400 || err.status === 413)
  ) {
    status = err.status;
    code = "INVALID_BODY";
    message = "Gönderilen veri geçersiz veya çok büyük.";
  }
  console.error(
    JSON.stringify({
      level: "error",
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status,
      code,
    }),
  );
  res.status(status).json({ error: message, code, requestId: req.requestId });
}
