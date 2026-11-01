CREATE TABLE "CashShift" (
 "id" TEXT NOT NULL PRIMARY KEY, "restaurantId" TEXT NOT NULL, "openedById" TEXT NOT NULL, "closedById" TEXT,
 "openingCash" INTEGER NOT NULL, "countedCash" INTEGER, "expectedCash" INTEGER, "difference" INTEGER, "note" TEXT,
 "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" DATETIME,
 FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "CashMovement" (
 "id" TEXT NOT NULL PRIMARY KEY, "shiftId" TEXT NOT NULL, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "amount" INTEGER NOT NULL, "reason" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("shiftId") REFERENCES "CashShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
ALTER TABLE "Payment" ADD COLUMN "shiftId" TEXT REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "CashShift_restaurantId_openedAt_idx" ON "CashShift"("restaurantId", "openedAt");
CREATE UNIQUE INDEX "CashShift_one_open_per_restaurant" ON "CashShift"("restaurantId") WHERE "closedAt" IS NULL;
CREATE UNIQUE INDEX "CashMovement_shiftId_idempotencyKey_key" ON "CashMovement"("shiftId", "idempotencyKey");
CREATE INDEX "CashMovement_shiftId_idx" ON "CashMovement"("shiftId");
