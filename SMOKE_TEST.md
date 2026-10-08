# AI Chat Widget — smoke test

Test the storefront widget and the admin tabs through the web UI only.
Endpoints are not called directly: admin endpoints are protected by
`ShopAuthGuard`, so a direct browser call correctly returns 401.

## Before you start

1. Run the dev server:

   ```bash
   yarn shopify app dev --config product-recommender --store product-recommender-dev.myshopify.com
   ```

2. Copy the tunnel URL it prints (`https://xxx.trycloudflare.com`).
3. In the dev store theme editor, open **App embeds**, enable
   **AI Chat Widget**, paste the tunnel URL into **App API base URL**, save.
4. Open the storefront in a private/incognito window to avoid cached assets.

The tunnel URL changes on every restart. If the widget stops working,
check this first.

## A. Storefront

| Step | Expectation | If it fails |
| --- | --- | --- |
| A1. Open any storefront page | A round chat button appears in the configured corner | Check the embed is enabled and saved, confirm the theme is Online Store 2.0, hard refresh with Ctrl+Shift+R |
| A2. Click the button | Panel opens with the greeting text; the close button works | Console for JS errors; Network tab filtered on `chat-widget` to confirm the script loaded |
| A3. Send "Hello" | Your message appears, then a streamed reply | See the troubleshooting section below |
| A4. Ask "Do you have any snowboard?" | Related products with names, prices and images | Check `ProductEmbedding` row count and `ChatShopConfig.enabled` |
| A5. Click a product card | Navigates to the real product page | Check `productUrl` and `productImageUrl` in the database |
| A6. Ask something unrelated, e.g. "What is the capital of France?" | The assistant says it only answers product questions and does not invent products | Tighten the system prompt if it fabricates products |
| A7. Toggle the device toolbar to a phone viewport | The panel fits the screen and the input is not covered | Adjust the max-height in `chat-widget.css` |

## B. Admin

Open the app inside the Shopify admin.

| Step | Expectation | If it fails |
| --- | --- | --- |
| B1. Open the Chat monitoring tab | Sessions, messages, fallback rate, tokens and latency are shown; message counts grow after A3–A6 | Reload the app. A 401 means the session token expired |
| B2. Open the Chat config tab | Provider `groq`, model `qwen/qwen3.8-27b`, enabled `true` | Check the `ChatShopConfig` row exists for this shop |
| B3. Click **Test connection** | A green banner with the latency and the reply | Read the error: "No API key" means the key is missing, "timed out" means the provider is overloaded, "model not found" means the model name is wrong |
| B4. Change temperature to 0.5 and save | "Configuration saved", and the value survives a reload | Check `CONFIG_ENCRYPTION_KEY` is set in `server/.env` |
| B5. Click **Resync catalog now** | "Catalog resync queued"; `ProductEmbedding.updatedAt` moves after a minute or two | Check Redis and the BullMQ worker are running, and look for the job in the log |

## Troubleshooting

**"Connection failed. Please try again." with nothing in the server log**

The request never reached the server. Check, in order:

1. The **App API base URL** in the theme editor matches the tunnel URL of
   the session currently running.
2. The dev server is still running.
3. In DevTools, Network tab, confirm which domain the request went to.

**Streaming works but no products come back**

Check that `ProductEmbedding` has rows and that retrieval scores are not
all zero. The embedding provider is fixed at the platform level, so a
missing `GEMINI_API_KEY` breaks retrieval even when chat still works
through another provider.

**All providers fail**

The server log prints one line per provider. `429` with no credits means
the OpenAI account needs payment. `503 high demand` is a Gemini free-tier
outage that usually recovers. `404 model does not exist` means the model
name has been retired by the provider.
