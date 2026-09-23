/*
  Warnings:

  - A unique constraint covering the columns `[idProduct,offerProductId]` on the table `ListProduct` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ListProduct_idProduct_key";

-- CreateIndex
CREATE UNIQUE INDEX "ListProduct_idProduct_offerProductId_key" ON "ListProduct"("idProduct", "offerProductId");
