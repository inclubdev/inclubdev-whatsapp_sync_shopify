/*
  Warnings:

  - Added the required column `accessToken` to the `Shop` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shop" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "apiKey" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "shopName" TEXT NOT NULL
);
INSERT INTO "new_Shop" ("apiKey", "id", "shopName") SELECT "apiKey", "id", "shopName" FROM "Shop";
DROP TABLE "Shop";
ALTER TABLE "new_Shop" RENAME TO "Shop";
CREATE UNIQUE INDEX "Shop_shopName_key" ON "Shop"("shopName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
