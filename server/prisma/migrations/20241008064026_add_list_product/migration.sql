-- CreateTable
CREATE TABLE "ListProduct" (
    "id" SERIAL NOT NULL,
    "idProduct" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "avatarSource" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offerProductId" INTEGER,

    CONSTRAINT "ListProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListProduct_idProduct_key" ON "ListProduct"("idProduct");

-- AddForeignKey
ALTER TABLE "ListProduct" ADD CONSTRAINT "ListProduct_offerProductId_fkey" FOREIGN KEY ("offerProductId") REFERENCES "OfferProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
