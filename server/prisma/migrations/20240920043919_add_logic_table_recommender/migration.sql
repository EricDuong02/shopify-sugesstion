-- CreateTable
CREATE TABLE "OfferProduct" (
    "id" SERIAL NOT NULL,
    "moduleId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "placeId" INTEGER NOT NULL,

    CONSTRAINT "OfferProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggerProduct" (
    "id" SERIAL NOT NULL,
    "pageIds" INTEGER[],
    "scheduleOn" BOOLEAN NOT NULL,
    "offerProductId" INTEGER NOT NULL,

    CONSTRAINT "TriggerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductGroups" (
    "id" SERIAL NOT NULL,
    "typeId" INTEGER NOT NULL,
    "ids" TEXT[],
    "offerProductId" INTEGER,
    "triggerProductId" INTEGER,

    CONSTRAINT "ProductGroups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rules" (
    "id" SERIAL NOT NULL,
    "column" INTEGER NOT NULL,
    "relation" INTEGER NOT NULL,
    "value" TEXT[],
    "productGroupsId" INTEGER,

    CONSTRAINT "Rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TriggerProduct_offerProductId_key" ON "TriggerProduct"("offerProductId");

-- AddForeignKey
ALTER TABLE "TriggerProduct" ADD CONSTRAINT "TriggerProduct_offerProductId_fkey" FOREIGN KEY ("offerProductId") REFERENCES "OfferProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGroups" ADD CONSTRAINT "ProductGroups_offerProductId_fkey" FOREIGN KEY ("offerProductId") REFERENCES "OfferProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGroups" ADD CONSTRAINT "ProductGroups_triggerProductId_fkey" FOREIGN KEY ("triggerProductId") REFERENCES "TriggerProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rules" ADD CONSTRAINT "Rules_productGroupsId_fkey" FOREIGN KEY ("productGroupsId") REFERENCES "ProductGroups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
