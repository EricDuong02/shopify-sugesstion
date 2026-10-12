-- Add shop scoping to recommender campaign tables.
-- Nullable for existing rows: old campaigns cannot be mapped safely in a
-- multi-shop database without an explicit backfill.

ALTER TABLE "OfferProduct" ADD COLUMN "shopId" TEXT;
ALTER TABLE "ListProduct" ADD COLUMN "shopId" TEXT;

CREATE INDEX "OfferProduct_shopId_idx" ON "OfferProduct"("shopId");
CREATE INDEX "ListProduct_shopId_idx" ON "ListProduct"("shopId");
