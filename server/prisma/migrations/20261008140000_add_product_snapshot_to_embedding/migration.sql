-- AlterTable: denormalized product snapshot for RAG context
-- (avoids Shopify API calls at chat time)
ALTER TABLE "ProductEmbedding"
ADD COLUMN "productTitle" TEXT,
ADD COLUMN "productHandle" TEXT,
ADD COLUMN "productUrl" TEXT,
ADD COLUMN "productImageUrl" TEXT,
ADD COLUMN "price" DOUBLE PRECISION;
