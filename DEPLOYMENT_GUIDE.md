# Project deployment guide for Docker + Shopify app dev

This guide helps you prepare a local or live-server environment so the project runs reliably with PostgreSQL, pgAdmin, ngrok, and the Shopify CLI.

## 1. Prerequisites

Your machine or server should have:

- Docker
- Docker Compose
- Git
- Node.js 20+
- Yarn 1

## 2. Clone the project

```bash
git clone <repo-url>
cd product-recommender
```

## 3. Configure environment variables

The [.env.docker](.env.docker) file is already created. You need to fill in the required values:

```env
DB_DATABASE=recommender
DB_USERNAME=recommender
DB_PASSWORD=recommender

PGADMIN_DEFAULT_EMAIL=admin@recommender.local
PGADMIN_DEFAULT_PASSWORD=admin

DATABASE_URL=postgresql://recommender:recommender@postgres:5432/recommender?schema=public
SHADOW_DATABASE_URL=postgresql://recommender:recommender@postgres:5432/recommender_shadow?schema=public

SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=http://localhost:8081
PORT=8081

NGROK_AUTHTOKEN=
NGROK_DOMAIN=
```

### Important notes:
- If you use ngrok, get your token from: https://dashboard.ngrok.com/get-started/your-authtoken
- Paste it into `NGROK_AUTHTOKEN`
- If you use a custom ngrok domain, fill in `NGROK_DOMAIN`

## 4. Start the database stack only

```bash
docker compose up -d
```

After startup, the services will be available at:

- PostgreSQL: localhost:5432
- pgAdmin: http://localhost:5050
- ngrok dashboard (only when enabled): http://localhost:4040

## 5. Run the project on the host machine

Do not run Shopify CLI inside the Docker container. The container is meant for PostgreSQL and admin tooling only.

From the project root on your host machine:

```bash
cd /home/mit/Documents/all-in-b-company/aaa/product-recommender
yarn install
yarn shopify auth login
```

If the app is not under the correct Partner organization, switch to the Shopify organization that owns the app.

## 6. Run the app in development mode

```bash
yarn shopify app dev
```

This should be run on the host machine because the CLI opens a browser and needs access to the local operating system. A Docker container cannot reliably open `xdg-open`.

If you want the app to be public via ngrok, start the tunnel separately:

```bash
docker compose --profile ngrok up -d
```

Then make sure:

- `NGROK_AUTHTOKEN` is set
- the correct Shopify app config is being used
- `automatically_update_urls_on_dev = true` is enabled in the app config file

Example:

```toml
[build]
automatically_update_urls_on_dev = true
```

When `shopify app dev` runs, Shopify CLI will update callback and redirect URLs to match the active tunnel if permissions allow.

## 8. Prisma database setup

### Generate Prisma client and initialize the schema

```bash
cd /workspace/server
npx prisma generate
npx prisma migrate dev --name init
```

If you only want to sync the schema without creating a new migration:

```bash
npx prisma db push
```

## 9. Stop the stack

```bash
docker compose down
```

If you want to remove all data volumes as well:

```bash
docker compose down -v
```

## 10. Suggestions for production / live server setup

For live deployment, you should:

- avoid hardcoding development URLs in `.env`
- use environment variables specific to production
- store `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` in a secrets manager
- keep `shopify.app.*.toml` only for Shopify app metadata
- run the app on a server with a stable domain or reverse proxy

## 11. Important Shopify CLI configuration

The app config should look like this:

```toml
client_id = "..."
name = "product-recommender"
application_url = "https://your-public-url"
embedded = true

[build]
automatically_update_urls_on_dev = true
```

> With ngrok, the URL changes as the tunnel changes. Therefore, you should not hardcode the dev URL in `.env` when using `shopify app dev`.

## 12. Common issues and fixes

### Error: "You are not a member of the requested organization"

Cause: you are logged in to Shopify with an account that does not belong to the organization that owns the app.

Fix:

```bash
yarn shopify auth login
```

Then switch to the correct organization that owns the app.

### Error: ngrok is not running

Check `NGROK_AUTHTOKEN` in [.env.docker](.env.docker).

### Error: Prisma cannot connect to the database

Check:

```bash
docker compose ps
```

Then verify `DATABASE_URL` in [.env.docker](.env.docker).

---

If needed, you can use these commands for quick checks:

```bash
docker compose ps
docker compose logs -f postgres
docker compose logs -f ngrok
docker compose logs -f workspace
```
