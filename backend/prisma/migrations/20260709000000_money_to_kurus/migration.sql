-- Para alanları REAL (TL) -> INTEGER (kuruş) dönüşümü.
-- Mevcut TL değerleri x100 çevrilerek korunur (ör. 60.0 TL -> 6000 kuruş).
-- SQLite kolon tipi değiştirmeyi desteklemediği için tablolar yeniden kurulur.

PRAGMA foreign_keys=OFF;

-- Product.price: REAL -> INTEGER (kuruş)
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("id", "restaurantId", "name", "category", "price", "active", "createdAt")
SELECT "id", "restaurantId", "name", "category", CAST(ROUND("price" * 100) AS INTEGER), "active", "createdAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";

-- Order.totalAmount: REAL -> INTEGER (kuruş)
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "totalAmount" INTEGER NOT NULL,
    "qrCodeValue" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("id", "restaurantId", "userId", "status", "totalAmount", "qrCodeValue", "createdAt")
SELECT "id", "restaurantId", "userId", "status", CAST(ROUND("totalAmount" * 100) AS INTEGER), "qrCodeValue", "createdAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";

-- OrderItem.unitPrice: REAL -> INTEGER (kuruş)
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("id", "orderId", "productId", "quantity", "unitPrice", "source")
SELECT "id", "orderId", "productId", "quantity", CAST(ROUND("unitPrice" * 100) AS INTEGER), "source" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
