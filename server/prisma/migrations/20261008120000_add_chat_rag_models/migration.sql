-- Enable pgvector for product embeddings (RAG retrieval)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable: per-shop AI chatbot configuration
CREATE TABLE "ChatShopConfig" (
    "id" SERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "llmProvider" TEXT NOT NULL DEFAULT 'openai',
    "llmModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "llmApiKeyEnc" TEXT,
    "systemPrompt" TEXT,
    "topK" INTEGER NOT NULL DEFAULT 5,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "publicToken" TEXT NOT NULL,
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 20,
    "fallbackMode" TEXT NOT NULL DEFAULT 'free_first_paid_backup',
    "fallbackBudgetCapUsdPerDay" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatShopConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatShopConfig_shopId_key" ON "ChatShopConfig"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatShopConfig_publicToken_key" ON "ChatShopConfig"("publicToken");

-- CreateTable: product embeddings for RAG retrieval.
-- Fixed 768 dimensions (Gemini text-embedding-004, infrastructure-level default).
CREATE TABLE "ProductEmbedding" (
    "id" SERIAL NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "embedding" vector(768),
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductEmbedding_shopId_shopifyProductId_key" ON "ProductEmbedding"("shopId", "shopifyProductId");

-- CreateIndex: HNSW index for cosine-similarity vector search
CREATE INDEX "ProductEmbedding_embedding_hnsw_idx" ON "ProductEmbedding" USING hnsw ("embedding" vector_cosine_ops);

-- CreateTable: storefront chat sessions
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatSession_shopId_startedAt_idx" ON "ChatSession"("shopId", "startedAt");

-- CreateTable: chat messages (powers the Monitoring tab)
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "latencyMs" INTEGER,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "fallbackReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
