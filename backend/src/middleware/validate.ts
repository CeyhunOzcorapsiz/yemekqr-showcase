import { NextFunction, Request, Response } from "express";
import { ZodTypeAny, z } from "zod";

// Request body'yi verilen zod şemasıyla doğrular. Geçersizse ilk hatayı
// alan adıyla birlikte 400 olarak döner; geçerliyse req.body'yi parse
// edilmiş (bilinmeyen alanlardan arındırılmış) haliyle değiştirir.
export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue.path.join(".");
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        error: path ? `${path}: ${issue.message}` : issue.message,
      });
    }
    req.body = result.data as z.infer<T>;
    next();
  };
}
