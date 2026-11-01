-- Align relation actions with the Prisma model without dropping records.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "totalAmount" INTEGER NOT NULL,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "detectionSessionId" TEXT,
    "qrCodeValue" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_detectionSessionId_fkey" FOREIGN KEY ("detectionSessionId") REFERENCES "DetectionSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "detectionSessionId", "id", "idempotencyKey", "paymentStatus", "qrCodeValue", "refundedAmount", "requestHash", "restaurantId", "status", "totalAmount", "userId") SELECT "createdAt", "detectionSessionId", "id", "idempotencyKey", "paymentStatus", "qrCodeValue", "refundedAmount", "requestHash", "restaurantId", "status", "totalAmount", "userId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_detectionSessionId_key" ON "Order"("detectionSessionId");
CREATE INDEX "Order_restaurantId_createdAt_idx" ON "Order"("restaurantId", "createdAt");
CREATE UNIQUE INDEX "Order_restaurantId_idempotencyKey_key" ON "Order"("restaurantId", "idempotencyKey");
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amount", "createdAt", "id", "idempotencyKey", "kind", "method", "orderId", "reason", "userId") SELECT "amount", "createdAt", "id", "idempotencyKey", "kind", "method", "orderId", "reason", "userId" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE UNIQUE INDEX "Payment_orderId_idempotencyKey_key" ON "Payment"("orderId", "idempotencyKey");
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("createdAt", "expiresAt", "id", "userId") SELECT "createdAt", "expiresAt", "id", "userId" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

