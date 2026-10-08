-- Fix: updatedAt and createdAt need DEFAULT CURRENT_TIMESTAMP so raw SQL
-- inserts (used by the catalog sync job) work without Prisma.
ALTER TABLE "ChatShopConfig"
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ProductEmbedding"
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ChatMessage"
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
