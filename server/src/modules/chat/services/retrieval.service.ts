import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/services/prisma.service'
import { Prisma } from '@prisma/client'
import { LlmRegistryService } from '../llm/llm-registry.service'

export interface RetrievedVariant {
  id: string
  title: string | null
  sku: string | null
  price: number | null
  compareAtPrice: number | null
  availableForSale: boolean | null
  selectedOptions: Record<string, string>
}

export interface RetrievedOption {
  name: string
  values: string[]
}

export interface RetrievedProduct {
  shopifyProductId: string
  title: string | null
  handle: string | null
  url: string | null
  imageUrl: string | null
  price: number | null
  minPrice: number | null
  maxPrice: number | null
  currencyCode: string | null
  description: string | null
  vendor: string | null
  productType: string | null
  tags: string[]
  options: RetrievedOption[]
  variants: RetrievedVariant[]
  /** Relevance score in [0, 1] where available; structured matches use 1. */
  score: number
  source: 'structured' | 'vector' | 'hybrid'
}

interface VectorSearchRow {
  shopifyProductId: string
  score: number
}

interface StructuredSearchRow {
  shopifyProductId: string
  score: number
}

interface StructuredFilters {
  priceMin?: number
  priceMax?: number
  optionTerms: string[]
  sku?: string
  exactText?: string
  hasStructuredIntent: boolean
}

const COLOR_WORDS = [
  'black',
  'white',
  'red',
  'blue',
  'green',
  'yellow',
  'pink',
  'purple',
  'orange',
  'brown',
  'gray',
  'grey',
  'beige',
  'navy',
  'đen',
  'trắng',
  'đỏ',
  'xanh',
  'vàng',
  'hồng',
  'tím',
  'cam',
  'nâu',
  'xám',
]

const SIZE_WORDS = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl']

/**
 * Hybrid product retrieval. Vector search is used for semantic discovery;
 * structured SQL over CatalogProduct/CatalogVariant/CatalogOption is used for
 * exact facts such as price, SKU, custom options (Color/Size), and names.
 */
