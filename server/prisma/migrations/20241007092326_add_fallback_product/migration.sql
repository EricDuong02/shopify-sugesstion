-- AlterTable
ALTER TABLE "ProductGroups" ADD COLUMN     "fallBackProductId" INTEGER;

-- CreateTable
CREATE TABLE "FallBackProduct" (
    "id" SERIAL NOT NULL,
    "offerProductId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FallBackProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FallBackProduct_offerProductId_key" ON "FallBackProduct"("offerProductId");

-- AddForeignKey
ALTER TABLE "FallBackProduct" ADD CONSTRAINT "FallBackProduct_offerProductId_fkey" FOREIGN KEY ("offerProductId") REFERENCES "OfferProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGroups" ADD CONSTRAINT "ProductGroups_fallBackProductId_fkey" FOREIGN KEY ("fallBackProductId") REFERENCES "FallBackProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
