# Running the project in the dev environment (Linux)

The project is a Shopify app using a yarn workspace:

- server/: NestJS + Prisma + PostgreSQL
- client/: React + Vite + Polaris

The dev command (Shopify CLI) starts the server and client at the same time, creates a tunnel, and automatically updates the app URLs. Docker is only used for PostgreSQL (and pgAdmin when needed). Do not run the Shopify CLI inside a container, because the CLI needs to open a browser on the host machine.

Note: this repo keeps several Shopify app configs. Development uses shopify.app.product-recommender.toml (app "product recommender"). The default shopify.app.toml points to the old app "starter-new-geon", which the current account cannot access, so every shopify command below must pass --config product-recommender.

## 1. Requirements

- Node.js 20
- Yarn 1 (the yarn -v command returns 1.x)
- Docker and Docker Compose
- Git
- A Shopify Partner account in the organization that owns the app (see client_id in shopify.app.product-recommender.toml)

Quick check:

```bash
node -v
yarn -v
docker compose version
```

## 2. Starting PostgreSQL

Run from the project root:

```bash
docker compose up -d postgres
docker compose ps
```

Use docker compose ps to check that postgres is healthy before moving on to the next step.

Note: docker-compose.yml mounts ./docker/postgres/init.sql. If this file is missing from the repo, Docker will mistakenly create a directory instead and Postgres will fail at startup. Check with ls docker/postgres/; if it is missing, create an empty file:

```bash
mkdir -p docker/postgres && touch docker/postgres/init.sql
```

Prisma migrate dev needs the recommender_shadow database. Prisma usually creates it automatically; if it reports an error, create it manually:

```bash
docker exec -it recommender-postgres psql -U recommender -d postgres -c "CREATE DATABASE recommender_shadow;"
```

After running:

- PostgreSQL: localhost:5432 (user/password/db: recommender)
- pgAdmin: http://localhost:5050 (only when running docker compose up -d instead of just postgres)

## 3. Creating the environment file

```bash
cp server/.env.example server/.env
```

Open server/.env and fill in GA4_PROPERTY_ID (a placeholder is fine for dev). Two important points:

- The database host is localhost because the app runs on the host machine. The hostnames postgres or db are only correct when the app runs inside the Docker network.
- Do not declare SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SCOPES, HOST, BACKEND_PORT, FRONTEND_PORT. The Shopify CLI injects these variables when the dev server runs.
- The .env file is ignored by git (see .gitignore); do not commit it.

## 4. Installing dependencies and migrating the database

```bash
yarn install
yarn migrate:dev
```

The yarn migrate:dev command is equivalent to yarn workspace server prisma migrate dev: it creates the migration and generates the Prisma Client (Prisma is pinned at 5.17.0 in server/package.json).

If you only want to sync the schema without creating a new migration:

```bash
yarn workspace server prisma db push
```

## 5. Logging in to Shopify

```bash
yarn shopify auth login
```

Select the correct organization that owns the app. If you select the wrong one, you will get the error "You are not a member of the requested organization".

## 6. Running in dev mode

```bash
yarn shopify app dev --config product-recommender --store product-recommender-dev.myshopify.com
```

The --config flag selects shopify.app.product-recommender.toml. Without it, the CLI reads the default shopify.app.toml (app "starter-new-geon") and fails with 403 "You are not a member of the requested organization". The --store flag selects the dev store; the config file has no dev_store_url, so omitting --store makes the CLI ask for a store interactively.

The Shopify CLI will:

- Create a tunnel and automatically update the URLs in shopify.app.product-recommender.toml, thanks to automatically_update_urls_on_dev = true.
- Start the server first, then the client, following the order web_directories = [ "server", "client" ]. This order is required for the Vite proxy to the server to work.
- Print the install link for the dev store (product-recommender-dev.myshopify.com). Open that link to install and use the app.

The API Swagger docs are available at /tools/swagger on the app URL.

## 7. Stopping the stack

Press Ctrl+C to stop the dev server, then:

```bash
docker compose down
docker compose down -v
```

The docker compose down command keeps the database data; docker compose down -v also deletes the database data.

## 8. Common errors

### 403 "You are not a member of the requested organization"

You are using the wrong app config or the wrong account. The default shopify.app.toml points to "starter-new-geon", which the current account cannot access. Always pass --config product-recommender to every shopify command, for example:

```bash
yarn shopify app dev --config product-recommender --store product-recommender-dev.myshopify.com
yarn shopify webhook trigger --config product-recommender --topic app/uninstalled --api-version 2026-10 --address /api/webhooks
```

### Prisma reports "Can't reach database server"

- Check the container with docker compose ps (is postgres healthy?).
- Check DATABASE_URL in server/.env: the host must be localhost, not postgres or db.

### Prisma reports a shadow database error

Create the database manually as described in section 2.

### Port 5432 is already in use

Another PostgreSQL is running on the machine. Check with ss -ltnp | grep 5432, then stop it or change the port in docker-compose.yml.

### shopify: command not found error

You have not run yarn install in the project root. The Shopify CLI is in the root project's dependencies.

### Old tunnel URL is not accessible

Do not hardcode the dev URL in .env. Each time the dev server runs, the CLI updates it with a new URL.

### Server stops because GA4_PROPERTY_ID is missing

Set a value in server/.env. A placeholder is fine for dev.

## 9. Suggestions for production deployment

- Do not hardcode the dev URL in .env; use separate environment variables for production.
- Store SHOPIFY_API_KEY and SHOPIFY_API_SECRET in a secrets manager.
- Keep only the Shopify app metadata in shopify.app.*.toml.
- Run the app on a server with a stable domain or a reverse proxy.
- See the Dockerfile and nixpacks.toml for the build and run commands (for example: yarn build:prod in server).