@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmRegistry: LlmRegistryService,
  ) {}

  async searchProducts(
    shopId: string,
    query: string,
    topK: number,
  ): Promise<RetrievedProduct[]> {
    const filters = this.extractStructuredFilters(query)
    const [structuredRows, vectorRows] = await Promise.all([
      filters.hasStructuredIntent
        ? this.structuredSearch(shopId, filters, Math.max(topK * 2, 10)).catch(
            (error) => {
              console.error(
                `[retrieval] structured search failed for ${shopId}:`,
                error,
              )
              return []
            },
          )
        : Promise.resolve([]),
      this.vectorSearch(shopId, query, Math.max(topK * 2, 10)).catch(
        (error) => {
          console.error(
            `[retrieval] vector search failed for ${shopId}:`,
            error,
          )
          return []
        },
      ),
    ])

    const merged = new Map<
      string,
      {
        shopifyProductId: string
        score: number
        source: RetrievedProduct['source']
      }
    >()

    for (const row of vectorRows) {
      merged.set(row.shopifyProductId, {
        shopifyProductId: row.shopifyProductId,
        score: Number(row.score),
        source: 'vector',
      })
    }

    for (const row of structuredRows) {
      const current = merged.get(row.shopifyProductId)
      merged.set(row.shopifyProductId, {
        shopifyProductId: row.shopifyProductId,
        score: Math.max(Number(row.score), current?.score ?? 0),
        source: current ? 'hybrid' : 'structured',
      })
    }

    const ranked = Array.from(merged.values()).sort((a, b) => {
      const sourceRank = (source: RetrievedProduct['source']) =>
        source === 'hybrid' ? 3 : source === 'structured' ? 2 : 1
      if (filters.hasStructuredIntent) {
        const sourceDelta = sourceRank(b.source) - sourceRank(a.source)
        if (sourceDelta !== 0) return sourceDelta
      }
      return b.score - a.score
    })

    const ids = ranked.slice(0, topK).map((row) => row.shopifyProductId)
    if (ids.length === 0) return []

    const products = await this.loadProducts(shopId, ids)
    const productMap = new Map(
      products.map((product: any) => [product.shopifyProductId, product]),
    )

    return ids
      .map((id) => {
        const product: any = productMap.get(id)
        if (!product) return null
        const rank = ranked.find((row) => row.shopifyProductId === id)
        return this.toRetrievedProduct(
          product,
          rank?.score ?? 0,
          rank?.source ?? 'vector',
        )
      })
      .filter(Boolean) as RetrievedProduct[]
  }

  private async vectorSearch(
    shopId: string,
    query: string,
    limit: number,
  ): Promise<VectorSearchRow[]> {
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

    return this.prisma.$queryRaw<VectorSearchRow[]>`
      SELECT e."shopifyProductId",
             (1 - (e."embedding" <=> ${literal}::vector)) AS "score"
      FROM "ProductEmbedding" e
      JOIN "CatalogProduct" p
        ON p."shopId" = e."shopId"
       AND p."shopifyProductId" = e."shopifyProductId"
      WHERE e."shopId" = ${shopId}
        AND e."chunkType" = 'product'
        AND e."embedding" IS NOT NULL
      ORDER BY e."embedding" <=> ${literal}::vector
      LIMIT ${limit}
    `
  }

  private async structuredSearch(
    shopId: string,
    filters: StructuredFilters,
    limit: number,
  ): Promise<StructuredSearchRow[]> {
    const clauses: Prisma.Sql[] = []

    if (filters.priceMax != null) {
      clauses.push(Prisma.sql`(
        p."minPrice" <= ${filters.priceMax}
        OR EXISTS (
          SELECT 1 FROM "CatalogVariant" v
          WHERE v."shopId" = p."shopId"
            AND v."shopifyProductId" = p."shopifyProductId"
            AND v."price" <= ${filters.priceMax}
        )
      )`)
    }

    if (filters.priceMin != null) {
      clauses.push(Prisma.sql`(
        p."maxPrice" >= ${filters.priceMin}
        OR EXISTS (
          SELECT 1 FROM "CatalogVariant" v
          WHERE v."shopId" = p."shopId"
            AND v."shopifyProductId" = p."shopifyProductId"
            AND v."price" >= ${filters.priceMin}
        )
      )`)
    }

    if (filters.sku) {
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "CatalogVariant" v
        WHERE v."shopId" = p."shopId"
          AND v."shopifyProductId" = p."shopifyProductId"
          AND v."sku" ILIKE ${`%${filters.sku}%`}
      )`)
    }

    if (filters.exactText) {
      clauses.push(Prisma.sql`(
        p."title" ILIKE ${`%${filters.exactText}%`}
        OR p."handle" ILIKE ${`%${filters.exactText}%`}
        OR p."vendor" ILIKE ${`%${filters.exactText}%`}
        OR p."productType" ILIKE ${`%${filters.exactText}%`}
      )`)
    }

    for (const term of filters.optionTerms) {
      clauses.push(Prisma.sql`(
        EXISTS (
          SELECT 1 FROM "CatalogOption" o
          WHERE o."shopId" = p."shopId"
            AND o."shopifyProductId" = p."shopifyProductId"
            AND (
              o."name" ILIKE ${`%${term}%`}
              OR EXISTS (SELECT 1 FROM unnest(o."values") AS option_value WHERE option_value ILIKE ${`%${term}%`})
            )
        )
        OR EXISTS (
          SELECT 1 FROM "CatalogVariant" v
          WHERE v."shopId" = p."shopId"
            AND v."shopifyProductId" = p."shopifyProductId"
            AND v."selectedOptions"::text ILIKE ${`%${term}%`}
        )
      )`)
    }

    if (clauses.length === 0) return []

    const whereSql = Prisma.join(clauses, ' AND ')
    return this.prisma.$queryRaw<StructuredSearchRow[]>(Prisma.sql`
      SELECT p."shopifyProductId", 1.0 AS "score"
      FROM "CatalogProduct" p
      WHERE p."shopId" = ${shopId}
        AND ${whereSql}
      ORDER BY p."minPrice" ASC NULLS LAST, p."title" ASC
      LIMIT ${limit}
    `)
  }

  private async loadProducts(shopId: string, ids: string[]) {
    return this.prisma.catalogProduct.findMany({
      where: { shopId, shopifyProductId: { in: ids } },
      include: {
        options: { orderBy: { position: 'asc' } },
        variants: { orderBy: { position: 'asc' }, take: 20 },
      },
    })
  }

  private toRetrievedProduct(
    product: any,
    score: number,
    source: RetrievedProduct['source'],
  ): RetrievedProduct {
    return {
      shopifyProductId: product.shopifyProductId,
      title: product.title,
      handle: product.handle,
      url:
        product.onlineStoreUrl ||
        (product.handle
          ? `https://${product.shopId}/products/${product.handle}`
          : null),
      imageUrl: product.featuredImageUrl,
      price: product.minPrice,
      minPrice: product.minPrice,
      maxPrice: product.maxPrice,
      currencyCode: product.currencyCode,
      description: product.description,
      vendor: product.vendor,
      productType: product.productType,
      tags: product.tags ?? [],
      options: (product.options ?? []).map((option: any) => ({
        name: option.name,
        values: option.values ?? [],
      })),
      variants: (product.variants ?? []).map((variant: any) => ({
        id: variant.shopifyVariantId,
        title: variant.title,
        sku: variant.sku,
        price: variant.price,
        compareAtPrice: variant.compareAtPrice,
        availableForSale: variant.availableForSale,
        selectedOptions: this.normalizeSelectedOptions(variant.selectedOptions),
      })),
      score: Number(score),
      source,
    }
  }

  private normalizeSelectedOptions(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.entries(value as Record<string, unknown>).reduce<
      Record<string, string>
    >((acc, [key, optionValue]) => {
      if (optionValue != null) acc[key] = String(optionValue)
      return acc
    }, {})
  }

  private extractStructuredFilters(query: string): StructuredFilters {
    const normalized = query.toLowerCase()
    const filters: StructuredFilters = {
      optionTerms: [],
      hasStructuredIntent: false,
    }

    const between = normalized.match(
      /(?:between|from|từ)\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:and|to|-|đến)\s*\$?\s*(\d+(?:\.\d+)?)/,
    )
    if (between) {
      filters.priceMin = parseFloat(between[1])
      filters.priceMax = parseFloat(between[2])
    }

    const max = normalized.match(
      /(?:under|below|less than|cheaper than|<=|<|dưới|nhỏ hơn|rẻ hơn)\s*\$?\s*(\d+(?:\.\d+)?)/,
    )
    if (max) filters.priceMax = parseFloat(max[1])

    const min = normalized.match(
      /(?:over|above|more than|greater than|>=|>|trên|lớn hơn|đắt hơn)\s*\$?\s*(\d+(?:\.\d+)?)/,
    )
    if (min) filters.priceMin = parseFloat(min[1])

    const quoted = query.match(/["“”']([^"“”']{2,80})["“”']/)
    if (quoted) filters.exactText = quoted[1].trim()

    const sku = query.match(/\bsku\s*[:#-]?\s*([\w.-]+)/i)
    if (sku) filters.sku = sku[1]

    const explicitOption = query.match(
      /\b(?:color|colour|màu|size|cỡ|kích cỡ)\s*[:=]?\s*([\p{L}\p{N}-]+)/iu,
    )
    if (explicitOption) filters.optionTerms.push(explicitOption[1])

    for (const color of COLOR_WORDS) {
      if (
        new RegExp(`(^|\\s)${this.escapeRegex(color)}(\\s|$)`, 'iu').test(query)
      ) {
        filters.optionTerms.push(color)
      }
    }

    for (const size of SIZE_WORDS) {
      if (new RegExp(`\\b${this.escapeRegex(size)}\\b`, 'i').test(query)) {
        filters.optionTerms.push(size)
      }
    }

    filters.optionTerms = Array.from(new Set(filters.optionTerms))
    filters.hasStructuredIntent = Boolean(
      filters.priceMin != null ||
      filters.priceMax != null ||
      filters.optionTerms.length > 0 ||
      filters.sku ||
      filters.exactText,
    )

    return filters
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}
