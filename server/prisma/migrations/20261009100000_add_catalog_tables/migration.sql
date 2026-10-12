-- Structured Shopify catalog tables for chat/retrieval.
-- ProductEmbedding remains the semantic vector index; these tables are the
-- source of truth for exact product/variant facts.

CREATE TABLE "CatalogProduct" (
    "id" SERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "description" TEXT,
    "descriptionHtml" TEXT,
    "productType" TEXT,
    "vendor" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT,
    "onlineStoreUrl" TEXT,
    "featuredImageUrl" TEXT,
    "featuredImageAltText" TEXT,
    "minPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "currencyCode" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAtShopify" TIMESTAMP(3),
    "updatedAtShopify" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogVariant" (
    "id" SERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "title" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "price" DOUBLE PRECISION,
    "compareAtPrice" DOUBLE PRECISION,
    "currencyCode" TEXT,
    "availableForSale" BOOLEAN,
    "inventoryQuantity" INTEGER,
    "selectedOptions" JSONB NOT NULL,
    "imageUrl" TEXT,
    "position" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogOption" (
    "id" SERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "values" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogProduct_shopId_shopifyProductId_key" ON "CatalogProduct"("shopId", "shopifyProductId");
CREATE INDEX "CatalogProduct_shopId_idx" ON "CatalogProduct"("shopId");
CREATE INDEX "CatalogProduct_shopId_title_idx" ON "CatalogProduct"("shopId", "title");
CREATE INDEX "CatalogProduct_shopId_vendor_idx" ON "CatalogProduct"("shopId", "vendor");
CREATE INDEX "CatalogProduct_shopId_productType_idx" ON "CatalogProduct"("shopId", "productType");
CREATE INDEX "CatalogProduct_shopId_minPrice_idx" ON "CatalogProduct"("shopId", "minPrice");
CREATE INDEX "CatalogProduct_shopId_maxPrice_idx" ON "CatalogProduct"("shopId", "maxPrice");

CREATE UNIQUE INDEX "CatalogVariant_shopId_shopifyVariantId_key" ON "CatalogVariant"("shopId", "shopifyVariantId");
CREATE INDEX "CatalogVariant_shopId_idx" ON "CatalogVariant"("shopId");
CREATE INDEX "CatalogVariant_shopId_shopifyProductId_idx" ON "CatalogVariant"("shopId", "shopifyProductId");
CREATE INDEX "CatalogVariant_shopId_sku_idx" ON "CatalogVariant"("shopId", "sku");
CREATE INDEX "CatalogVariant_shopId_price_idx" ON "CatalogVariant"("shopId", "price");
CREATE INDEX "CatalogVariant_shopId_availableForSale_idx" ON "CatalogVariant"("shopId", "availableForSale");
CREATE INDEX "CatalogVariant_selectedOptions_gin_idx" ON "CatalogVariant" USING GIN ("selectedOptions");

CREATE UNIQUE INDEX "CatalogOption_shopId_shopifyProductId_name_key" ON "CatalogOption"("shopId", "shopifyProductId", "name");
CREATE INDEX "CatalogOption_shopId_idx" ON "CatalogOption"("shopId");
CREATE INDEX "CatalogOption_shopId_shopifyProductId_idx" ON "CatalogOption"("shopId", "shopifyProductId");
CREATE INDEX "CatalogOption_shopId_name_idx" ON "CatalogOption"("shopId", "name");

ALTER TABLE "CatalogVariant" ADD CONSTRAINT "CatalogVariant_shopId_shopifyProductId_fkey"
FOREIGN KEY ("shopId", "shopifyProductId") REFERENCES "CatalogProduct"("shopId", "shopifyProductId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogOption" ADD CONSTRAINT "CatalogOption_shopId_shopifyProductId_fkey"
FOREIGN KEY ("shopId", "shopifyProductId") REFERENCES "CatalogProduct"("shopId", "shopifyProductId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductEmbedding" ADD COLUMN IF NOT EXISTS "chunkType" TEXT NOT NULL DEFAULT 'product';
ALTER TABLE "ProductEmbedding" ADD COLUMN IF NOT EXISTS "text" TEXT;

DROP INDEX IF EXISTS "ProductEmbedding_shopId_shopifyProductId_key";
CREATE UNIQUE INDEX "ProductEmbedding_shopId_shopifyProductId_chunkType_key" ON "ProductEmbedding"("shopId", "shopifyProductId", "chunkType");
CREATE INDEX IF NOT EXISTS "ProductEmbedding_shopId_idx" ON "ProductEmbedding"("shopId");
