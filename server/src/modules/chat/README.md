# AI Chatbot (RAG) — Architecture Guide

This document explains how the storefront AI chatbot works, how the code is
organized, and why key decisions were made. It is written for a developer
who is new to the project: after reading it you should understand the full
request path and the reasoning behind each trade-off.

Paths below are relative to the repository root.

## 1. What this is

A RAG (retrieval-augmented generation) chatbot embedded in the Shopify
storefront. Shoppers ask questions in natural language ("Do you have any
snowboard?"), the backend finds the most relevant products with vector
search, and an LLM streams back an answer with clickable product cards.

- `server/`: NestJS 10, Prisma 5.17, PostgreSQL 16 with pgvector.
- `client/`: React 18 + Vite 4 + Polaris 12 (embedded admin UI with the
  Config and Monitoring tabs).
- `extensions/chat-widget/`: the storefront widget, a theme app
  extension (app embed block, vanilla JS, reads SSE).

## 2. Module map

All backend chat code lives in `server/src/modules/chat/`:

| Path | Responsibility |
| --- | --- |
| `chat.module.ts` | Wires BullMQ, the queue, controllers, providers and the auth guard |
| `controller/chat.controller.ts` | Public storefront API (config + SSE stream) |
| `admin/chat-admin.controller.ts` | Config, stats, resync and test-provider for the admin tabs |
| `admin/shop-auth.guard.ts` | Verifies the Shopify session token |
| `admin/verified-shop.decorator.ts` | Injects the verified shop into handlers |
| `llm/llm-provider.interface.ts` | The provider contract and error taxonomy |
| `llm/openai-compatible.provider.ts` | OpenAI, Groq and Ollama in one class |
| `llm/gemini.provider.ts` | Gemini: SDK for chat, REST for embeddings |
| `llm/llm-registry.service.ts` | Builds the fallback chain and instantiates providers |
| `llm/crypto.util.ts` | AES-256-GCM for merchant API keys |
| `services/chat.service.ts` | Orchestrates one chat turn |
| `services/retrieval.service.ts` | Hybrid structured SQL + pgvector product retrieval |
| `services/rate-limit.service.ts` | Fixed-window rate limit, spend tracking, cost estimate |
| `services/catalog-sync.service.ts` | First sync/webhook sync, structured catalog, embeddings |
| `services/catalog-sync.processor.ts` | BullMQ worker |
| `services/model-verification.service.ts` | Startup check for retired models |
| `services/redis.client.ts` | Shared Redis client |

## 3. Request flow

```
Shopper types a message
        |
        v
extensions/chat-widget/assets/chat-widget.js
  POST /api/v1/chat/messages/stream   (text/plain, body is JSON)
        |
        v
ChatController.streamMessage          parses the body, opens SSE
        |
        v
ChatService.streamChat
  1. validate shop + publicToken      -> reject if mismatch
  2. rate limit per shop+IP           -> Redis fixed window
  3. get or create ChatSession
  4. persist the user message
  5. RetrievalService.searchProducts  -> structured filters for exact facts
                                        + pgvector semantic search, topK
        |
        v
  6. build the system prompt          products, options and variants injected as context
  7. walk the provider chain          openai -> gemini -> groq -> ollama
        |                             (respects fallbackMode)
        v
  8. stream tokens back               SSE `data: {...}` frames
  9. persist the assistant message    tokens, latency, fallback flags
```

Endpoints:

- `GET /api/v1/chat/config` — public widget configuration. Never returns
  secrets.
- `POST /api/v1/chat/messages/stream` — the chat turn, Server-Sent Events.

Admin endpoints, all under `/api/v1/chat-admin/*` and guarded by
`ShopAuthGuard`: config read/update, API-key delete, catalog resync, usage
stats, and `POST /api/v1/chat-admin/test-provider`, which sends a tiny real
prompt and reports ok, error and latency.

## 4. Data model

Core chat tables in `server/prisma/schema.prisma`.

**`ChatShopConfig`** — one row per shop (`shopId` unique): enabled flag,
provider and model choice, optional encrypted merchant API key
(`llmApiKeyEnc`), `systemPrompt`, `topK` (default 5), `temperature`
(default 0.3), `publicToken` (unique), `rateLimitPerMin` (default 20),
`fallbackMode` (default `free_first_paid_backup`),
`fallbackBudgetCapUsdPerDay` (default 2.0).

**`CatalogProduct`** — the source of truth for synced Shopify product facts:
title, handle, description, vendor, product type, tags, status, URL, featured
image and price range. It is keyed by `shopId + shopifyProductId`.

**`CatalogVariant`** — one row per Shopify variant. It stores price, compare-at
price, SKU, barcode, availability, inventory quantity when available, and
`selectedOptions` as JSON. This preserves arbitrary merchant-specific options
such as `Color`, `Size`, `Material`, etc. without hardcoding a schema per shop.

**`CatalogOption`** — product-level option names and values, e.g.
`Color: Red, Blue` or `Size: S, M, L`.

**`ProductEmbedding`** — the semantic vector index, not the product source of
truth. It stores one `vector(768)` per product/chunk plus `contentHash` and the
embedding input text. Legacy snapshot columns remain for compatibility, but
retrieval joins back to `CatalogProduct`/`CatalogVariant`/`CatalogOption` for
exact facts.

**`ChatSession` / `ChatMessage`** — conversation history with `tokensIn`,
`tokensOut`, `latencyMs`, `fallbackUsed` and `fallbackReason`, which feed
the Monitoring tab and the cost estimate.

The HNSW index uses `vector_cosine_ops`: cosine similarity compares the
angle between vectors, which is what captures semantic similarity for text
embeddings, where magnitude carries little signal. HNSW is an approximate
nearest-neighbour index, so retrieval stays fast as the catalog grows
instead of scanning every row. The index is created in a raw SQL migration
because Prisma cannot express pgvector indexes.

## 5. RAG pipeline

1. `RetrievalService` extracts simple structured intent from the shopper's
   question: price bounds, SKU, quoted product names, and option terms such as
   color or size.
2. If structured intent exists, it queries `CatalogProduct`, `CatalogVariant`
   and `CatalogOption` with SQL so exact facts are respected. Example: “under
   $50” uses price columns instead of hoping vector similarity returns cheap
   products.
3. In parallel, the question is embedded into a 768-dimension vector and used
   for pgvector cosine search over `ProductEmbedding` for semantic discovery.
4. Results are merged and deduplicated. Structured/hybrid matches are preferred
   for exact questions; semantic vector scores remain useful for broad
   recommendation questions.
5. `ChatService` injects rich context (title, URL, price range, vendor, tags,
   options, variants, SKU and availability) into the system prompt and tells
   the LLM to answer only from that context.
6. The LLM streams the answer as SSE. The widget renders the text and, from
   the same retrieval result, the product cards.

## 6. LLM providers and the fallback chain

`LlmProvider` is a small interface:

```ts
interface LlmProvider {
  readonly id: LlmProviderId
  readonly isPaid: boolean
  chat(messages, options): Promise<LlmChatResult>
  chatStream(messages, options): AsyncIterable<string>
  embed(texts, model): Promise<number[][]>
}
```

One OpenAI-compatible implementation serves OpenAI, Groq and Ollama by
overriding `baseURL`; Gemini has its own provider because its chat SDK and
REST shapes differ. Supported ids: `openai | gemini | groq | ollama`.

Cost estimation is not on the interface. `estimateCostUsd()` is a standalone
function in `services/rate-limit.service.ts`, and `listModels()` is private
to `ModelVerificationService`.

`LlmProviderError` carries a code (`rate_limited`, `quota_exceeded`,
`timeout`, `server_error`, `auth`, `bad_request`, `unknown`) and a
`isFallbackable` getter. `bad_request` means our own payload was malformed,
so retrying another provider would fail the same way.

The chain is controlled per shop by `fallbackMode`:

- `free_only` — never touch a paid provider, even if the free one fails.
- `free_first_paid_backup` (default) — free first, paid on failure,
  subject to the budget cap.
- `paid_primary` — paid provider first.

**Why the chain exists:** free-tier providers are unreliable in practice.
Gemini returns 503 under load and Groq retires models without warning.
Without a fallback, the widget goes dark exactly when the store is busy.

**Why the chain needs a budget cap:** the widget is public, so anyone can
generate traffic, and paid providers bill real money per token. An
unbounded fallback turns a traffic spike, or abuse, into an unbounded
bill. `fallbackBudgetCapUsdPerDay` bounds the worst case:
`estimateCostUsd` prices each turn from token counts, `RateLimitService`
tracks daily spend in Redis, and once the cap is reached the chain skips
paid providers and degrades instead of spending more.

## 7. Embeddings are fixed at the infrastructure level

The embedding provider and model are **not** per-shop settings. They are
fixed by `CHAT_EMBEDDING_PROVIDER` and `CHAT_DEFAULT_EMBEDDING_MODEL`
(default `gemini-embedding-001` with `outputDimensionality=768`).

**Why:** every row in `ProductEmbedding` must live in the same vector
space. Vectors from different models, or with different dimensions, are not
comparable, and the column type `vector(768)` physically cannot hold
another dimension. Letting merchants switch models would also mean
re-embedding the entire catalog on every change.

Embeddings are generated on the write path, once per product webhook, so a
free and fast model keeps catalog sync cheap. The chat provider is
per-shop because it only affects the read path and carries no such
coupling. Retrieval quality differs far less between embedding models than
chat quality does, and the customer perceives the answer, not the vector.

**Implementation note:** `gemini-embedding-001` is called with
`outputDimensionality=768` over direct REST, because
`@google/generative-ai` 0.24.1, the pinned SDK, does not expose that
parameter. If the SDK is upgraded, check the parameter before removing the
REST call.

## 8. Catalog sync

After Shopify auth callback, the app enqueues an initial full catalog resync
for the shop. The manual Config-tab resync button uses the same queue path.

Shopify product webhooks (`products/create`, `products/update`,
`products/delete`, all routed to the single `/api/webhooks` endpoint) enqueue
one BullMQ job per product. The worker syncs the structured catalog first
(`CatalogProduct`, `CatalogVariant`, `CatalogOption`), then embeds a rich text
document containing title, description, type, vendor, tags, option values,
variant selected options, prices, SKU and availability. Deletes remove both the
structured rows and the embedding row.

Jobs use a deterministic id, `sync-{shop}-{productId}`, so webhook bursts
such as bulk imports deduplicate naturally instead of syncing and embedding the
same product N times.

BullMQ keeps terminal (`completed` or `failed`) jobs by default, and a
terminal job with the same id blocks every future sync for that product.
`enqueueProductSync` therefore removes a terminal job before adding a new
one, while leaving `waiting`, `active` and `delayed` jobs alone to preserve
deduplication.

## 9. Rate limiting

A fixed-window counter per shop and client IP in Redis
(`rateLimitPerMin`, default 20). Daily paid-fallback spend is tracked the
same way for the budget cap.

**Why fail-open:** if Redis dies and we fail closed, storefront chat breaks
for every shop because of an auxiliary system. Availability of a
customer-facing feature matters more than perfect abuse protection, and the
exposure window is limited to the Redis outage. The same reasoning applies
to spend tracking during an outage.

## 10. Security model

**Public widget.** Identified by `publicToken`, a random per-shop token
configured in the app embed block. It is a capability, not a secret:
anyone can read it from the page source, so it only gates which shop's
config is used, never admin operations.

**Admin API.** `ShopAuthGuard` verifies the Shopify App Bridge session
token from the `Authorization: Bearer` header using HMAC-SHA256 with
`SHOPIFY_API_SECRET`, checks `exp` and `nbf`, and takes the shop from the
verified `dest` claim. `@VerifiedShop()` injects that shop, so one shop can
never read or write another shop's configuration. If `SHOPIFY_API_SECRET` is
missing the guard falls back to an insecure mode that only logs a warning;
that exists for local development and must never reach production.

Note the scope of this check: it authenticates the **shop**, not an
individual user. Anyone who can open the embedded admin app for that shop
can read its chat configuration. Shopify's own role settings decide who
may open the app at all.

**Merchant API keys.** A shop can override the chat API key in the Config
tab. It is stored in `ChatShopConfig.llmApiKeyEnc`, encrypted with
AES-256-GCM under `CONFIG_ENCRYPTION_KEY`. GCM is authenticated encryption,
so a tampered ciphertext is detected instead of silently decrypting to
garbage. Generate the key with `openssl rand -hex 32`.

## 11. Storefront widget and the CORS story

The widget is a theme app extension targeting `body`, so it renders on every
storefront page. It is vanilla JS reading SSE, with no framework, to keep it
small and dependency-free. The merchant pastes the backend base URL into the
app embed setting "App API base URL".

The widget sends `Content-Type: text/plain;charset=UTF-8` with a JSON-string
body instead of `application/json`. **Why:** the Shopify CLI dev proxy
answers CORS preflight (`OPTIONS`) requests itself and strips the CORS
headers, so `application/json` POSTs fail during development. `text/plain`
is a CORS-safelisted content type, so the browser never sends a preflight
and the request behaves identically in dev and production. The server parses
it with `express.text()` on that route and decodes the JSON manually.

This changes nothing about security: `publicToken` validation is untouched.
It is a dev-only quirk, so do not "fix" it by weakening production CORS.

## 12. Model verification

`ModelVerificationService` runs once at startup, non-blocking. It calls
ListModels for the configured providers and logs a warning when the
configured model is missing, listing chat-capable alternatives.

Providers retire models without warning, so this is an early signal, not a
guarantee. The Config tab's **Test connection** button sends a real tiny
prompt and is the reliable check.

## 13. Gotchas

Learned the hard way during implementation.

- **A model in the list is not proof it is callable.** `gemini-2.0-flash`
  was retired. `gemini-2.5-flash` appears in ListModels but the API
  rejects it for new accounts. Always verify with Test connection.
- **`text-embedding-004` does not exist** on the Gemini API. That name
  belongs to Vertex AI. The correct model is `gemini-embedding-001`.
- **The pinned SDK lacks `outputDimensionality`**, hence the direct REST
  call for embeddings (see section 7).
- **Deterministic BullMQ job ids block sync forever** if a job is left in a
  terminal state (see section 8).
- **The Shopify CLI dev proxy breaks CORS preflight.** It answers `OPTIONS`
  itself without `Access-Control-Allow-Origin`. See section 11.
- **`DevtoolsModule` can crash a second instance if enabled on the same port.**
  Devtools is disabled by default; set `DEVTOOLS_ENABLED=true` and choose a
  unique `DEVTOOLS_PORT` when debugging a specific Nest process. It is never
  registered in production.
- **An OpenAI key can be valid but unusable.** Listing models returns 200
  while chat returns `429 insufficient_quota` when there are no credits.
- **The tunnel URL changes on every `shopify app dev` run.** The merchant
  must update "App API base URL" after each restart, or the widget talks to
  a dead URL.
- **`yarn migrate:dev` can hang** waiting for interactive input in a
  non-interactive shell. `prisma migrate deploy` applies existing migrations
  without prompting.

## 14. Run it from scratch

Prerequisites: Node 20, Yarn 1, Docker.

```bash
# 1. Infrastructure: PostgreSQL 16 + pgvector, Redis, pgAdmin
docker compose up -d

# 2. Environment
cp server/.env.example server/.env
#    Fill in: CONFIG_ENCRYPTION_KEY (openssl rand -hex 32),
#    GEMINI_API_KEY (required for embeddings) and a chat provider key.

# 3. Install and migrate
yarn install
yarn migrate:dev

# 4. Start the app on a dev store (Shopify login happens in the browser)
yarn shopify app dev --config product-recommender --store <your-dev-store>.myshopify.com
#    When prompted for the store password, enter the **storefront password**
#    from the store admin (Settings -> Preferences -> Password protect).
#    This is NOT your admin login password.
#    If the prompt fails with "store password is invalid", delete the cached
#    value at ~/.config/shopify-cli-theme-store-password-nodejs/config.json.

# 5. In the Shopify admin of the dev store:
#    - Open the app, go to the Config tab, Test connection, then Save.
#    - Trigger a catalog resync so products get embedded.
#    - Theme editor -> App embeds -> enable the chat widget and paste the
#      tunnel URL from the CLI output as "App API base URL".

# 6. Open the storefront, send "Do you have any snowboard?" and watch the
#    SSE stream answer with product cards.
```

Notes for the newcomer:

- `BACKEND_PORT`, `FRONTEND_PORT`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`,
  `SCOPES` and `HOST` are injected by the Shopify CLI. Do not put them in
  `.env`.
- Never run `git reset`, `git checkout` or `git clean` in this repo; some
  server files are intentionally uncommitted.
- See `SMOKE_TEST.md` at the repository root for the web-UI test checklist.
