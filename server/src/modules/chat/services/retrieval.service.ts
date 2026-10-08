import { Injectable } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { LlmRegistryService } from '../llm/llm-registry.service'

export interface RetrievedProduct {
  shopifyProductId: string
  title: string | null
  handle: string | null
  url: string | null
  imageUrl: string | null
  price: number | null
  /** Cosine similarity in [0, 1], higher is more relevant. */
  score: number
}

interface VectorSearchRow {
  shopifyProductId: string
  productTitle: string | null
  productHandle: string | null
  productUrl: string | null
  productImageUrl: string | null
  price: number | null
  score: number
}

/**
 * RAG retrieval: embeds the customer question with the fixed
 * infrastructure-level embedding provider and runs a cosine-similarity
 * search against the pgvector HNSW index, scoped to one shop.
 */
@Injectable()
export class RetrievalService {
  private readonly prisma = new PrismaClient()

  constructor(private readonly llmRegistry: LlmRegistryService) {}

  async searchProducts(
    shopId: string,
    query: string,
    topK: number,
  ): Promise<RetrievedProduct[]> {
    const embeddingProvider = this.llmRegistry.createEmbeddingProvider()
    if (!embeddingProvider) {
      throw new Error(
        'No embedding provider configured (check GEMINI_API_KEY or OLLAMA_BASE_URL)',
      )
    }

    const vectors = await embeddingProvider.embed(
      [query],
      this.llmRegistry.getEmbeddingModel(),
    )
    const queryVector = vectors[0]
    if (!queryVector || queryVector.length === 0) return []

    const literal = `[${queryVector.join(',')}]`

    const rows = await this.prisma.$queryRaw<VectorSearchRow[]>`
      SELECT "shopifyProductId", "productTitle", "productHandle", "productUrl", "productImageUrl", "price",
             (1 - ("embedding" <=> ${literal}::vector)) AS "score"
      FROM "ProductEmbedding"
      WHERE "shopId" = ${shopId} AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${literal}::vector
      LIMIT ${topK}
    `

    return rows.map((r) => ({
      shopifyProductId: r.shopifyProductId,
      title: r.productTitle,
      handle: r.productHandle,
      url: r.productUrl,
      imageUrl: r.productImageUrl,
      price: r.price,
      score: Number(r.score),
    }))
  }
}
