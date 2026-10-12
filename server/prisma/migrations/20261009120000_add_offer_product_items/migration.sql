-- Add canonical recommender offer-to-catalog join table.
-- ListProduct remains for compatibility during migration; reads can fallback to it.

CREATE TABLE "OfferProductItem" (
    "id" SERIAL NOT NULL,
    "offerProductId" INTEGER NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "position" INTEGER,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferProductItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfferProductItem_offerProductId_shopId_shopifyProductId_key"
ON "OfferProductItem"("offerProductId", "shopId", "shopifyProductId");

CREATE INDEX "OfferProductItem_shopId_idx" ON "OfferProductItem"("shopId");
CREATE INDEX "OfferProductItem_shopId_shopifyProductId_idx" ON "OfferProductItem"("shopId", "shopifyProductId");

ALTER TABLE "OfferProductItem" ADD CONSTRAINT "OfferProductItem_offerProductId_fkey"
FOREIGN KEY ("offerProductId") REFERENCES "OfferProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfferProductItem" ADD CONSTRAINT "OfferProductItem_shopId_shopifyProductId_fkey"
FOREIGN KEY ("shopId", "shopifyProductId") REFERENCES "CatalogProduct"("shopId", "shopifyProductId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Best-effort backfill from legacy ListProduct where both shop scope and synced catalog rows exist.
INSERT INTO "OfferProductItem" ("offerProductId", "shopId", "shopifyProductId", "source", "createdAt", "updatedAt")
SELECT lp."offerProductId", lp."shopId", lp."idProduct", 'legacy_list_product', NOW(), NOW()
FROM "ListProduct" lp
JOIN "CatalogProduct" cp
  ON cp."shopId" = lp."shopId"
 AND cp."shopifyProductId" = lp."idProduct"
WHERE lp."offerProductId" IS NOT NULL
  AND lp."shopId" IS NOT NULL
ON CONFLICT ("offerProductId", "shopId", "shopifyProductId") DO NOTHING;
